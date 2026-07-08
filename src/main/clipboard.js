const { clipboard, BrowserWindow, screen } = require('electron');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);
const { addHistoryItem } = require('./history');
const { toggleWindow } = require('./window');

const ROOT = path.join(__dirname, '..', '..');

const isWebChat = id => ['Copilot', 'Arena', 'Gemini', 'Perplexity', 'Monica', 'Qwen'].includes(id);

let loadingWindow = null;

const showLoadingIndicator = (theme = 'dark', cursorPoint = null, modelName = '', promptTitle = '') => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.focus();
        return;
    }

    // Use provided cursor position or get current position
    const point = cursorPoint || screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const { width: workWidth, height: workHeight } = display.workAreaSize;
    const displayBounds = display.bounds;
    const workArea = display.workArea;
    
    // Calculate position relative to work area
    let posX = point.x - displayBounds.x - 90; // Center horizontally
    let posY = point.y - displayBounds.y + 25; // Show below cursor
    
    // Ensure within work area bounds
    posX = Math.max(workArea.x + 10, Math.min(posX, workArea.x + workWidth - 210));
    posY = Math.max(workArea.y + 10, Math.min(posY, workArea.y + workHeight - 42));
    
    loadingWindow = new BrowserWindow({
        width: 200,
        height: 32,
        x: displayBounds.x + posX,
        y: displayBounds.y + posY,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    loadingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    loadingWindow.setAlwaysOnTop(true, 'screen-saver');
    
    loadingWindow.loadFile(path.join(ROOT, 'src', 'renderer', 'loading', 'index.html'), {
        query: { theme, model: modelName, title: promptTitle }
    });

    loadingWindow.on('closed', () => {
        loadingWindow = null;
    });
};

const hideLoadingIndicator = () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
        loadingWindow = null;
    }
};

const askAI = async (state, promptPrefix, autoSubmit = true, promptTitle = '') => {
	if (process.platform !== 'win32') return console.log('Windows only feature');

	// Capture cursor position immediately when shortcut triggers
	const cursorPosition = screen.getCursorScreenPoint();

	const oldClipboard = clipboard.readText();
	clipboard.writeText('');

	try {
		const script = `powershell -command "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^{c}')"`;
		await execAsync(script);

		let capturedText = '';
		for (let i = 0; i < 20; i++) {
			capturedText = clipboard.readText();
			if (capturedText) break;
			await new Promise(r => setTimeout(r, 50));
		}

		if (!capturedText) {
			clipboard.writeText(oldClipboard);
			return;
		}

		const fullPrompt = `${promptPrefix}:\n${capturedText}`;

		// Check if we're in API mode
		if (!isWebChat(state.currentAssistant)) {
			// API mode: Show loading indicator and make request
			const provider = state.appSettings.apiProviders && state.appSettings.apiProviders.find(p => p.id === state.currentAssistant);
			if (!provider) {
				console.error('API Provider not found:', state.currentAssistant);
				clipboard.writeText(oldClipboard);
				return;
			}

			const theme = state.appSettings.theme || 'dark';
			showLoadingIndicator(theme, cursorPosition, provider.model, promptTitle);

			try {
				const messages = [];
				if (provider.systemPrompt && provider.systemPrompt.trim()) {
					messages.push({ role: 'system', content: provider.systemPrompt.trim() });
				}
				messages.push({ role: 'user', content: fullPrompt });

				let url = provider.baseUrl;
				if (!url.endsWith('/chat/completions') && !url.includes('/chat/completions?')) {
					url = url.replace(/\/$/, '') + '/chat/completions';
				}

				const response = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${provider.apiKey}`
					},
					body: JSON.stringify({
						model: provider.model,
						messages: messages
					})
				});

				hideLoadingIndicator();

				if (!response.ok) {
					const errText = await response.text();
					let errMsg = `HTTP Error ${response.status}`;
					try {
						const errJson = JSON.parse(errText);
						if (errJson.error && errJson.error.message) {
							errMsg = errJson.error.message;
						}
					} catch (e) {
						if (errText) errMsg = errText.substring(0, 100);
					}
					console.error('API request failed:', errMsg);
					addHistoryItem(state, fullPrompt);
					clipboard.writeText(oldClipboard);
					return;
				}

				const data = await response.json();
				const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
				if (content) {
					addHistoryItem(state, fullPrompt, content);
					// Paste the response back
					clipboard.writeText(content);
					await new Promise(r => setTimeout(r, 100));
					const pasteScript = `powershell -command "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^{v}')"`;
					await execAsync(pasteScript);
				} else {
					console.error('Unexpected API response format');
					addHistoryItem(state, fullPrompt);
					clipboard.writeText(oldClipboard);
				}
			} catch (err) {
				hideLoadingIndicator();
				console.error('API request error:', err);
				addHistoryItem(state, fullPrompt);
				clipboard.writeText(oldClipboard);
			}
		} else {
			// Web chat mode: Show window and send to web chat
			toggleWindow(state, true);
			clipboard.writeText(fullPrompt);
			addHistoryItem(state, fullPrompt);

			if (state.win) {
				state.win.webContents.focus();
				state.win.webContents.send('ask-ai', { text: fullPrompt, submit: autoSubmit });
			}
		}
	} catch (err) {
		hideLoadingIndicator();
		console.error('Clipboard Action Failed:', err);
		clipboard.writeText(oldClipboard);
	}
};

module.exports = { askAI };
