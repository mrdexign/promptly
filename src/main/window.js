const path = require('path');
const { app, BrowserWindow, screen } = require('electron');
const { registerContextMenu } = require('./context-menu');

const ROOT = path.join(__dirname, '..', '..');

const createWindow = state => {
	if (state.win) return;
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

	const isWebChat = id => ['Copilot', 'Arena', 'Gemini', 'Perplexity', 'Monica', 'Qwen'].includes(id);
	if (isWebChat(state.currentAssistant)) {
		state.win.loadURL(state.URLS[state.currentAssistant] || state.URLS.Copilot);
	} else {
		// API mode: Load blank page (API requests are handled in clipboard.js)
		state.win.loadURL('about:blank');
	}

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

const createSettingsWindow = state => {
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

const openApiChatWindow = (state) => {
	if (state.apiChatWin && !state.apiChatWin.isDestroyed()) {
		state.apiChatWin.focus();
		return;
	}

	const point = screen.getCursorScreenPoint();
	const display = screen.getDisplayNearestPoint(point);
	const { width: workWidth, height: workHeight } = display.workAreaSize;
	const workArea = display.workArea;
	const standardWindow = !!state.appSettings.standardWindow;

	const winWidth = standardWindow ? 620 : 620;
	const winHeight = standardWindow ? 680 : 680;
	const posX = workArea.x + Math.floor((workWidth - winWidth) / 2);
	const posY = workArea.y + Math.floor((workHeight - winHeight) / 2);

	state.apiChatWin = new BrowserWindow({
		title: 'Promptly Chat',
		width: winWidth,
		height: winHeight,
		x: posX,
		y: posY,
		frame: standardWindow,
		transparent: !standardWindow,
		resizable: standardWindow,
		minWidth: 360,
		minHeight: 480,
		skipTaskbar: !standardWindow,
		icon: state.ASSETS.icon,
		backgroundColor: state.appSettings.theme === 'light' ? '#FAFAFA' : '#09090B',
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(ROOT, 'src', 'preload', 'api-chat.js'),
		},
	});

	if (standardWindow) {
		state.apiChatWin.setMenu(null);
	}
	registerContextMenu(state.apiChatWin);

	state.apiChatWin.loadFile(path.join(ROOT, 'src', 'renderer', 'api-chat', 'index.html'));

	state.apiChatWin.on('closed', () => {
		state.apiChatWin = null;
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

const toggleApiChatWindow = (state) => {
	if (!state.apiChatWin || state.apiChatWin.isDestroyed()) {
		openApiChatWindow(state);
		return;
	}

	if (state.isAnimating) return;

	const isVisible = state.apiChatWin.isVisible();
	const shouldShow = !isVisible;

	state.isAnimating = true;
	if (shouldShow) {
		const point = screen.getCursorScreenPoint();
		const display = screen.getDisplayNearestPoint(point);
		const workArea = display.workArea;
		const [winWidth, winHeight] = state.apiChatWin.getSize();
		state.apiChatWin.setPosition(
			workArea.x + Math.floor((workArea.width - winWidth) / 2),
			workArea.y + Math.floor((workArea.height - winHeight) / 2)
		);
		state.apiChatWin.setOpacity(0);
		state.apiChatWin.show();
		state.apiChatWin.focus();
	}

	let opacity = shouldShow ? 0 : 1;
	const step = shouldShow ? 0.1 : -0.1;

	const animate = setInterval(() => {
		opacity += step;
		if ((shouldShow && opacity >= 1) || (!shouldShow && opacity <= 0)) {
			clearInterval(animate);
			state.apiChatWin.setOpacity(shouldShow ? 1 : 0);
			if (!shouldShow) state.apiChatWin.hide();
			state.isAnimating = false;
		} else {
			state.apiChatWin.setOpacity(opacity);
		}
	}, 15);
};

const toggleSettingsWindow = (state) => {
	if (!state.settingsWin || state.settingsWin.isDestroyed()) {
		createSettingsWindow(state);
		return;
	}

	if (state.settingsWin.isVisible()) {
		state.settingsWin.hide();
	} else {
		state.settingsWin.show();
		state.settingsWin.focus();
	}
};

module.exports = { createWindow, createSettingsWindow, toggleWindow, toggleApiChatWindow, openApiChatWindow, ensureCopilotLoaded, toggleSettingsWindow };
