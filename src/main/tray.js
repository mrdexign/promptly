const fs = require('fs');
const { Tray, Menu, app } = require('electron');
const { createSettingsWindow } = require('./window');

const createTray = async (state) => {
	if (!state.tray) {
		state.tray = new Tray(state.ASSETS.icon);
	}

	const menuTemplate = [
		{ label: `⚡ Promptly v${app.getVersion()}`, click: () => require('./window').toggleWindow(state) },
	];

	menuTemplate.push(
		{ type: 'separator' },
		{
			label: `Assistant: ${state.currentAssistant}`,
			submenu: Object.keys(state.URLS).map(name => ({
				label: name,
				type: 'radio',
				checked: state.currentAssistant === name,
				click: () => {
					state.currentAssistant = name;
					state.appSettings.currentAssistant = name;
					fs.writeFileSync(state.ASSETS.config, JSON.stringify(state.appSettings, null, 2));
					state.win.loadURL(state.URLS[name]);
					state.tray.setToolTip(`Promptly v${app.getVersion()} (${name})`);
					createTray(state);
				},
			})),
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
	state.tray.setToolTip(`Promptly v${app.getVersion()} (${state.currentAssistant})`);

	state.tray.removeAllListeners('click');
	state.tray.removeAllListeners('right-click');

	state.tray.on('click', () => createSettingsWindow(state));
	state.tray.on('right-click', () => state.tray.popUpContextMenu(contextMenu));
};

module.exports = { createTray };
