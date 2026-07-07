const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, globalShortcut, nativeTheme } = require('electron');
const AutoLaunch = require('auto-launch');

if (require('electron-squirrel-startup')) app?.quit();

const ROOT = path.join(__dirname, '..', '..');

const ASSETS = {
	icon: path.join(ROOT, 'assets', 'icons', 'icon.ico'),
	config: path.join(app.getPath('userData'), 'assistant-config.json'),
	history: path.join(app.getPath('userData'), 'assistant-history.json'),
};

const URLS = {
	Copilot: 'https://copilot.microsoft.com',
	Arena: 'https://arena.ai/text/direct',
	Gemini: 'https://gemini.google.com',
	Perplexity: 'https://perplexity.ai',
	Monica: 'https://monica.im/home',
	Qwen: 'https://chat.qwen.ai',
};

const autoLauncher = new AutoLaunch({ name: 'Promptly', path: app.getPath('exe') });
if (!app.isPackaged) autoLauncher.disable();

const state = {
	win: null,
	settingsWin: null,
	tray: null,
	isAnimating: false,
	updateState: {
		checked: false,
		available: false,
		version: null,
		downloadUrl: null,
		status: 'idle',
		progress: 0,
		error: null,
	},
	ASSETS,
	URLS,
	autoLauncher,
};

const { loadSettings } = require('./settings-store');
const { createWindow } = require('./window');
const { createTray } = require('./tray');
const { registerShortcuts } = require('./shortcuts');
const { checkForUpdates } = require('./updater');
const { registerIpcHandlers, setupAutoReload } = require('./ipc');

state.appSettings = loadSettings(state.ASSETS);
nativeTheme.themeSource = state.appSettings.theme || 'dark';
state.currentAssistant = state.appSettings.currentAssistant;

registerIpcHandlers(state, { createWindow, createTray, registerShortcuts });

app.whenReady().then(async () => {
	createWindow(state);
	await createTray(state);
	checkForUpdates(state);
	setInterval(() => checkForUpdates(state), 6 * 60 * 60 * 1000);

	try {
		const enabled = await autoLauncher.isEnabled();
		if (state.appSettings.autoLaunch !== enabled) {
			if (state.appSettings.autoLaunch) await autoLauncher.enable();
			else await autoLauncher.disable();
		}
	} catch (err) {
		console.error('Failed to sync auto-launch on startup:', err);
	}

	registerShortcuts(state);

	if (!app.isPackaged) {
		setupAutoReload(state);
	}
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow(state);
});
