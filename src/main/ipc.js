const fs = require('fs');
const path = require('path');
const { app, ipcMain, nativeTheme, shell, BrowserWindow } = require('electron');
const { getDefaultPrompts, saveSettingsToFile } = require('./settings-store');
const { loadHistory, saveHistory } = require('./history');
const { isNewerVersion, startUpdate } = require('./updater');

const ROOT = path.join(__dirname, '..', '..');

const registerIpcHandlers = (state, deps) => {
	ipcMain.handle('get-settings', async () => {
		try {
			const enabled = await state.autoLauncher.isEnabled();
			state.appSettings.autoLaunch = enabled;
		} catch (err) {
			console.error('Failed to get auto launcher state:', err);
		}
		return state.appSettings;
	});

	ipcMain.handle('save-settings', async (_, newSettings) => {
		const prevStandardWindow = state.appSettings.standardWindow;

		state.appSettings = newSettings;
		nativeTheme.themeSource = newSettings.theme || 'dark';

		try {
			const currentlyEnabled = await state.autoLauncher.isEnabled();
			if (newSettings.autoLaunch && !currentlyEnabled) {
				await state.autoLauncher.enable();
			} else if (!newSettings.autoLaunch && currentlyEnabled) {
				await state.autoLauncher.disable();
			}
		} catch (err) {
			console.error('Auto-launch sync failed:', err);
		}

		saveSettingsToFile(state.ASSETS, state.appSettings);

		if (state.win && state.currentAssistant !== newSettings.currentAssistant) {
			state.currentAssistant = newSettings.currentAssistant;
			const isWebChat = (id) => ['Copilot', 'Arena', 'Gemini', 'Perplexity', 'Monica', 'Qwen'].includes(id);
			if (isWebChat(state.currentAssistant)) {
				state.win.loadURL(state.URLS[state.currentAssistant] || state.URLS.Copilot);
			} else {
				// API mode: Load blank page
				state.win.loadURL('about:blank');
			}
			// Notify API chat window of provider change
			if (state.apiChatWin && !state.apiChatWin.isDestroyed()) {
				const provider = state.appSettings.apiProviders && state.appSettings.apiProviders.find(p => p.id === state.currentAssistant);
				state.apiChatWin.webContents.send('provider-changed', provider || null);
			}
		}
		state.currentAssistant = newSettings.currentAssistant;

		deps.registerShortcuts(state);
		await deps.createTray(state);

		if (state.win && prevStandardWindow !== newSettings.standardWindow) {
			state.win.destroy();
			state.win = null;
			deps.createWindow(state);
		}

		if (state.apiChatWin && !state.apiChatWin.isDestroyed() && prevStandardWindow !== newSettings.standardWindow) {
			const wasVisible = state.apiChatWin.isVisible();
			state.apiChatWin.destroy();
			state.apiChatWin = null;
			if (wasVisible) {
				deps.openApiChatWindow(state);
			}
		}

		return { success: true };
	});

	ipcMain.on('close-settings', () => {
		if (state.settingsWin) {
			state.settingsWin.close();
		}
	});

	ipcMain.handle('get-app-version', () => app.getVersion());
	ipcMain.handle('get-default-prompts', () => getDefaultPrompts());

	ipcMain.handle('get-history', () => loadHistory(state));

	ipcMain.handle('clear-history', () => {
		saveHistory(state, []);
		return [];
	});

	ipcMain.handle('delete-history-item', (_, id) => {
		const items = loadHistory(state);
		const filtered = items.filter(item => item.id !== id);
		saveHistory(state, filtered);
		return filtered;
	});

	ipcMain.handle('check-update-status', async () => {
		try {
			const response = await fetch('https://api.github.com/repos/mrdexign/promptly/releases/latest', {
				headers: { 'User-Agent': 'Promptly-Updater' }
			});
			if (!response.ok) {
				return { success: false, error: 'Could not fetch update information.' };
			}
			const data = await response.json();
			const latestVersion = data.tag_name.replace(/^v/, '');
			const currentVersion = app.getVersion();

			if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
				const exeAsset = data.assets.find(asset => asset.name.endsWith('.exe'));
				if (exeAsset) {
					state.updateState.available = true;
					state.updateState.version = latestVersion;
					state.updateState.downloadUrl = exeAsset.browser_download_url;
					return {
						success: true,
						updateAvailable: true,
						latestVersion,
						currentVersion,
						downloadUrl: exeAsset.browser_download_url
					};
				}
			}

			return {
				success: true,
				updateAvailable: false,
				currentVersion
			};
		} catch (err) {
			console.error('Update check failed:', err);
			return { success: false, error: err.message };
		}
	});

	ipcMain.on('start-update', () => startUpdate(state));

	ipcMain.on('open-about-page', () => {
		shell.openExternal('https://github.com/mrdexign/promptly');
	});

	ipcMain.handle('make-api-request', async (_, providerId, promptText) => {
		try {
			const provider = state.appSettings.apiProviders && state.appSettings.apiProviders.find(p => p.id === providerId);
			if (!provider) {
				return { success: false, error: 'API Provider not found.' };
			}

			const messages = [];
			if (provider.systemPrompt && provider.systemPrompt.trim()) {
				messages.push({ role: 'system', content: provider.systemPrompt.trim() });
			}
			messages.push({ role: 'user', content: promptText });

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
				return { success: false, error: errMsg };
			}

			const data = await response.json();
			const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
			if (content) {
				return { success: true, text: content };
			} else {
				return { success: false, error: 'Unexpected API response format.' };
			}
		} catch (err) {
			console.error('API request error:', err);
			return { success: false, error: err.message || 'Network error occurred.' };
		}
	});

	ipcMain.on('paste-response', async (_, text) => {
		const { toggleWindow } = require('./window');
		toggleWindow(state, false);

		const { clipboard } = require('electron');
		clipboard.writeText(text);

		await new Promise(r => setTimeout(r, 350));

		const util = require('util');
		const { exec } = require('child_process');
		const execAsync = util.promisify(exec);

		try {
			const script = `powershell -command "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^{v}')"`;
			await execAsync(script);
		} catch (err) {
			console.error('Failed to paste text back to target application:', err);
		}
	});

	ipcMain.handle('get-api-chat-provider', async () => {
		const provider = state.appSettings.apiProviders && state.appSettings.apiProviders.find(p => p.id === state.currentAssistant);
		return provider || null;
	});

	ipcMain.handle('make-api-chat-request', async (_, providerId, chatMessages) => {
		try {
			const provider = state.appSettings.apiProviders && state.appSettings.apiProviders.find(p => p.id === providerId);
			if (!provider) {
				return { success: false, error: 'API Provider not found.' };
			}

			const apiMessages = [];
			if (provider.systemPrompt && provider.systemPrompt.trim()) {
				apiMessages.push({ role: 'system', content: provider.systemPrompt.trim() });
			}
			chatMessages.forEach(msg => {
				apiMessages.push({ role: msg.role, content: msg.content });
			});

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
					messages: apiMessages,
					stream: true
				})
			});

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
				return { success: false, error: errMsg };
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let fullContent = '';
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop();

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') continue;
						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
							if (delta) {
								fullContent += delta;
								if (state.apiChatWin && !state.apiChatWin.isDestroyed()) {
									state.apiChatWin.webContents.send('stream-chunk', delta);
								}
							}
						} catch (e) {}
					}
				}
			}

			return { success: true, text: fullContent };
		} catch (err) {
			console.error('API chat request error:', err);
			return { success: false, error: err.message || 'Network error occurred.' };
		}
	});

	ipcMain.on('close-api-chat', () => {
		if (state.apiChatWin && !state.apiChatWin.isDestroyed()) {
			state.apiChatWin.close();
			state.apiChatWin = null;
		}
	});

	ipcMain.on('minimize-api-chat', () => {
		if (state.apiChatWin && !state.apiChatWin.isDestroyed()) {
			state.apiChatWin.minimize();
		}
	});

	ipcMain.handle('toggle-maximize-api-chat', () => {
		if (state.apiChatWin && !state.apiChatWin.isDestroyed()) {
			const { screen } = require('electron');
			const point = screen.getCursorScreenPoint();
			const display = screen.getDisplayNearestPoint(point);
			const workArea = display.workArea;

			if (state.apiChatMaximized) {
				const winWidth = 620;
				const winHeight = 680;
				state.apiChatWin.setBounds({
					x: workArea.x + Math.floor((workArea.width - winWidth) / 2),
					y: workArea.y + Math.floor((workArea.height - winHeight) / 2),
					width: winWidth,
					height: winHeight
				});
				state.apiChatMaximized = false;
				return false;
			} else {
				state.apiChatWin.setBounds({
					x: workArea.x,
					y: workArea.y,
					width: workArea.width,
					height: workArea.height
				});
				state.apiChatMaximized = true;
				return true;
			}
		}
		return false;
	});

	ipcMain.handle('get-api-providers', async () => {
		return state.appSettings.apiProviders || [];
	});

	ipcMain.on('set-api-chat-provider', (_, providerId) => {
		state.currentAssistant = providerId;
		saveSettingsToFile(state.ASSETS, state.appSettings);
	});

	ipcMain.handle('get-theme', async () => {
		return state.appSettings.theme || 'dark';
	});

	ipcMain.handle('get-standard-window', async () => {
		return !!state.appSettings.standardWindow;
	});

	ipcMain.handle('fetch-models', async (_, baseUrl, apiKey) => {
		try {
			let url = baseUrl.trim();
			if (!url.endsWith('/models') && !url.includes('/models?')) {
				url = url.replace(/\/$/, '') + '/models';
			}
			
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${apiKey.trim()}`
				}
			});
			
			if (!response.ok) {
				return { success: false, error: `HTTP Error ${response.status}` };
			}
			
			const data = await response.json();
			if (data && Array.isArray(data.data)) {
				const models = data.data.map(m => m.id);
				return { success: true, models };
			}
			
			return { success: false, error: 'Unexpected API response structure.' };
		} catch (err) {
			console.error('Fetch models error:', err);
			return { success: false, error: err.message || 'Network error occurred.' };
		}
	});
};

const setupAutoReload = () => {
	try {
		const watchDir = path.join(__dirname, '..', '..');
		let watchTimeout = null;

		fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
			if (filename) {
				const normalizedFile = filename.replace(/\\/g, '/');

				if (
					normalizedFile.includes('node_modules') ||
					normalizedFile.includes('.git') ||
					normalizedFile.includes('out') ||
					normalizedFile.includes('assistant-config.json') ||
					normalizedFile.endsWith('.tmp')
				) {
					return;
				}

				if (watchTimeout) clearTimeout(watchTimeout);
				watchTimeout = setTimeout(() => {
					console.log(`Auto Reload: ${normalizedFile} changed`);
					if (normalizedFile === 'src/main/index.js') {
						app.relaunch();
						app.exit(0);
					} else {
						BrowserWindow.getAllWindows().forEach(w => {
							if (!w.isDestroyed()) {
								w.webContents.reloadIgnoringCache();
							}
						});
					}
				}, 100);
			}
		});
	} catch (err) {
		console.error('Failed to setup auto-reload:', err);
	}
};

module.exports = { registerIpcHandlers, setupAutoReload };
