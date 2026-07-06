const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const AutoLaunch = require('auto-launch');
const { app, BrowserWindow, globalShortcut, screen, Tray, Menu, clipboard, shell, dialog, ipcMain, nativeTheme } = require('electron');
const execAsync = util.promisify(exec);

// --- Configuration & Constants ---
if (require('electron-squirrel-startup')) app?.quit();

const ASSETS = {
	icon: path.join(__dirname, 'icons/icon.ico'),
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

// --- State Management ---
let win = null;
let settingsWin = null;
let tray = null;
let isAnimating = false;

// --- Update State ---
const updateState = {
	checked: false,
	available: false,
	version: null,
	downloadUrl: null,
	status: 'idle', // 'idle' | 'downloading' | 'error'
	progress: 0,
	error: null,
};

// --- Settings Management ---
const getDefaultPrompts = () => [
	{ id: 'toggle', name: 'Toggle Window', shortcut: 'Alt+C', text: '', autoSubmit: false, isSystem: true },
	{ id: 'rephrase', name: 'Rephrase', shortcut: 'Alt+R', text: 'Rephrase', autoSubmit: true },
	{ id: 'clipboard', name: 'Clipboard (Paste only)', shortcut: 'Alt+M', text: 'Clipboard', autoSubmit: false },
	{ id: 'task', name: 'Task Title Extractor', shortcut: 'Alt+T', text: 'Extract the task title in one line', autoSubmit: true },
	{ id: 'grammar', name: 'Grammar Checker', shortcut: 'Alt+G', text: 'Spot grammar mistakes and share the lesson', autoSubmit: true },
	{ id: 'translate', name: 'Translator', shortcut: 'Alt+L', text: 'Translate to Persian and identify critical vocab', autoSubmit: true }
];

const loadSettings = () => {
	try {
		if (fs.existsSync(ASSETS.config)) {
			const data = JSON.parse(fs.readFileSync(ASSETS.config, 'utf8'));
			if (data && typeof data === 'object') {
				if (!data.prompts) {
					data.prompts = getDefaultPrompts();
				}
				if (data.standardWindow === undefined) data.standardWindow = false;
				if (data.theme === undefined) data.theme = 'dark';
				if (data.historyCleanup === undefined) data.historyCleanup = 'daily';
				return data;
			}
		}
	} catch (err) {
		console.error('Failed to load settings:', err);
	}

	const defaults = {
		currentAssistant: 'Copilot',
		autoLaunch: false,
		prompts: getDefaultPrompts(),
		standardWindow: false,
		theme: 'dark',
		historyCleanup: 'daily',
	};
	try {
		fs.writeFileSync(ASSETS.config, JSON.stringify(defaults, null, 2));
	} catch (err) {
		console.error('Failed to write default settings:', err);
	}
	return defaults;
};

let appSettings = loadSettings();
nativeTheme.themeSource = appSettings.theme || 'dark';
let currentAssistant = appSettings.currentAssistant;

const registerShortcuts = () => {
	globalShortcut.unregisterAll();
	
	appSettings.prompts.forEach(item => {
		if (!item.shortcut) return;
		
		try {
			const success = globalShortcut.register(item.shortcut, () => {
				if (item.id === 'toggle') {
					toggleWindow();
				} else {
					askAI(item.text, item.autoSubmit);
				}
			});
			if (!success) {
				console.error(`Failed to register shortcut: ${item.shortcut} for ${item.name}`);
			}
		} catch (err) {
			console.error(`Error registering shortcut: ${item.shortcut}`, err);
		}
	});
};

const registerContextMenu = (browserWindow) => {
	if (!browserWindow) return;
	browserWindow.webContents.on('context-menu', (e, params) => {
		const menu = Menu.buildFromTemplate([
			{ role: 'cut', label: 'Cut', enabled: params.editFlags ? params.editFlags.canCut : false },
			{ role: 'copy', label: 'Copy', enabled: params.editFlags ? params.editFlags.canCopy : false },
			{ role: 'paste', label: 'Paste', enabled: params.editFlags ? params.editFlags.canPaste : false },
			{ type: 'separator' },
			{ role: 'selectAll', label: 'Select All', enabled: params.editFlags ? params.editFlags.canSelectAll : false }
		]);
		menu.popup({ window: browserWindow, x: params.x, y: params.y });
	});
};

const createSettingsWindow = () => {
	if (settingsWin) {
		settingsWin.focus();
		return;
	}

	settingsWin = new BrowserWindow({
		title: 'Promptly',
		width: 900,
		height: 680,
		frame: false,
		transparent: true,
		resizable: false,
		icon: ASSETS.icon,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload-settings.js'),
		},
	});

	registerContextMenu(settingsWin);

	settingsWin.loadFile(path.join(__dirname, 'settings.html'));

	settingsWin.on('closed', () => {
		settingsWin = null;
	});
};

