const { globalShortcut } = require('electron');
const { toggleWindow } = require('./window');
const { askAI } = require('./clipboard');

const registerShortcuts = (state) => {
	globalShortcut.unregisterAll();

	state.appSettings.prompts.forEach(item => {
		if (!item.shortcut) return;

		try {
			const success = globalShortcut.register(item.shortcut, () => {
				if (item.id === 'toggle') {
					toggleWindow(state);
				} else {
					askAI(state, item.text, item.autoSubmit);
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

module.exports = { registerShortcuts };
