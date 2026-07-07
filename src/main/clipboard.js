const { clipboard } = require('electron');
const util = require('util');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);
const { addHistoryItem } = require('./history');
const { toggleWindow } = require('./window');

const askAI = async (state, promptPrefix, autoSubmit = true) => {
	if (process.platform !== 'win32') return console.log('Windows only feature');

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

		toggleWindow(state, true);

		if (!capturedText) {
			clipboard.writeText(oldClipboard);
			return;
		}

		const fullPrompt = `${promptPrefix}:\n${capturedText}`;
		clipboard.writeText(fullPrompt);
		addHistoryItem(state, fullPrompt);

		if (state.win) {
			state.win.webContents.focus();
			state.win.webContents.send('ask-ai', { text: fullPrompt, submit: autoSubmit });
		}
	} catch (err) {
		console.error('Clipboard Action Failed:', err);
		clipboard.writeText(oldClipboard);
	}
};

module.exports = { askAI };
