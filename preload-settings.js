const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	getSettings: () => ipcRenderer.invoke('get-settings'),
	saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
	closeSettings: () => ipcRenderer.send('close-settings'),
	getAppVersion: () => ipcRenderer.invoke('get-app-version'),
	checkUpdateStatus: () => ipcRenderer.invoke('check-update-status'),
	startUpdate: () => ipcRenderer.send('start-update'),
	openAboutPage: () => ipcRenderer.send('open-about-page'),
	getDefaultPrompts: () => ipcRenderer.invoke('get-default-prompts'),
});
