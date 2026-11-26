const { clipboard, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);
const { addHistoryItem } = require('./history');
const { toggleWindow, createWindow } = require('./window');
const { isWebChat, getProvider } = require('./providers-config');

const ROOT = path.join(__dirname, '..', '..');



let loadingWindow = null;

const AUTO_PASTE_DIRECTIVE =
	'\n\nReply with only the final result. Do not add explanations, notes, greetings, introductions, or markdown formatting.';

const webChatRequests = new Map();
let activeWebChatRequest = null;

ipcMain.on('web-chat-result', (_, { requestId, text }) => {
	const request = webChatRequests.get(requestId);
	if (!request) return;
	webChatRequests.delete(requestId);
	clearTimeout(request.timer);
	request.resolve(text || null);
});

const requestWebChatText = (state, text, requestId) => new Promise(resolve => {
	const previous = webChatRequests.get(activeWebChatRequest);
	if (previous) {
		clearTimeout(previous.timer);
		webChatRequests.delete(activeWebChatRequest);
		previous.resolve(null);
	}
	activeWebChatRequest = requestId;

	const timer = setTimeout(() => {
		webChatRequests.delete(requestId);
		resolve(null);
	}, 125000);
	webChatRequests.set(requestId, { resolve, timer });

	const send = () => state.win.webContents.send('ask-ai', { text, submit: true, capture: true, requestId });
	if (state.win.webContents.isLoading()) state.win.webContents.once('did-finish-load', send);
	else send();
});

const showLoadingIndicator = (theme = 'dark', cursorPoint = null, modelName = '', promptTitle = '') => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.focus();
        return;
    }

    // Use the display under the cursor, pinned to the top center of its work area
    const point = cursorPoint || screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(point);
    const width = 248;
    const height = 72;
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = workArea.y + 12;

    loadingWindow = new BrowserWindow({
        width,
        height,
        x,
        y,
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
			const capture = getProvider(state.currentAssistant)?.webview?.capture;
			if (state.appSettings.webChatAutoPaste && capture) {
				// background web chat: answer comes back without showing the page
				const theme = state.appSettings.theme || 'dark';
				showLoadingIndicator(theme, cursorPosition, state.currentAssistant, promptTitle);
				if (!state.win) createWindow(state);

				const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
				const answer = await requestWebChatText(state, `${fullPrompt}${AUTO_PASTE_DIRECTIVE}`, requestId);
				if (activeWebChatRequest !== requestId) return;
				hideLoadingIndicator();

				if (answer) {
					addHistoryItem(state, fullPrompt, answer);
					clipboard.writeText(answer);
					await new Promise(r => setTimeout(r, 100));
					try {
						await execAsync(`powershell -command "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^{v}')"`);
					} catch (err) {
						console.error('Failed to paste response back to target application:', err);
					}
				} else {
					addHistoryItem(state, fullPrompt);
					clipboard.writeText(oldClipboard);
					if (state.win) toggleWindow(state, true);
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
		}
	} catch (err) {
		hideLoadingIndicator();
		console.error('Clipboard Action Failed:', err);
		clipboard.writeText(oldClipboard);
	}
};

module.exports = { askAI };
