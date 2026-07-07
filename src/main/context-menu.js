const { Menu } = require('electron');

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

module.exports = { registerContextMenu };
