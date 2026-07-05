const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const AutoLaunch = require('auto-launch');
const { app, BrowserWindow, globalShortcut, screen, Tray, Menu, clipboard, shell, dialog } = require('electron');
const execAsync = util.promisify(exec);

// --- Configuration & Constants ---
if (require('electron-squirrel-startup')) app?.quit();

const ASSETS = {
	icon: path.join(__dirname, 'icons/icon.ico'),
	config: path.join(app.getPath('userData'), 'assistant-config.json'),
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

// Load/Save preference helper
const getStoredAssistant = () => {
	try {
		const stored = JSON.parse(fs.readFileSync(ASSETS.config, 'utf8')).currentAssistant;
		return (stored && URLS[stored]) ? stored : 'Copilot';
	} catch {
		return 'Copilot';
	}
};
let currentAssistant = getStoredAssistant();

// --- Window Management ---
const createWindow = () => {
	if (win) return;
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	win = new BrowserWindow({
		title: 'Promptly',
		width,
		height,
		show: false,
		frame: false,
		transparent: true,
		skipTaskbar: true,
		icon: ASSETS.icon,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	});

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
		const latestVersion = data.tag_name;

		if (latestVersion && isNewerVersion(app.getVersion(), latestVersion)) {
			const exeAsset = data.assets.find(asset => asset.name.endsWith('.exe'));
			if (exeAsset) {
				updateState.available = true;
				updateState.version = latestVersion;
				updateState.downloadUrl = exeAsset.browser_download_url;
				await createTray();

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
	await createTray();

	try {
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
					createTray();
				}
			}
		});

		bodyStream.pipe(fileStream);

		await new Promise((resolve, reject) => {
			fileStream.on('finish', resolve);
			fileStream.on('error', reject);
			bodyStream.on('error', reject);
		});

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
		dialog.showMessageBox({
			type: 'error',
			buttons: ['OK'],
			title: 'Promptly Update Error',
			message: 'Failed to download update.',
			detail: err.message
		});
		await createTray();
	}
};

// --- System Tray ---
const createTray = async () => {
	if (!tray) {
		tray = new Tray(ASSETS.icon);
		tray.on('click', () => toggleWindow());
	}
	const isAutoLaunchEnabled = await autoLauncher.isEnabled();

	const menuTemplate = [
		{ label: `⚡ Promptly v${app.getVersion()}`, click: () => toggleWindow() },
	];

	if (updateState.available) {
		menuTemplate.push({ type: 'separator' });
		if (updateState.status === 'idle') {
			menuTemplate.push({
				label: `✨ Update to v${updateState.version} (One-click)`,
				click: () => startUpdate()
			});
		} else if (updateState.status === 'downloading') {
			menuTemplate.push({
				label: `📥 Downloading update: ${updateState.progress}%`,
				enabled: false
			});
		} else if (updateState.status === 'error') {
			menuTemplate.push({
				label: `❌ Update failed. Click to retry.`,
				click: () => startUpdate()
			});
		}
	} else {
		menuTemplate.push(
			{ type: 'separator' },
			{
				label: 'Check for Updates...',
				click: () => checkForUpdates(true)
			}
		);
	}

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
					fs.writeFileSync(ASSETS.config, JSON.stringify({ currentAssistant: name }));
					win.loadURL(URLS[name]);
					tray.setToolTip(`Promptly v${app.getVersion()} (${name})`);
					createTray(); // Refresh menu label
				},
			})),
		},
		{
			label: `Auto-launch: ${isAutoLaunchEnabled ? 'ON' : 'OFF'}`,
			click: async () => {
				if (isAutoLaunchEnabled) {
					await autoLauncher.disable();
				} else {
					await autoLauncher.enable();
				}
				createTray(); // Refresh menu label
			},
		},
		{ type: 'separator' },

		{
			label: 'About Us',
			click: () => {
				shell.openExternal('https://github.com/mrdexign/promptly');
			},
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
	tray.on('click', () => {
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

// --- App Lifecycle ---
app.whenReady().then(async () => {
	createWindow();
	await createTray();
	checkForUpdates(); // Initial update check
	setInterval(checkForUpdates, 6 * 60 * 60 * 1000); // Check every 6 hours

	// Register Shortcuts
	const shortcuts = {
		'Alt+C': () => toggleWindow(),
		'Alt+R': () => askAI('Rephrase'),
		'Alt+M': () => askAI('Clipboard', false),
		'Alt+T': () => askAI('Extract the task title in one line'),
		'Alt+G': () => askAI('Spot grammar mistakes and share the lesson'),
		'Alt+L': () => askAI('Translate to Persian and identify critical vocab'),
	};

	for (const [key, action] of Object.entries(shortcuts)) {
		globalShortcut.register(key, action);
	}
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
