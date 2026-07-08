const fs = require('fs');
const path = require('path');
const { Tray, Menu, app } = require('electron');
const { createSettingsWindow } = require('./window');
const { isWebChat } = require('./providers-config');

const createTray = async state => {
	if (!state.tray) {
		state.tray = new Tray(state.ASSETS.icon);
	}

	const menuTemplate = [{ label: `⚡ Promptly v${app.getVersion()}`, click: () => require('./window').toggleWindow(state) }];



	const webChatItems = Object.keys(state.URLS).map(name => ({
		label: name,
		type: 'radio',
		checked: state.currentAssistant === name,
		click: () => {
			state.currentAssistant = name;
			state.appSettings.currentAssistant = name;
			fs.writeFileSync(state.ASSETS.config, JSON.stringify(state.appSettings, null, 2));
			if (state.win) {
				state.win.loadURL(state.URLS[name]);
			}
			state.tray.setToolTip(`Promptly v${app.getVersion()} (${name})`);
			createTray(state);
		},
	}));

	const apiProviders = state.appSettings.apiProviders || [];
	const apiItems = apiProviders.map(p => ({
		label: p.name,
		type: 'radio',
		checked: state.currentAssistant === p.id,
		click: () => {
			state.currentAssistant = p.id;
			state.appSettings.currentAssistant = p.id;
			fs.writeFileSync(state.ASSETS.config, JSON.stringify(state.appSettings, null, 2));
			if (state.win) {
				state.win.loadURL('about:blank');
			}
			state.tray.setToolTip(`Promptly v${app.getVersion()} (${p.name})`);
			createTray(state);
		},
	}));

	const currentName = isWebChat(state.currentAssistant) ? state.currentAssistant : 
		(apiProviders.find(p => p.id === state.currentAssistant)?.name || state.currentAssistant);

	menuTemplate.push(
		{ type: 'separator' },
		{
			label: `Assistant: ${currentName}`,
			submenu: [...webChatItems, ...(apiItems.length > 0 ? [{ type: 'separator' }] : []), ...apiItems],
		},
		{ type: 'separator' },
		{
			label: 'Settings',
			click: () => createSettingsWindow(state),
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
	state.tray.setToolTip(`Promptly v${app.getVersion()} (${currentName})`);

	state.tray.removeAllListeners('click');
	state.tray.removeAllListeners('right-click');

	state.tray.on('click', () => createSettingsWindow(state));
	state.tray.on('right-click', () => state.tray.popUpContextMenu(contextMenu));
};

module.exports = { createTray };