// --- IPC Communication for Settings ---
ipcMain.handle('get-settings', async () => {
	try {
		const enabled = await autoLauncher.isEnabled();
		appSettings.autoLaunch = enabled;
	} catch (err) {
		console.error('Failed to get auto launcher state:', err);
	}
	return appSettings;
});

ipcMain.handle('save-settings', async (_, newSettings) => {
	const prevStandardWindow = appSettings.standardWindow;

	appSettings = newSettings;
	nativeTheme.themeSource = newSettings.theme || 'dark';

	try {
		const currentlyEnabled = await autoLauncher.isEnabled();
		if (newSettings.autoLaunch && !currentlyEnabled) {
			await autoLauncher.enable();
		} else if (!newSettings.autoLaunch && currentlyEnabled) {
			await autoLauncher.disable();
		}
	} catch (err) {
		console.error('Auto-launch sync failed:', err);
	}

	try {
		fs.writeFileSync(ASSETS.config, JSON.stringify(appSettings, null, 2));
	} catch (err) {
		console.error('Failed to write settings:', err);
	}

	if (win && currentAssistant !== newSettings.currentAssistant) {
		currentAssistant = newSettings.currentAssistant;
		win.loadURL(URLS[currentAssistant] || URLS.Copilot);
	}
	currentAssistant = newSettings.currentAssistant;

	registerShortcuts();
	await createTray();

	if (win && prevStandardWindow !== newSettings.standardWindow) {
		win.destroy();
		win = null;
		createWindow();
	}

	return { success: true };
});

ipcMain.on('close-settings', () => {
	if (settingsWin) {
		settingsWin.close();
	}
});

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-default-prompts', () => getDefaultPrompts());

// --- History IPC Handlers ---
ipcMain.handle('get-history', () => {
	return loadHistory();
});

ipcMain.handle('clear-history', () => {
	saveHistory([]);
	return [];
});

