const { ipcRenderer } = require('electron');

const CONFIG = {
	'copilot.microsoft.com': {
		input: ['#userInput', '.input-area textarea', 'textarea[id*="searchbox"]'],
		submit: ['button[aria-label="Submit message"]', '.send-button'],
		method: 'react-props',
	},
	'gemini.google.com': {
		input: ['.ql-editor', 'div[role="textbox"]'],
		submit: ['button[aria-label*="Send"]', '.send-button'],
		method: 'rich-text',
	},
	'perplexity.ai': {
		input: ['#ask-input', 'textarea[placeholder*="Ask"]', 'textarea[placeholder*="anything"]', 'textarea', '[contenteditable="true"]'],
		submit: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]', 'button[class*="submit"]', 'button:has(svg)'],
		method: 'paste-event',
	},
	'monica.im': {
		input: ['textarea', 'div[contenteditable="true"]'],
		submit: ['button[aria-label*="Send"]', 'button[aria-label*="Submit"]', 'button[class*="send"]'],
		method: 'react-props',
	},
	'arena.ai': {
		input: ['textarea[name="message"]', 'textarea[placeholder*="Ask"]', 'textarea'],
		submit: ['button[type="submit"]', 'button[aria-label*="Send"]', 'button[class*="send"]', 'button:has(svg)'],
		method: 'react-props',
	},
	'qwen.ai': {
		input: ['textarea.message-input-textarea', '.message-input-textarea', 'textarea'],
		submit: ['.message-input-right-button button', '.message-input-right-button > *', '.message-input-right-button'],
		method: 'react-props',
	},
	'deepseek.com': {
		input: ['textarea[placeholder*="DeepSeek"]', 'textarea[name="search"]', 'textarea'],
		submit: ['button[aria-label*="Send"]', 'div[class*="send"]', 'button[class*="send"]', 'div[class*="Send"]', 'button[class*="Send"]'],
		method: 'react-props',
	},
	'minimax.io': {
		input: ['div[data-testid="message-textarea"]', 'div[contenteditable="true"]', 'textarea'],
		submit: ['[data-testid*="send"]', '[data-testid*="submit"]', 'button[data-testid*="send"]', 'button[class*="send"]', 'button:has(svg)', 'button', 'div[role="button"]'],
		method: 'rich-text',
	},
	'claude.ai': {
		input: ['div[data-testid="chat-input"]', 'div[aria-label*="Claude"]', 'div[contenteditable="true"]', 'textarea'],
		submit: ['button[aria-label*="Send"]', 'button[data-testid*="send"]', 'button:has(svg)', 'button'],
		method: 'rich-text',
	},
	'kimi.com': {
		input: ['.chat-input-editor', '[data-lexical-editor="true"]', 'div[contenteditable="true"]', 'textarea'],
		submit: [
			'.chat-input button[aria-label*="发送"]',
			'.chat-input button[aria-label*="Send"]',
			'button[aria-label*="发送"]',
			'button[aria-label*="Send"]',
			'.chat-input button',
			'.chat-input [class*="send"]',
			'[class*="send-btn"]'
		],
		method: 'paste-event',
	},
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
	if (nativeSetter) {
		nativeSetter.call(element, value);
		element.dispatchEvent(new Event('input', { bubbles: true }));
	} else {
		element.value = value;
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

ipcRenderer.on('ask-ai', (_, { text, submit }) => {
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
