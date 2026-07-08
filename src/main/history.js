const fs = require('fs');

const loadHistory = (state) => {
	try {
		if (fs.existsSync(state.ASSETS.history)) {
			const data = JSON.parse(fs.readFileSync(state.ASSETS.history, 'utf8'));
			if (Array.isArray(data)) {
				return pruneHistory(state, data);
			}
		}
	} catch (err) {
		console.error('Failed to load history:', err);
	}
	return [];
};

const saveHistory = (state, items) => {
	try {
		fs.writeFileSync(state.ASSETS.history, JSON.stringify(items, null, 2));
	} catch (err) {
		console.error('Failed to save history:', err);
	}
};

const pruneHistory = (state, items) => {
	const cleanup = state.appSettings.historyCleanup || 'daily';
	if (cleanup === 'never') return items;

	const now = Date.now();
	let maxAgeMs = 0;

	if (cleanup === 'daily') {
		maxAgeMs = 24 * 60 * 60 * 1000;
	} else if (cleanup === '2days') {
		maxAgeMs = 2 * 24 * 60 * 60 * 1000;
	} else if (cleanup === '5days') {
		maxAgeMs = 5 * 24 * 60 * 60 * 1000;
	} else if (cleanup === 'week') {
		maxAgeMs = 7 * 24 * 60 * 60 * 1000;
	}

	const filtered = items.filter(item => (now - item.timestamp) < maxAgeMs);
	if (filtered.length !== items.length) {
		saveHistory(state, filtered);
	}
	return filtered;
};

const addHistoryItem = (state, text, response = null) => {
	const items = loadHistory(state);
	const newItem = {
		id: 'hist-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
		timestamp: Date.now(),
		text,
		assistant: state.currentAssistant
	};
	if (response) {
		newItem.response = response;
	}
	items.unshift(newItem);
	const pruned = pruneHistory(state, items);
	saveHistory(state, pruned);

	if (state.settingsWin && !state.settingsWin.isDestroyed()) {
		state.settingsWin.webContents.send('history-updated', pruned);
	}
};

module.exports = { loadHistory, saveHistory, pruneHistory, addHistoryItem };
