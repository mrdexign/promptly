const fs = require('fs');
const path = require('path');

const getDefaultPrompts = () => [
	{ id: 'toggle', name: 'Toggle Window', shortcut: 'Alt+C', text: '', autoSubmit: false, isSystem: true },
	{ id: 'rephrase', name: 'Rephrase', shortcut: 'Alt+R', text: 'Rephrase', autoSubmit: true },
	{ id: 'clipboard', name: 'Clipboard (Paste only)', shortcut: 'Alt+M', text: 'Clipboard', autoSubmit: false },
	{ id: 'task', name: 'Task Title Extractor', shortcut: 'Alt+T', text: 'Extract the task title in one line', autoSubmit: true },
	{ id: 'grammar', name: 'Grammar Checker', shortcut: 'Alt+G', text: 'Spot grammar mistakes and share the lesson', autoSubmit: true },
	{ id: 'translate', name: 'Translator', shortcut: 'Alt+L', text: 'Translate to Persian and identify critical vocab', autoSubmit: true }
];

const loadSettings = (ASSETS) => {
	try {
		if (fs.existsSync(ASSETS.config)) {
			const data = JSON.parse(fs.readFileSync(ASSETS.config, 'utf8'));
			if (data && typeof data === 'object') {
				if (!data.prompts) data.prompts = getDefaultPrompts();
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

const saveSettingsToFile = (ASSETS, settings) => {
	try {
		fs.writeFileSync(ASSETS.config, JSON.stringify(settings, null, 2));
	} catch (err) {
		console.error('Failed to write settings:', err);
	}
};

module.exports = { getDefaultPrompts, loadSettings, saveSettingsToFile };