ipcMain.handle('delete-history-item', (_, id) => {
	const items = loadHistory();
	const filtered = items.filter(item => item.id !== id);
	saveHistory(filtered);
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
				updateState.available = true;
				updateState.version = latestVersion;
				updateState.downloadUrl = exeAsset.browser_download_url;
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

ipcMain.on('start-update', () => {
	startUpdate();
});

ipcMain.on('open-about-page', () => {
	shell.openExternal('https://github.com/mrdexign/promptly');
});

const createWindow = () => {
	if (win) return;
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	const standardWindow = !!appSettings.standardWindow;

	win = new BrowserWindow({
		title: 'Promptly',
		width: standardWindow ? 1024 : width,
		height: standardWindow ? 768 : height,
		show: false,
		frame: standardWindow,
		transparent: !standardWindow,
		resizable: standardWindow,
		skipTaskbar: !standardWindow,
		icon: ASSETS.icon,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	if (standardWindow) {
		win.setMenu(null);
	}
	registerContextMenu(win);

	win.loadURL(URLS[currentAssistant] || URLS.Copilot);

	// Handle Copilot's specific lazy-loading issues
	win.webContents.on('did-finish-load', () => {
		if (currentAssistant === 'Copilot') ensureCopilotLoaded();
	});

	win.on('close', e => {
		if (!app.isQuitting) {
			e.preventDefault();
			toggleWindow(false);
		}
	});
};

// Retry logic to ensure Copilot's DOM is ready before user interaction
const ensureCopilotLoaded = (retries = 0) => {
	if (!win || retries > 10) return;
	win.webContents
		.executeJavaScript(`!!document.getElementById('userInput')`)
		.then(loaded => {
			if (!loaded) {
				console.log(`Waiting for Copilot... (${retries})`);
				setTimeout(() => ensureCopilotLoaded(retries + 1), 1500);
			}
		})
		.catch(() => {});
};

// Smooth fade toggle
const toggleWindow = show => {
	if (!win || isAnimating) return;

	const isVisible = win.isVisible();
	const shouldShow = typeof show === 'boolean' ? show : !isVisible;

	if (shouldShow === isVisible) return;

	isAnimating = true;
	if (shouldShow) {
		win.setBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds);
		win.setOpacity(0);
		win.show();
		win.focus();
	}

	// Animation loop
	let opacity = shouldShow ? 0 : 1;
	const step = shouldShow ? 0.1 : -0.1;

	const animate = setInterval(() => {
		opacity += step;
		if ((shouldShow && opacity >= 1) || (!shouldShow && opacity <= 0)) {
			clearInterval(animate);
			win.setOpacity(shouldShow ? 1 : 0);
			if (!shouldShow) win.hide();
			isAnimating = false;
		} else {
			win.setOpacity(opacity);
		}
	}, 15);
};

// --- Auto-Updater Logic ---
// --- Auto-Updater Logic ---
const isNewerVersion = (current, latest) => {
	const curParts = current.replace(/^v/, '').split('.').map(Number);
	const latParts = latest.replace(/^v/, '').split('.').map(Number);
	for (let i = 0; i < Math.max(curParts.length, latParts.length); i++) {
		const cur = curParts[i] || 0;
		const lat = latParts[i] || 0;
		if (lat > cur) return true;
		if (cur > lat) return false;
	}
	return false;
};

const checkForUpdates = async (isManual = false) => {
	try {
		const response = await fetch('https://api.github.com/repos/mrdexign/promptly/releases/latest', {
			headers: { 'User-Agent': 'Promptly-Updater' }
		});
		if (!response.ok) {
			if (isManual) {
				dialog.showMessageBox({
					type: 'warning',
					buttons: ['OK'],
					title: 'Promptly Update',
					message: 'Could not fetch update information.',
					detail: 'Please check your internet connection and try again.'
				});
			}
			return;
		}
		const data = await response.json();
		const latestVersion = data.tag_name.replace(/^v/, '');

		if (latestVersion && isNewerVersion(app.getVersion(), latestVersion)) {
			const exeAsset = data.assets.find(asset => asset.name.endsWith('.exe'));
			if (exeAsset) {
				updateState.available = true;
				updateState.version = latestVersion;
				updateState.downloadUrl = exeAsset.browser_download_url;

				// Prompt user to update
				dialog.showMessageBox({
					type: 'question',
					buttons: ['Update Now', 'Later'],
					defaultId: 0,
					title: 'Promptly Update',
					message: `A new version (v${latestVersion}) is available!`,
					detail: 'Would you like to download and install it now?',
					cancelId: 1
				}).then(res => {
					if (res.response === 0) {
						startUpdate();
					}
				});
				return;
			}
		}

		updateState.checked = true;
		if (isManual) {
			dialog.showMessageBox({
				type: 'info',
				buttons: ['OK'],
				title: 'Promptly Update',
				message: 'Promptly is up to date!',
				detail: `You are currently running the latest version (v${app.getVersion()}).`
			});
		}
	} catch (err) {
		console.error('Update check failed:', err);
		if (isManual) {
			dialog.showMessageBox({
				type: 'error',
				buttons: ['OK'],
				title: 'Promptly Update Error',
				message: 'Failed to check for updates.',
				detail: err.message
			});
		}
	}
};

const startUpdate = async () => {
	if (updateState.status === 'downloading') return;

	updateState.status = 'downloading';
	updateState.progress = 0;

	const html = `
	<!DOCTYPE html>
	<html>
	<head>
		<style>
			body {
				margin: 0;
				padding: 20px;
				background: #12131C;
				color: #E2E8F0;
				font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
				text-align: center;
				border: 1px solid rgba(255, 255, 255, 0.08);
				border-radius: 12px;
				overflow: hidden;
				-webkit-app-region: drag;
			}
			.title {
				font-size: 13px;
				font-weight: 600;
				margin-bottom: 12px;
				letter-spacing: 0.5px;
			}
			.progress-bar-bg {
				width: 100%;
				height: 6px;
				background: rgba(255, 255, 255, 0.08);
				border-radius: 3px;
				overflow: hidden;
				margin-bottom: 8px;
				-webkit-app-region: no-drag;
			}
			.progress-bar {
				width: 0%;
				height: 100%;
				background: linear-gradient(90deg, #6366F1, #8B5CF6);
				border-radius: 3px;
				transition: width 0.1s ease;
			}
			.status {
				font-size: 11px;
				color: #94A3B8;
			}
		</style>
	</head>
	<body>
		<div class="title">Downloading Promptly Update...</div>
		<div class="progress-bar-bg">
			<div id="progress" class="progress-bar"></div>
		</div>
		<div id="status" class="status">0% completed</div>
		<script>
			const { ipcRenderer } = require('electron');
			ipcRenderer.on('update-progress', (event, percent) => {
				document.getElementById('progress').style.width = percent + '%';
				document.getElementById('status').innerText = percent + '% completed';
			});
		</script>
	</body>
	</html>
	`;

	let updateWin = null;
	try {
		// Create frameless progress window
		updateWin = new BrowserWindow({
			width: 320,
			height: 110,
			frame: false,
			resizable: false,
			transparent: true,
			alwaysOnTop: true,
			skipTaskbar: true,
			icon: ASSETS.icon,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false
			}
		});

		updateWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

		const { Readable } = require('stream');
		const response = await fetch(updateState.downloadUrl);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const totalBytes = parseInt(response.headers.get('content-length'), 10) || 0;
		const tempFilePath = path.join(app.getPath('temp'), `Promptly-Setup-${updateState.version}.exe`);
		const fileStream = fs.createWriteStream(tempFilePath);
		const bodyStream = Readable.fromWeb(response.body);

		let downloadedBytes = 0;
		let lastUpdatePercent = 0;

		bodyStream.on('data', chunk => {
			downloadedBytes += chunk.length;
			if (totalBytes > 0) {
				const percent = Math.round((downloadedBytes / totalBytes) * 100);
				if (percent !== lastUpdatePercent) {
					lastUpdatePercent = percent;
					updateState.progress = percent;
					if (updateWin && !updateWin.isDestroyed()) {
						updateWin.webContents.send('update-progress', percent);
					}
				}
			}
		});

		bodyStream.pipe(fileStream);

		await new Promise((resolve, reject) => {
			fileStream.on('finish', resolve);
			fileStream.on('error', reject);
			bodyStream.on('error', reject);
		});

		// Close progress window
		if (updateWin && !updateWin.isDestroyed()) {
			updateWin.close();
		}

		// Notify user of completion using a native modal dialog
		dialog.showMessageBox({
			type: 'info',
			buttons: ['OK'],
			title: 'Promptly Update',
			message: 'Download complete!',
			detail: 'Promptly will now restart to complete the installation.'
		}).then(() => {
			// Execute Squirrel installer
			const { spawn } = require('child_process');
			const child = spawn(tempFilePath, [], {
				detached: true,
				stdio: 'ignore'
			});
			child.unref();

			// Graceful quit
			app.isQuitting = true;
			app.quit();
		});
	} catch (err) {
		console.error('Update download failed:', err);
		updateState.status = 'error';
		updateState.error = err.message;
		
		if (updateWin && !updateWin.isDestroyed()) {
			updateWin.close();
		}

		dialog.showMessageBox({
			type: 'error',
			buttons: ['OK'],
			title: 'Promptly Update Error',
			message: 'Failed to download update.',
			detail: err.message
		});
	}
};

// --- System Tray ---
const createTray = async () => {
	if (!tray) {
		tray = new Tray(ASSETS.icon);
	}

	const menuTemplate = [
		{ label: `⚡ Promptly v${app.getVersion()}`, click: () => toggleWindow() },
	];

	menuTemplate.push(
		{ type: 'separator' },
		{
			label: `Assistant: ${currentAssistant}`,
			submenu: Object.keys(URLS).map(name => ({
				label: name,
				type: 'radio',
				checked: currentAssistant === name,
				click: () => {
					currentAssistant = name;
					appSettings.currentAssistant = name;
					fs.writeFileSync(ASSETS.config, JSON.stringify(appSettings, null, 2));
					win.loadURL(URLS[name]);
					tray.setToolTip(`Promptly v${app.getVersion()} (${name})`);
					createTray(); // Refresh menu label
				},
			})),
		},
		{ type: 'separator' },
		{
			label: 'Settings',
			click: () => {
				createSettingsWindow();
			}
		},
		{ type: 'separator' },
		{
			label: 'Quit',
			click: () => {
				app.isQuitting = true;
				app.quit();
			},
		},
	);

	const contextMenu = Menu.buildFromTemplate(menuTemplate);
	tray.setToolTip(`Promptly v${app.getVersion()} (${currentAssistant})`);

	tray.removeAllListeners('click');
	tray.removeAllListeners('right-click');

	// Left click opens Settings
	tray.on('click', () => {
		createSettingsWindow();
	});

	// Right click opens Tray Menu
	tray.on('right-click', () => {
		tray.popUpContextMenu(contextMenu);
	});
};

// --- Logic: Ask AI ---
const askAI = async (promptPrefix, autoSubmit = true) => {
	if (process.platform !== 'win32') return console.log('Windows only feature');

	const oldClipboard = clipboard.readText();
	clipboard.writeText(''); // Clear to detect change

	try {
		// 1. Simulate Ctrl+C via PowerShell
		const script = `powershell -command "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^{c}')"`;
		await execAsync(script);

		// 2. Poll clipboard for new text
		let capturedText = '';
		for (let i = 0; i < 20; i++) {
			// Wait up to 1 second
			capturedText = clipboard.readText();
			if (capturedText) break;
			await new Promise(r => setTimeout(r, 50));
		}

		// 3. Prepare payload
		toggleWindow(true);

		// If copy failed, just restore old text, don't crash
		if (!capturedText) {
			clipboard.writeText(oldClipboard);
			return;
		}

		const fullPrompt = `${promptPrefix}:\n${capturedText}`;

		// Optional: Save combined prompt to clipboard for user reference
		clipboard.writeText(fullPrompt);

		// Log to history
		addHistoryItem(fullPrompt);

		// 4. Send to Renderer
		if (win) {
			win.webContents.focus();
			win.webContents.send('ask-ai', { text: fullPrompt, submit: autoSubmit });
		}
	} catch (err) {
		console.error('Clipboard Action Failed:', err);
		clipboard.writeText(oldClipboard);
	}
};

// --- History Management ---
const loadHistory = () => {
	try {
		if (fs.existsSync(ASSETS.history)) {
			const data = JSON.parse(fs.readFileSync(ASSETS.history, 'utf8'));
			if (Array.isArray(data)) {
				return pruneHistory(data);
			}
		}
	} catch (err) {
		console.error('Failed to load history:', err);
	}
	return [];
};

const saveHistory = (items) => {
	try {
		fs.writeFileSync(ASSETS.history, JSON.stringify(items, null, 2));
	} catch (err) {
		console.error('Failed to save history:', err);
	}
};

const pruneHistory = (items) => {
	const cleanup = appSettings.historyCleanup || 'daily';
	if (cleanup === 'never') return items;

	const now = Date.now();
	let maxAgeMs = 0;

	if (cleanup === 'daily') {
		maxAgeMs = 24 * 60 * 60 * 1000;
	} else if (cleanup === '2days') {
		maxAgeMs = 2 * 24 * 60 * 60 * 1000;
	} else if (cleanup === '5days') {
		maxAgeMs = 5 * 24 * 60 * 60 * 1000;
	} else if (cleanup === 'week') {
		maxAgeMs = 7 * 24 * 60 * 60 * 1000;
	}

	const filtered = items.filter(item => (now - item.timestamp) < maxAgeMs);
	if (filtered.length !== items.length) {
		saveHistory(filtered);
	}
	return filtered;
};

const addHistoryItem = (text) => {
	const items = loadHistory();
	const newItem = {
		id: 'hist-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
		timestamp: Date.now(),
		text,
		assistant: currentAssistant
	};
	items.unshift(newItem);
	const pruned = pruneHistory(items);
	saveHistory(pruned);
	
	if (settingsWin && !settingsWin.isDestroyed()) {
		settingsWin.webContents.send('history-updated', pruned);
	}
};

// --- Auto-Reload in Development ---
const setupAutoReload = () => {
	try {
		const watchDir = __dirname;
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
					if (normalizedFile === 'main.js') {
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

// --- App Lifecycle ---
app.whenReady().then(async () => {
	createWindow();
	await createTray();
	checkForUpdates(); // Initial update check
	setInterval(checkForUpdates, 6 * 60 * 60 * 1000); // Check every 6 hours

	// Sync auto-launch setting with actual system status
	try {
		const enabled = await autoLauncher.isEnabled();
		if (appSettings.autoLaunch !== enabled) {
			if (appSettings.autoLaunch) await autoLauncher.enable();
			else await autoLauncher.disable();
		}
	} catch (err) {
		console.error('Failed to sync auto-launch on startup:', err);
	}

	registerShortcuts();

	if (!app.isPackaged) {
		setupAutoReload();
	}
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
