let messages = [];
let isWaitingForResponse = false;
let providerId = null;
let providers = [];
let isMaximized = false;

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');
const providerName = document.getElementById('providerName');
const providerDropdown = document.getElementById('providerDropdown');
const providerSelectWrapper = document.querySelector('.provider-select-wrapper');

function updateClearButtonVisibility() {
    clearChatBtn.style.display = messages.length > 0 ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
    const theme = await window.api.getTheme();
    document.body.classList.add(`theme-${theme}`);

    const isStandardWindow = await window.api.getStandardWindow();
    if (isStandardWindow) {
        maximizeBtn.style.display = 'none';
        closeBtn.style.display = 'none';
    }

    providers = await window.api.getProviders();
    const provider = await window.api.getProvider();
    if (provider) {
        providerId = provider.id;
        providerName.textContent = provider.name;
        document.title = `Promptly ${provider.name}`;
    }

    renderProviderDropdown();
    chatInput.focus();
});

window.api.onProviderChanged((provider) => {
    if (provider) {
        providerId = provider.id;
        providerName.textContent = provider.name;
        document.title = `Promptly ${provider.name}`;
        renderProviderDropdown();
    }
});

window.api.onStandardWindowChanged((isStandard) => {
    maximizeBtn.style.display = isStandard ? 'none' : '';
    closeBtn.style.display = isStandard ? 'none' : '';
});

providerSelectWrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    providerDropdown.classList.toggle('active');
});

document.addEventListener('click', () => {
    providerDropdown.classList.remove('active');
});

function renderProviderDropdown() {
    providerDropdown.innerHTML = '';
    providers.forEach(p => {
        const item = document.createElement('div');
        item.className = 'provider-dropdown-item' + (p.id === providerId ? ' selected' : '');
        item.textContent = p.name;
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (p.id !== providerId) {
                await window.api.setProvider(p.id);
                providerId = p.id;
                providerName.textContent = p.name;
                document.title = `Promptly ${p.name}`;
                renderProviderDropdown();
            }
            providerDropdown.classList.remove('active');
        });
        providerDropdown.appendChild(item);
    });
}

chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
    sendBtn.disabled = !chatInput.value.trim() || isWaitingForResponse;
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

clearChatBtn.addEventListener('click', () => {
    messages = [];
    updateClearButtonVisibility();
    chatMessages.innerHTML = `
        <div class="chat-empty-state">
            <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <p class="empty-title">Start a conversation</p>
            <p class="empty-subtitle">Type your message below to chat with the API</p>
        </div>
    `;
    chatInput.focus();
});

maximizeBtn.addEventListener('click', async () => {
    isMaximized = await window.api.toggleMaximize();
    updateMaximizeIcon();
});

function updateMaximizeIcon() {
    if (isMaximized) {
        maximizeBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
            </svg>
        `;
        maximizeBtn.title = 'Restore';
    } else {
        maximizeBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
        `;
        maximizeBtn.title = 'Maximize';
    }
}

closeBtn.addEventListener('click', () => {
    window.api.minimize();
});

function isRTLText(text) {
    const rtlChars = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlChars.test(text);
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isWaitingForResponse || !providerId) return;

    const emptyState = chatMessages.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    messages.push({ role: 'user', content: text });
    updateClearButtonVisibility();
    appendMessage('user', text);

    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;
    isWaitingForResponse = true;

    const typingEl = appendTypingIndicator();
    let streamEl = null;
    let streamContent = '';

    window.api.onStreamChunk((chunk) => {
        if (!streamEl) {
            typingEl.remove();
            streamEl = createStreamMessage();
            streamContent = '';
        }
        streamContent += chunk;
        updateStreamMessage(streamEl, streamContent);
    });

    try {
        const result = await window.api.sendMessage(providerId, messages);
        
        if (streamEl) {
            finalizeStreamMessage(streamEl, result.success ? result.text : `Error: ${result.error}`);
        } else {
            typingEl.remove();
            if (result.success) {
                appendMessage('ai', result.text);
            } else {
                appendMessage('ai', `Error: ${result.error}`);
            }
        }

        if (result.success) {
            messages.push({ role: 'assistant', content: result.text });
            updateClearButtonVisibility();
        }
    } catch (err) {
        if (streamEl) {
            finalizeStreamMessage(streamEl, `Error: ${err.message}`);
        } else {
            typingEl.remove();
            appendMessage('ai', `Error: ${err.message}`);
        }
    } finally {
        isWaitingForResponse = false;
        sendBtn.disabled = !chatInput.value.trim();
        chatInput.focus();
    }
}

