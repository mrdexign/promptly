document.addEventListener('DOMContentLoaded', async () => {
	const generalTab = document.getElementById('generalTab');
	const promptsTab = document.getElementById('promptsTab');
	const promptsList = document.getElementById('promptsList');
	const defaultAssistantSelect = document.getElementById('defaultAssistant');
	const autoLaunchCheckbox = document.getElementById('autoLaunch');
	
	const addPromptBtn = document.getElementById('addPromptBtn');
	const saveBtn = document.getElementById('saveBtn');
	const cancelBtn = document.getElementById('cancelBtn');
	const closeBtn = document.getElementById('closeBtn');

	let activePrompts = [];
	let recordingBtn = null;
	let originalShortcut = '';

	// --- Tab Switching ---
	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
			
			btn.classList.add('active');
			const tabId = btn.dataset.tab;
			if (tabId === 'general') generalTab.classList.add('active');
			if (tabId === 'prompts') promptsTab.classList.add('active');
		});
	});

	// --- Load Current Settings ---
	try {
		const settings = await window.api.getSettings();
		defaultAssistantSelect.value = settings.currentAssistant || 'Copilot';
		autoLaunchCheckbox.checked = !!settings.autoLaunch;
		activePrompts = settings.prompts || [];
		
		renderPromptsList();
	} catch (err) {
		console.error('Failed to load settings:', err);
	}

	// --- Render Prompts List ---
	function renderPromptsList() {
		promptsList.innerHTML = '';
		activePrompts.forEach((prompt, index) => {
			const row = document.createElement('div');
			row.className = 'prompt-row';
			row.dataset.id = prompt.id;

			// Name input
			const nameInput = document.createElement('input');
			nameInput.type = 'text';
			nameInput.className = 'text-input';
			nameInput.value = prompt.name || '';
			nameInput.disabled = !!prompt.isSystem;
			nameInput.placeholder = 'Action Name';
			nameInput.addEventListener('change', (e) => {
				prompt.name = e.target.value;
			});

			// Shortcut button (recorder)
			const shortcutBtn = document.createElement('button');
			shortcutBtn.className = 'shortcut-recorder-btn no-drag';
			shortcutBtn.dataset.shortcut = prompt.shortcut || '';
			shortcutBtn.innerText = prompt.shortcut || 'None';
			shortcutBtn.title = 'Click to record new shortcut';
			shortcutBtn.addEventListener('click', (e) => {
				e.preventDefault();
				startRecording(shortcutBtn, prompt);
			});

			// Text prompt input
			const textInput = document.createElement('input');
			textInput.type = 'text';
			textInput.className = 'text-input';
			textInput.value = prompt.text || '';
			textInput.disabled = !!prompt.isSystem;
			textInput.placeholder = prompt.isSystem ? 'System Toggle' : 'e.g. Translate to Spanish';
			textInput.addEventListener('change', (e) => {
				prompt.text = e.target.value;
			});

			// Auto-Submit toggle
			const submitCell = document.createElement('div');
			submitCell.className = 'col-submit';
			if (!prompt.isSystem) {
				const switchLabel = document.createElement('label');
				switchLabel.className = 'switch';
				
				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.checked = !!prompt.autoSubmit;
				checkbox.addEventListener('change', (e) => {
					prompt.autoSubmit = e.target.checked;
				});
				
				const slider = document.createElement('span');
				slider.className = 'slider';
				
				switchLabel.appendChild(checkbox);
				switchLabel.appendChild(slider);
				submitCell.appendChild(switchLabel);
			} else {
				submitCell.textContent = '-';
				submitCell.style.color = 'var(--text-secondary)';
				submitCell.style.fontSize = '12px';
			}

			// Delete button
			const actionsCell = document.createElement('div');
			actionsCell.className = 'action-cell';
			
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'btn-delete no-drag';
			deleteBtn.innerHTML = '&times;';
			deleteBtn.title = 'Delete prompt';
			deleteBtn.disabled = !!prompt.isSystem;
			deleteBtn.addEventListener('click', () => {
				activePrompts.splice(index, 1);
				renderPromptsList();
			});

			actionsCell.appendChild(deleteBtn);

			row.appendChild(nameInput);
			row.appendChild(shortcutBtn);
			row.appendChild(textInput);
			row.appendChild(submitCell);
			row.appendChild(actionsCell);

			promptsList.appendChild(row);
		});
	}

	// --- Add Custom Prompt ---
	addPromptBtn.addEventListener('click', () => {
		const newId = 'prompt-' + Date.now();
		activePrompts.push({
			id: newId,
			name: 'Custom Prompt',
			shortcut: '',
			text: '',
			autoSubmit: true,
			isSystem: false
		});
		renderPromptsList();
		
		// Scroll to bottom of list
		setTimeout(() => {
			promptsList.scrollTop = promptsList.scrollHeight;
		}, 50);
	});

	// --- Shortcut Recording Logic ---
	function startRecording(btn, promptObj) {
		if (recordingBtn) {
			stopRecording();
		}
		recordingBtn = btn;
		originalShortcut = btn.dataset.shortcut;
		btn.classList.add('recording');
		btn.innerText = 'Press keys...';
		btn.blur(); // Blur to prevent triggering actions on current button focus
		
		const keydownHandler = (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			if (e.key === 'Escape') {
				btn.innerText = originalShortcut || 'None';
				btn.dataset.shortcut = originalShortcut;
				cleanup();
				return;
			}
			
			const keys = [];
			if (e.ctrlKey) keys.push('Ctrl');
			if (e.altKey) keys.push('Alt');
			if (e.shiftKey) keys.push('Shift');
			if (e.metaKey) keys.push('Super'); // Maps to Windows/Command key
			
			const key = e.key;
			const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(key);
			
			if (!isModifier) {
				let electronKey = key;
				if (key === ' ') {
					electronKey = 'Space';
				} else if (key.length === 1) {
					electronKey = key.toUpperCase();
				} else {
					if (key === 'ArrowUp') electronKey = 'Up';
					else if (key === 'ArrowDown') electronKey = 'Down';
					else if (key === 'ArrowLeft') electronKey = 'Left';
					else if (key === 'ArrowRight') electronKey = 'Right';
				}
				
				keys.push(electronKey);
				const finalShortcut = keys.join('+');
				
				btn.innerText = finalShortcut;
				btn.dataset.shortcut = finalShortcut;
				promptObj.shortcut = finalShortcut;
				cleanup();
			} else {
				if (keys.length > 0) {
					btn.innerText = keys.join('+') + '+...';
				}
			}
		};

		function cleanup() {
			window.removeEventListener('keydown', keydownHandler, true);
			stopRecording();
		}

		window.addEventListener('keydown', keydownHandler, true);
	}

	function stopRecording() {
		if (!recordingBtn) return;
		recordingBtn.classList.remove('recording');
		recordingBtn = null;
	}

	// --- Save & Cancel ---
	saveBtn.addEventListener('click', async () => {
		// Stop any recording first
		stopRecording();
		
		// Clean up and validate prompts before sending
		const finalPrompts = activePrompts.filter(p => {
			if (p.isSystem) return true;
			return p.name.trim() !== '' && p.shortcut.trim() !== '';
		});

		const newSettings = {
			currentAssistant: defaultAssistantSelect.value,
			autoLaunch: autoLaunchCheckbox.checked,
			prompts: finalPrompts
		};

		try {
			await window.api.saveSettings(newSettings);
		} catch (err) {
			console.error('Failed to save settings:', err);
		}
	});

	cancelBtn.addEventListener('click', () => {
		window.api.closeSettings();
	});

	closeBtn.addEventListener('click', () => {
		window.api.closeSettings();
	});
});
