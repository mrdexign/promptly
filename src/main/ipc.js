const fs = require('fs');
const path = require('path');
const { app, ipcMain, nativeTheme, shell, BrowserWindow } = require('electron');
const { getDefaultPrompts, saveSettingsToFile } = require('./settings-store');
const { loadHistory, saveHistory } = require('./history');
const { isNewerVersion, startUpdate } = require('./updater');

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
			state.win.loadURL(state.URLS[state.currentAssistant] || state.URLS.Copilot);
		}
		state.currentAssistant = newSettings.currentAssistant;

		deps.registerShortcuts(state);
		await deps.createTray(state);

		if (state.win && prevStandardWindow !== newSettings.standardWindow) {
			state.win.destroy();
			state.win = null;
			deps.createWindow(state);
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
