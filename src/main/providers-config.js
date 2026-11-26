const providers = [
	{
		id: 'ChatGPT',
		name: 'ChatGPT',
		url: 'https://chatgpt.com',
		domain: 'chatgpt.com',
		domains: ['chatgpt.com', 'openai.com'],
		icon: '🌐',
		webview: {
			input: [
				'#prompt-textarea',
				'div#prompt-textarea',
				'div.ProseMirror[contenteditable="true"]',
				'div[contenteditable="true"]',
				'textarea#prompt-textarea',
				'textarea[placeholder*="Ask"]',
				'textarea',
			],
			submit: [
				'button[data-testid="send-button"]',
				'button[data-testid="composer-submit-button"]',
				'button[aria-label*="Send"]',
				'button[aria-label*="send"]',
				'button:has(svg)',
				'button',
			],
			method: 'rich-text',
		},
	},
	{
		id: 'Claude',
		name: 'Claude',
		url: 'https://claude.ai/chat',
		domain: 'claude.ai',
		icon: '🌐',
		webview: {
			input: ['div[data-testid="chat-input"]', 'div[aria-label*="Claude"]', 'div[contenteditable="true"]', 'textarea'],
			submit: ['button[aria-label*="Send"]', 'button[data-testid*="send"]', 'button:has(svg)', 'button'],
			method: 'rich-text',
		},
	},
	{
		id: 'Gemini',
		name: 'Gemini',
		url: 'https://gemini.google.com',
		domain: 'gemini.google.com',
		icon: '🌐',
		webview: {
			input: ['.ql-editor', 'div[role="textbox"]'],
			submit: ['button[aria-label*="Send"]', '.send-button'],
			method: 'rich-text',
		},
	},
	{
		id: 'Perplexity',
		name: 'Perplexity',
		url: 'https://perplexity.ai',
		domain: 'perplexity.ai',
		icon: '🌐',
		webview: {
			input: [
				'#ask-input',
				'textarea[placeholder*="Ask"]',
				'textarea[placeholder*="anything"]',
				'textarea',
				'[contenteditable="true"]',
			],
			submit: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]', 'button[class*="submit"]', 'button:has(svg)'],
			method: 'paste-event',
		},
	},
	{
		id: 'Copilot',
		name: 'Copilot',
		url: 'https://copilot.cloud.microsoft/',
		domain: 'copilot.cloud.microsoft',
		domains: ['copilot.cloud.microsoft', 'copilot.com', 'copilot.microsoft.com'],
		icon: '🌐',
		webview: {
			input: ['#m365-chat-editor-target-element', '[contenteditable="true"][aria-label*="Copilot"]'],
			submit: ['button[aria-label="Submit message"]', '.send-button'],
			method: 'rich-text',
			capture: {
				busy: ['button[aria-label="Stop generating"]'],
				answer: { from: ['div.fai-CopilotMessage[role="article"]'], climb: 0 },
			},
		},
	},
	{
		id: 'Duck.ai',
		name: 'Duck.ai',
		url: 'https://duck.ai',
		domain: 'duck.ai',
		domains: ['duck.ai', 'duckduckgo.com'],
		icon: '🌐',
		webview: {
			input: [
				'textarea[placeholder*="Ask"]',
				'textarea[placeholder*="Reply"]',
				'textarea[name="message"]',
				'textarea[aria-label*="chat"]',
				'textarea',
			],
			submit: ['button[type="submit"]', 'button[aria-label*="Send"]'],
			method: 'react-props',
			capture: {
				busy: ['button[aria-label="Stop generating"]'],
				answer: { from: ['[data-activeresponse="true"] > div:has(+ div button[aria-label="Copy to clipboard"])'], climb: 0 },
			},
		},
	},
	{
		id: 'Kimi',
		name: 'Kimi',
		url: 'https://www.kimi.com',
		domain: 'kimi.com',
		icon: '🌐',
		webview: {
			input: ['.chat-input-editor', '[data-lexical-editor="true"]', 'div[contenteditable="true"]', 'textarea'],
			submit: [
				'.chat-input button[aria-label*="发送"]',
				'.chat-input button[aria-label*="Send"]',
				'button[aria-label*="发送"]',
				'button[aria-label*="Send"]',
				'.chat-input button',
				'.chat-input [class*="send"]',
				'[class*="send-btn"]',
			],
			method: 'paste-event',
		},
	},
	{
		id: 'DeepSeek',
		name: 'DeepSeek',
		url: 'https://chat.deepseek.com',
		domain: 'deepseek.com',
		icon: '🌐',
		webview: {
			input: ['textarea[placeholder*="DeepSeek"]', 'textarea[name="search"]', 'textarea'],
			submit: ['div.ds-button--primary.ds-button--circle'],
			method: 'react-props',
			capture: {
				busy: ['div.ds-button--primary.ds-button--circle:has(path[d^="M34,18"])'],
				answer: { from: ['div.ds-markdown.ds-assistant-message-main-content'], climb: 0 },
			},
		},
	},
	{
		id: 'Qwen',
		name: 'Qwen',
		url: 'https://chat.qwen.ai',
		domain: 'qwen.ai',
		icon: '🌐',
		webview: {
			input: ['textarea.message-input-textarea', '.message-input-textarea', 'textarea'],
			submit: ['.message-input-right-button button', '.message-input-right-button > *', '.message-input-right-button'],
			method: 'react-props',
		},
	},
	{
		id: 'MiniMax',
		name: 'MiniMax',
		url: 'https://agent.minimax.io',
		domain: 'minimax.io',
		icon: '🌐',
		webview: {
			input: ['div[data-testid="message-textarea"]', 'div[contenteditable="true"]', 'textarea'],
			submit: [
				'[data-testid*="send"]',
				'[data-testid*="submit"]',
				'button[data-testid*="send"]',
				'button[class*="send"]',
				'button:has(svg)',
				'button',
				'div[role="button"]',
			],
			method: 'rich-text',
		},
	},
	{
		id: 'Monica',
		name: 'Monica',
		url: 'https://monica.im/home',
		domain: 'monica.im',
		icon: '🌐',
		webview: {
			input: ['textarea', 'div[contenteditable="true"]'],
			submit: ['button[aria-label*="Send"]', 'button[aria-label*="Submit"]', 'button[class*="send"]'],
			method: 'react-props',
		},
	},
	{
		id: 'Arena',
		name: 'Arena',
		url: 'https://arena.ai/text/direct',
		domain: 'arena.ai',
		icon: '🌐',
		webview: {
			input: ['div.ProseMirror[contenteditable="true"]', '.tiptap[contenteditable="true"]'],
			submit: ['button[aria-label="Send message"]', 'button[type="submit"]'],
			method: 'react-props',
		},
	},
];

const URLS = {};
providers.forEach(p => {
	URLS[p.id] = p.url;
});

const isWebChat = id => providers.some(p => p.id === id);

const getProvider = id => providers.find(p => p.id === id);

module.exports = { providers, URLS, isWebChat, getProvider };
