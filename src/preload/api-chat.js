const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	getProvider: () => ipcRenderer.invoke('get-api-chat-provider'),
	getProviders: () => ipcRenderer.invoke('get-api-providers'),
	setProvider: (id) => ipcRenderer.send('set-api-chat-provider', id),
	sendMessage: (providerId, messages) => ipcRenderer.invoke('make-api-chat-request', providerId, messages),
	close: () => ipcRenderer.send('close-api-chat'),
	minimize: () => ipcRenderer.send('minimize-api-chat'),
	toggleMaximize: () => ipcRenderer.invoke('toggle-maximize-api-chat'),
	getTheme: () => ipcRenderer.invoke('get-theme'),
	getStandardWindow: () => ipcRenderer.invoke('get-standard-window'),
	onProviderChanged: (callback) => ipcRenderer.on('provider-changed', (_, provider) => callback(provider)),
	onStreamChunk: (callback) => ipcRenderer.on('stream-chunk', (_, chunk) => callback(chunk)),
	onStandardWindowChanged: (callback) => ipcRenderer.on('standard-window-changed', (_, isStandard) => callback(isStandard)),
});