function appendMessage(type, text) {
    const div = document.createElement('div');
    div.className = `message message-${type}`;
    
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = type === 'user' ? 'You' : 'Assistant';

    const content = document.createElement('div');
    content.className = 'message-content';
    
    if (type === 'ai') {
        content.innerHTML = parseMarkdown(text);
        if (isRTLText(text)) {
            content.classList.add('rtl');
            document.body.classList.add('rtl-lang');
        }
    } else {
        content.textContent = text;
        if (isRTLText(text)) {
            content.style.direction = 'rtl';
            content.style.textAlign = 'right';
            document.body.classList.add('rtl-lang');
        }
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy
    `;
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text);
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
        `;
        setTimeout(() => {
            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy
            `;
        }, 1500);
    });
    
    actions.appendChild(copyBtn);
    div.appendChild(label);
    div.appendChild(content);
    div.appendChild(actions);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message message-ai';
    div.innerHTML = `
        <div class="message-label">Assistant</div>
        <div class="message-content">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

function createStreamMessage() {
    const div = document.createElement('div');
    div.className = 'message message-ai streaming';
    
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = 'Assistant';

    const content = document.createElement('div');
    content.className = 'message-content stream-content';

    div.appendChild(label);
    div.appendChild(content);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

function updateStreamMessage(el, text) {
    const content = el.querySelector('.stream-content');
    if (content) {
        const html = parseMarkdown(text);
        const existingHtml = content.innerHTML;
        
        if (html !== existingHtml) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            
            const lastChild = wrapper.lastElementChild;
            if (lastChild && !content.lastElementChild?.isEqualNode(lastChild)) {
                lastChild.classList.add('stream-fade-in');
            }
            
            content.innerHTML = html;
            
            if (isRTLText(text)) {
                content.classList.add('rtl');
                document.body.classList.add('rtl-lang');
            }
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function finalizeStreamMessage(el, text) {
    el.classList.remove('streaming');
    const content = el.querySelector('.stream-content');
    if (content) {
        content.className = 'message-content';
        content.innerHTML = parseMarkdown(text);
        if (isRTLText(text)) {
            content.classList.add('rtl');
            document.body.classList.add('rtl-lang');
        }
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy
    `;
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text);
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
        `;
        setTimeout(() => {
            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy
            `;
        }, 1500);
    });
    
    actions.appendChild(copyBtn);
    el.appendChild(actions);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightSyntax(code, lang) {
    const escaped = escapeHtml(code);
    
    const keywords = {
        javascript: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|throw|typeof|instanceof|in|of|null|undefined|true|false)\b/g,
        python: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|True|False|None|and|or|not|is|in|print|self)\b/g,
        java: /\b(public|private|protected|static|final|void|int|String|class|extends|implements|import|package|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|throw|null|true|false)\b/g,
        html: /(&lt;\/?)([\w-]+)/g,
        css: /\b(color|background|margin|padding|border|display|flex|grid|width|height|font|text|position|top|left|right|bottom|transform|transition|animation)\b/g,
        sql: /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|JOIN|ON|AND|OR|NOT|NULL|VALUES|ORDER|BY|GROUP|HAVING|LIMIT|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX)\b/gi,
        json: /"([^"]+)":/g,
        bash: /\b(echo|cd|ls|mkdir|rm|cp|mv|cat|grep|sed|awk|chmod|chown|sudo|apt|npm|git|docker)\b/g,
        typescript: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|throw|typeof|instanceof|in|of|null|undefined|true|false|interface|type|enum|implements|abstract|readonly|private|public|protected|static|as|is|keyof|never|unknown|any|void|string|number|boolean)\b/g,
        rust: /\b(fn|let|mut|pub|struct|enum|impl|trait|use|mod|crate|self|super|return|if|else|for|while|loop|break|continue|match|true|false|i8|i16|i32|i64|u8|u16|u32|u64|f32|f64|bool|char|str|String|Vec|Option|Result|Some|None|Ok|Err)\b/g,
        go: /\b(package|import|func|return|if|else|for|range|switch|case|default|var|const|type|struct|interface|map|chan|go|defer|select|break|continue|true|false|nil|int|string|bool|float64|error)\b/g,
    };

    const langLower = lang.toLowerCase();
    let result = escaped;

    if (langLower === 'json') {
        result = result.replace(/"([^"]+)":/g, '<span class="token-property">"$1"</span>:');
        result = result.replace(/: "([^"]*)"/g, ': <span class="token-string">"$1"</span>');
        result = result.replace(/: (\d+)/g, ': <span class="token-number">$1</span>');
        result = result.replace(/: (true|false|null)/g, ': <span class="token-boolean">$1</span>');
    } else if (langLower === 'html') {
        result = result.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="token-tag">$2</span>');
        result = result.replace(/\s([\w-]+)=/g, ' <span class="token-attr">$1</span>=');
    } else if (langLower === 'css') {
        result = result.replace(/\/\*[\s\S]*?\*\//g, '<span class="token-comment">$&</span>');
        result = result.replace(/\b([\w-]+)\s*:/g, '<span class="token-property">$1</span>:');
        result = result.replace(/:\s*([^;{]+)/g, ': <span class="token-string">$1</span>');
    } else {
        // Comments
        result = result.replace(/(\/\/.*$)/gm, '<span class="token-comment">$1</span>');
        result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>');
        result = result.replace(/(#.*$)/gm, '<span class="token-comment">$1</span>');
        
        // Strings
        result = result.replace(/(&quot;[^&]*?&quot;)/g, '<span class="token-string">$1</span>');
        result = result.replace(/(&#39;[^&]*?&#39;)/g, '<span class="token-string">$1</span>');
        result = result.replace(/(`[^`]*?`)/g, '<span class="token-string">$1</span>');
        
        // Numbers
        result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="token-number">$1</span>');
        
        // Keywords
        const keywordsForLang = keywords[langLower] || keywords.javascript;
        result = result.replace(keywordsForLang, '<span class="token-keyword">$&</span>');
        
        // Functions (word followed by parenthesis)
        result = result.replace(/\b([a-zA-Z_]\w*)\s*\(/g, '<span class="token-function">$1</span>(');
    }

    return result;
}

function parseMarkdown(text) {
    let html = text;

    // Code blocks with language
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || 'code';
        const id = 'code-' + Math.random().toString(36).substr(2, 9);
        const highlighted = highlightSyntax(code.trim(), language);
        return `<div class="code-block-wrapper">
            <div class="code-block-header">
                <span class="code-block-lang">${language}</span>
                <button class="code-copy-btn" onclick="copyCode('${id}')">Copy</button>
            </div>
            <div class="code-block-body"><code id="${id}">${highlighted}</code></div>
        </div>`;
    });

    // Code blocks without language
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
        const id = 'code-' + Math.random().toString(36).substr(2, 9);
        return `<div class="code-block-wrapper">
            <div class="code-block-header">
                <span class="code-block-lang">code</span>
                <button class="code-copy-btn" onclick="copyCode('${id}')">Copy</button>
            </div>
            <div class="code-block-body"><code id="${id}">${escapeHtml(code.trim())}</code></div>
        </div>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Unordered lists
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // Ordered lists
    html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<div)/g, '$1');
    html = html.replace(/(<\/div>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)/g, '$1');
    html = html.replace(/(<hr>)<\/p>/g, '$1');

    return html;
}

window.copyCode = function(id) {
    const codeEl = document.getElementById(id);
    if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent);
        const btn = codeEl.closest('.code-block-wrapper').querySelector('.code-copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }
};
