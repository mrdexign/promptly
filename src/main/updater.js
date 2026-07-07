const fs = require('fs');
const path = require('path');
const { app, dialog, BrowserWindow, shell } = require('electron');

const ROOT = path.join(__dirname, '..', '..');

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

const checkForUpdates = async (state, isManual = false) => {
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
				state.updateState.available = true;
				state.updateState.version = latestVersion;
				state.updateState.downloadUrl = exeAsset.browser_download_url;

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
						startUpdate(state);
					}
				});
				return;
			}
		}

		state.updateState.checked = true;
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

const UPDATE_HTML = `
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

const startUpdate = async (state) => {
	if (state.updateState.status === 'downloading') return;

	state.updateState.status = 'downloading';
	state.updateState.progress = 0;

	let updateWin = null;
	try {
		updateWin = new BrowserWindow({
			width: 320,
			height: 110,
			frame: false,
			resizable: false,
			transparent: true,
			alwaysOnTop: true,
			skipTaskbar: true,
			icon: state.ASSETS.icon,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false
			}
		});

		updateWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(UPDATE_HTML)}`);

		const { Readable } = require('stream');
		const response = await fetch(state.updateState.downloadUrl);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const totalBytes = parseInt(response.headers.get('content-length'), 10) || 0;
		const tempFilePath = path.join(app.getPath('temp'), `Promptly-Setup-${state.updateState.version}.exe`);
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
					state.updateState.progress = percent;
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

		if (updateWin && !updateWin.isDestroyed()) {
			updateWin.close();
		}

		dialog.showMessageBox({
			type: 'info',
			buttons: ['OK'],
			title: 'Promptly Update',
			message: 'Download complete!',
			detail: 'Promptly will now restart to complete the installation.'
		}).then(() => {
			const { spawn } = require('child_process');
			const child = spawn(tempFilePath, [], {
				detached: true,
				stdio: 'ignore'
			});
			child.unref();

			app.isQuitting = true;
			app.quit();
		});
	} catch (err) {
		console.error('Update download failed:', err);
		state.updateState.status = 'error';
		state.updateState.error = err.message;

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

module.exports = { isNewerVersion, checkForUpdates, startUpdate };
