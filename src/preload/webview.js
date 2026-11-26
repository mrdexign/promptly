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

const pressEnter = element => {
	element.dispatchEvent(new KeyboardEvent('keydown', {
		key: 'Enter',
		code: 'Enter',
		keyCode: 13,
		which: 13,
		bubbles: true,
		cancelable: true
	}));
};

// shortcut: waits up to 60s for a disabled Send button (Duck.ai disables it while answering); raise the cap if sites stream longer
let submitToken = 0;

const isSubmitBlocked = btn =>
	btn.disabled === true ||
	btn.getAttribute('aria-disabled') === 'true' ||
	/(^|[\s-])disabled([\s-]|$)/.test(String(btn.className || ''));

const submitPrompt = (token, settings, inputEl, text, attempt = 0) => {
	if (token !== submitToken) return;
	const btn = getElement(settings.submit);
	if (!btn) return pressEnter(inputEl);
	if (isSubmitBlocked(btn)) {
		if (attempt < 120) setTimeout(() => submitPrompt(token, settings, inputEl, text, attempt + 1), 500);
		return;
	}
	// a delayed click only fires for the text that is still in the composer
	if (attempt) {
		const strip = value => String(value ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').trim();
		if (strip(inputEl.value ?? inputEl.textContent) !== strip(text)) return;
	}
	btn.click();
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

const captureAnchors = capture => {
	const spec = capture && capture.answer;
	if (!spec) return [];
	const anchors = [];
	(spec.from || []).forEach(selector => {
		document.querySelectorAll(selector).forEach(el => {
			if (!anchors.includes(el)) anchors.push(el);
		});
	});
	return anchors;
};

const readCapture = capture => {
	const spec = capture && capture.answer;
	if (!spec) return null;
	const anchors = captureAnchors(capture);
	let el = anchors[anchors.length - 1];
	if (!el) return null;
	for (let i = 0; i < (spec.climb || 0) && el; i++) el = el.parentElement;
	if (spec.sibling === 'previous') el = el && el.previousElementSibling;
	if (!el) return null;

	// walk the live answer: skips chrome and hidden mirrors, keeps paragraph breaks
	const skip = new Set(['BUTTON', 'TEXTAREA', 'H5', 'H6', 'HEADER']);
	const parts = [];
	const walk = node => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent.replace(/\s+/g, ' ');
			if (text.trim()) parts.push(text);
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		if (skip.has(node.tagName) || node.getAttribute('role') === 'toolbar') return;
		const style = getComputedStyle(node);
		if (style.display === 'none' || style.visibility === 'hidden') return;
		const block = /^(block|flex|grid|table|list-item|flow-root)$/.test(style.display);
		if (block) parts.push('\n');
		node.childNodes.forEach(walk);
		if (block) parts.push('\n');
	};
	walk(el);
	return parts.join('')
		.replace(/[ \t]+/g, ' ')
		.replace(/ ?\n ?/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
};

const isCaptureBusy = capture => (capture && capture.busy ? capture.busy : []).some(selector => {
	const el = document.querySelector(selector);
	if (!el || el.disabled) return false;
	const rect = el.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
});

// waits until a new answer stopped changing, so slow streams are not cut off
const waitForCapture = (capture, baselineText, baselineCount, sentText) => new Promise(resolve => {
	const sentKey = String(sentText || '').replace(/\s+/g, '');
	const started = Date.now();
	let last = '';
	let stable = 0;
	const poll = () => {
		if (Date.now() - started > 120000) return resolve(null);
		const text = readCapture(capture);
		// Duck.ai can prefill its draft block with the prompt; that is not an answer
		const echoed = text && sentKey && text.replace(/\s+/g, '').includes(sentKey);
		const isNew = text && !echoed && (text !== baselineText || captureAnchors(capture).length > baselineCount);
		if (isNew && !isCaptureBusy(capture)) {
			if (text === last) stable++;
			else { last = text; stable = 0; }
			if (stable >= 3) return resolve(text);
		} else {
			stable = 0;
			last = text || last;
		}
		setTimeout(poll, 400);
	};
	setTimeout(poll, 700);
});

ipcRenderer.on('ask-ai', async (_, { text, submit, capture: wantsCapture, requestId }) => {
	await ensureConfig();
	const host = window.location.hostname;
	let settings = null;
	for (const key of Object.keys(CONFIG)) {
		if (host.includes(key)) {
			settings = CONFIG[key];
			break;
		}
	}
	const fail = () => wantsCapture && ipcRenderer.send('web-chat-result', { requestId, text: null });
	if (!settings) {
		fail();
		return console.warn(`Unsupported host: ${host}`);
	}

	const inputEl = getElement(settings.input);
	if (!inputEl) {
		fail();
		return console.warn('AI Input not found');
	}

	const capture = wantsCapture ? settings.capture : null;
	if (wantsCapture && !capture) {
		fail();
		return console.warn('Response capture is not configured for this host');
	}
	const baselineText = capture ? readCapture(capture) : '';
	const baselineCount = capture ? captureAnchors(capture).length : 0;

	focusAndSelect(inputEl);

	if (settings.method === 'react-props') {
		reactInsert(inputEl, text);
	} else if (settings.method === 'rich-text') {
		richTextInsert(text);
	} else if (settings.method === 'paste-event') {
		pasteInsert(inputEl, text);
	}

	if (submit) {
		const token = ++submitToken;
		setTimeout(() => submitPrompt(token, settings, inputEl, text), 300);
	}

	if (capture) {
		const answer = await waitForCapture(capture, baselineText, baselineCount, text);
		ipcRenderer.send('web-chat-result', { requestId, text: answer });
	}
});
