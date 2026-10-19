const { ipcRenderer } = require('electron');

let CONFIG = null;

const ensureConfig = async () => {
	if (!CONFIG) {
		CONFIG = {};
		try {
			const providers = await ipcRenderer.invoke('get-webchat-providers');
			providers.forEach(p => {
				if (p.domain) CONFIG[p.domain] = p.webview;
				if (Array.isArray(p.domains)) {
					p.domains.forEach(d => {
						CONFIG[d] = p.webview;
					});
				}
			});
		} catch (err) {
			console.error('Failed to load webchat providers configuration:', err);
		}
	}
};

const getElement = selectors => {
	for (const s of selectors) {
		const el = document.querySelector(s);
		if (el) return el;
	}
	return null;
};

const focusAndSelect = element => {
	element.focus();
	element.click();
	if (element.tagName !== 'TEXTAREA' && element.tagName !== 'INPUT') {
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
			const range = document.createRange();
			range.selectNodeContents(element);
			range.collapse(false);
			selection.addRange(range);
		}
	} else {
		element.select();
	}
};

const reactInsert = (element, value) => {
	const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
	const nativeSetter = descriptor?.set;
	if (nativeSetter && (element instanceof window.HTMLTextAreaElement || element.tagName === 'TEXTAREA')) {
		nativeSetter.call(element, value);
		element.dispatchEvent(new Event('input', { bubbles: true }));
	} else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
		element.value = value;
		element.dispatchEvent(new Event('input', { bubbles: true }));
	} else {
		richTextInsert(value);
	}
};

const richTextInsert = value => {
	document.execCommand('selectAll', false, null);
	document.execCommand('insertText', false, value);
};

const pasteInsert = (element, value) => {
	document.execCommand('selectAll', false, null);
	const dataTransfer = new DataTransfer();
	dataTransfer.setData('text/plain', value);
	const event = new ClipboardEvent('paste', {
		clipboardData: dataTransfer,
		bubbles: true,
		cancelable: true,
	});
	element.dispatchEvent(event);
};

ipcRenderer.on('ask-ai', async (_, { text, submit }) => {
	await ensureConfig();
	const host = window.location.hostname;
	let settings = null;
	for (const key of Object.keys(CONFIG)) {
		if (host.includes(key)) {
			settings = CONFIG[key];
			break;
		}
	}
	if (!settings) return console.warn(`Unsupported host: ${host}`);

	const inputEl = getElement(settings.input);
	if (!inputEl) return console.warn('AI Input not found');

	focusAndSelect(inputEl);

	if (settings.method === 'react-props') {
		reactInsert(inputEl, text);
	} else if (settings.method === 'rich-text') {
		richTextInsert(text);
	} else if (settings.method === 'paste-event') {
		pasteInsert(inputEl, text);
	}

	if (submit) {
		setTimeout(() => {
			const btn = getElement(settings.submit);
			if (btn) {
				btn.click();
			} else {
				inputEl.dispatchEvent(new KeyboardEvent('keydown', {
					key: 'Enter',
					code: 'Enter',
					keyCode: 13,
					which: 13,
					bubbles: true,
					cancelable: true
				}));
			}
		}, 300);
	}
});
