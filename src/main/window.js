const path = require('path');
const { app, BrowserWindow } = require('electron');
const { registerContextMenu } = require('./context-menu');

const ROOT = path.join(__dirname, '..', '..');

const createWindow = (state) => {
	if (state.win) return;
	const { screen } = require('electron');
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	const standardWindow = !!state.appSettings.standardWindow;

	state.win = new BrowserWindow({
		title: 'Promptly',
		width: standardWindow ? 1024 : width,
		height: standardWindow ? 768 : height,
		show: false,
		frame: standardWindow,
		transparent: !standardWindow,
		resizable: standardWindow,
		skipTaskbar: !standardWindow,
		icon: state.ASSETS.icon,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(ROOT, 'src', 'preload', 'webview.js'),
		},
	});

	if (standardWindow) {
		state.win.setMenu(null);
	}
	registerContextMenu(state.win);

	state.win.loadURL(state.URLS[state.currentAssistant] || state.URLS.Copilot);

	state.win.webContents.on('did-finish-load', () => {
		if (state.currentAssistant === 'Copilot') ensureCopilotLoaded(state);
	});

	state.win.on('close', e => {
		if (!app.isQuitting) {
			e.preventDefault();
			toggleWindow(state, false);
		}
	});
};

const createSettingsWindow = (state) => {
	if (state.settingsWin) {
		state.settingsWin.focus();
		return;
	}

	state.settingsWin = new BrowserWindow({
		title: 'Promptly',
		width: 900,
		height: 680,
		frame: false,
		transparent: true,
		resizable: false,
		icon: state.ASSETS.icon,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(ROOT, 'src', 'preload', 'settings.js'),
		},
	});

	registerContextMenu(state.settingsWin);

	state.settingsWin.loadFile(path.join(ROOT, 'src', 'renderer', 'settings', 'index.html'));

	state.settingsWin.on('closed', () => {
		state.settingsWin = null;
	});
};

const ensureCopilotLoaded = (state, retries = 0) => {
	if (!state.win || retries > 10) return;
	state.win.webContents
		.executeJavaScript(`!!document.getElementById('userInput')`)
		.then(loaded => {
			if (!loaded) {
				console.log(`Waiting for Copilot... (${retries})`);
				setTimeout(() => ensureCopilotLoaded(state, retries + 1), 1500);
			}
		})
		.catch(() => {});
};

const toggleWindow = (state, show) => {
	const { screen } = require('electron');
	if (!state.win || state.isAnimating) return;

	const isVisible = state.win.isVisible();
	const shouldShow = typeof show === 'boolean' ? show : !isVisible;

	if (shouldShow === isVisible) return;

	state.isAnimating = true;
	if (shouldShow) {
		state.win.setBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds);
		state.win.setOpacity(0);
		state.win.show();
		state.win.focus();
	}

	let opacity = shouldShow ? 0 : 1;
	const step = shouldShow ? 0.1 : -0.1;

	const animate = setInterval(() => {
		opacity += step;
		if ((shouldShow && opacity >= 1) || (!shouldShow && opacity <= 0)) {
			clearInterval(animate);
			state.win.setOpacity(shouldShow ? 1 : 0);
			if (!shouldShow) state.win.hide();
			state.isAnimating = false;
		} else {
			state.win.setOpacity(opacity);
		}
	}, 15);
};

module.exports = { createWindow, createSettingsWindow, toggleWindow, ensureCopilotLoaded };
