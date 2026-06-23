const { ipcRenderer } = require('electron');

// --- Site Configuration ---
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
};

// --- Helpers ---
const getElement = selectors => {
	for (const s of selectors) {
		const el = document.querySelector(s);
		if (el) return el;
	}
	return null;
};

// Programmatically focus and place cursor/selection range inside the target element
const focusAndSelect = element => {
	element.focus();
	element.click();
	if (element.tagName !== 'TEXTAREA' && element.tagName !== 'INPUT') {
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
			const range = document.createRange();
			range.selectNodeContents(element);
			range.collapse(false); // Place cursor at the end
			selection.addRange(range);
		}
	} else {
		element.select();
	}
};

// Trigger React's internal state update logic
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

// Trigger rich text insertion
const richTextInsert = value => {
	document.execCommand('selectAll', false, null);
	document.execCommand('insertText', false, value);
};

// Trigger rich text insertion via synthetic paste event (preserves newlines and compatibility with rich text editors)
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

// --- Main Listener ---
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

	// 1. Focus & Select
	focusAndSelect(inputEl);

	// 2. Insert Text based on method
	if (settings.method === 'react-props') {
		reactInsert(inputEl, text);
	} else if (settings.method === 'rich-text') {
		richTextInsert(text);
	} else if (settings.method === 'paste-event') {
		pasteInsert(inputEl, text);
	}

	// 3. Submit (optional delay to allow UI to validate input)
	if (submit) {
		setTimeout(() => {
			const btn = getElement(settings.submit);
			if (btn) {
				btn.click();
			} else {
				// Fallback: Press Enter
				inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			}
		}, 300);
	}
});
