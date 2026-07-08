const { globalShortcut } = require('electron');
const { toggleWindow, toggleApiChatWindow, toggleSettingsWindow } = require('./window');
const { askAI } = require('./clipboard');
const { isWebChat } = require('./providers-config');



const registerShortcuts = (state) => {
	globalShortcut.unregisterAll();

	state.appSettings.prompts.forEach(item => {
		if (!item.shortcut) return;

		try {
			const success = globalShortcut.register(item.shortcut, () => {
				if (item.id === 'toggle') {
					if (isWebChat(state.currentAssistant)) {
						toggleWindow(state);
					} else {
						toggleApiChatWindow(state);
					}
				} else if (item.id === 'toggle-promptly') {
					toggleSettingsWindow(state);
				} else {
					askAI(state, item.text, item.autoSubmit, item.name);
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
