const fs = require('fs');
const path = require('path');

const getDefaultPrompts = () => [
	{ id: 'toggle-promptly', name: 'Toggle Promptly', shortcut: 'Alt+P', text: '', autoSubmit: false, isSystem: true },
	{ id: 'toggle', name: 'Toggle Window', shortcut: 'Alt+C', text: '', autoSubmit: false, isSystem: true },
	{ id: 'rephrase', name: 'Rephrase', shortcut: 'Alt+R', text: 'Rephrase this more clearly and concisely', autoSubmit: true },
	{ id: 'task', name: 'Task Title', shortcut: 'Alt+T', text: 'Extract a one-line task title from this text', autoSubmit: true },
	{ id: 'translate', name: 'Translate', shortcut: 'Alt+L', text: 'Translate to English', autoSubmit: true },
	{
		id: 'grammar',
		name: 'Grammar Fix',
		shortcut: 'Alt+G',
		text: 'Correct the grammar and explain each rule',
		autoSubmit: true,
	},
	{ id: 'paste', name: 'Paste from Clipboard', shortcut: 'Alt+M', text: '', autoSubmit: false },
];

const loadSettings = ASSETS => {
	const isWebChat = id =>
		['Copilot', 'Arena', 'Gemini', 'Perplexity', 'Monica', 'Qwen', 'DeepSeek', 'MiniMax', 'Claude', 'Kimi'].includes(id);

	try {
		if (fs.existsSync(ASSETS.config)) {
			const data = JSON.parse(fs.readFileSync(ASSETS.config, 'utf8'));
			if (data && typeof data === 'object') {
				if (!data.prompts) data.prompts = getDefaultPrompts();
				if (data.standardWindow === undefined) data.standardWindow = false;
				if (data.theme === undefined) data.theme = 'dark';
				if (data.historyCleanup === undefined) data.historyCleanup = 'daily';
				if (!data.apiProviders) data.apiProviders = [];
				// Allow API providers as active, but fallback to Copilot if invalid
				if (data.currentAssistant && !isWebChat(data.currentAssistant)) {
					const apiExists = data.apiProviders.some(p => p.id === data.currentAssistant);
					if (!apiExists) data.currentAssistant = 'Copilot';
				}
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
		apiProviders: [],
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
