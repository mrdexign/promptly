document.addEventListener('DOMContentLoaded', async () => {
	lucide.createIcons();
	const generalTab = document.getElementById('generalTab');
	const promptsTab = document.getElementById('promptsTab');
	const promptsList = document.getElementById('promptsList');
	const defaultAssistantSelect = document.getElementById('defaultAssistant');
	const autoLaunchCheckbox = document.getElementById('autoLaunch');
	const standardWindowCheckbox = document.getElementById('standardWindow');
	const themeToggle = document.getElementById('themeToggle');
	
	const addPromptBtn = document.getElementById('addPromptBtn');
	const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
	const saveBtn = document.getElementById('saveBtn');
	const cancelBtn = document.getElementById('cancelBtn');
	const closeBtn = document.getElementById('closeBtn');

	const historyTab = document.getElementById('historyTab');
	const historyList = document.getElementById('historyList');
	const historySearchInput = document.getElementById('historySearchInput');
	const historyCleanupSelect = document.getElementById('historyCleanupSelect');
	const clearHistoryBtn = document.getElementById('clearHistoryBtn');
	const historySettingsModal = document.getElementById('historySettingsModal');
	const historySettingsBtn = document.getElementById('historySettingsBtn');
	const historySettingsCloseBtn = document.getElementById('historySettingsCloseBtn');

	let activePrompts = [];
	let activeHistory = [];
	let recordingBtn = null;
	let originalShortcut = '';
	let initialSettingsJSON = '';
	let defaultPromptsJSON = '';

	const getSettingsObject = () => {
		const finalPrompts = activePrompts.filter(p => {
			if (p.isSystem) return true;
			return p.name.trim() !== '' && p.shortcut.trim() !== '';
		});

		return {
			currentAssistant: defaultAssistantSelect.value,
			autoLaunch: autoLaunchCheckbox.checked,
			standardWindow: standardWindowCheckbox.checked,
			theme: themeToggle.checked ? 'dark' : 'light',
			historyCleanup: historyCleanupSelect.value,
			prompts: finalPrompts.map(p => ({
				id: p.id,
				name: p.name,
				shortcut: p.shortcut,
				text: p.text,
				autoSubmit: !!p.autoSubmit,
				isSystem: !!p.isSystem
			}))
		};
	};

	const updateResetDefaultsButtonVisibility = () => {
		const currentPrompts = activePrompts.filter(p => {
			if (p.isSystem) return true;
			return p.name.trim() !== '' && p.shortcut.trim() !== '';
		});
		const currentPromptsJSON = JSON.stringify(currentPrompts.map(p => ({
			id: p.id,
			name: p.name,
			shortcut: p.shortcut,
			text: p.text,
			autoSubmit: !!p.autoSubmit,
			isSystem: !!p.isSystem
		})));

		if (currentPromptsJSON === defaultPromptsJSON) {
			resetDefaultsBtn.style.display = 'none';
		} else {
			resetDefaultsBtn.style.display = 'inline-flex';
		}
	};

	const updateSaveButtonState = () => {
		const currentSettingsJSON = JSON.stringify(getSettingsObject());
		saveBtn.disabled = (currentSettingsJSON === initialSettingsJSON);
		updateResetDefaultsButtonVisibility();
	};

	// --- Custom Confirmation Modal Helper ---
	const confirmModal = document.getElementById('confirmModal');
	const confirmTitle = document.getElementById('confirmTitle');
	const confirmMessage = document.getElementById('confirmMessage');
	const confirmCancelBtn = document.getElementById('confirmCancelBtn');
	const confirmApproveBtn = document.getElementById('confirmApproveBtn');
	const confirmCloseBtn = document.getElementById('confirmCloseBtn');

	function showConfirm(title, message, options = {}) {
		return new Promise((resolve) => {
			confirmTitle.textContent = title;
			confirmMessage.textContent = message;
			
			// Dynamic Button Configuration
			confirmApproveBtn.textContent = options.confirmText || 'Confirm';
			confirmCancelBtn.textContent = options.cancelText || 'Cancel';
			
			if (options.showCancel === false) {
				confirmCancelBtn.style.display = 'none';
			} else {
				confirmCancelBtn.style.display = 'inline-flex';
			}
			
			if (options.isDestructive) {
				confirmApproveBtn.className = 'btn btn-danger';
			} else {
				confirmApproveBtn.className = 'btn btn-primary';
			}

			confirmModal.classList.add('active');

			const cleanUp = (value) => {
				confirmModal.classList.remove('active');
				confirmApproveBtn.removeEventListener('click', onApprove);
				confirmCancelBtn.removeEventListener('click', onCancel);
				confirmCloseBtn.removeEventListener('click', onCancel);
				confirmModal.removeEventListener('click', onOverlayClick);
				resolve(value);
			};

			function onApprove(e) {
				e.preventDefault();
				cleanUp(true);
			}

			function onCancel(e) {
				e.preventDefault();
				cleanUp(false);
			}

			function onOverlayClick(e) {
				if (e.target === confirmModal) {
					cleanUp(false);
				}
			}

			confirmApproveBtn.addEventListener('click', onApprove);
			confirmCancelBtn.addEventListener('click', onCancel);
			confirmCloseBtn.addEventListener('click', onCancel);
			confirmModal.addEventListener('click', onOverlayClick);
		});
	}

	// --- Theme Support ---
	function applyTheme(theme) {
		document.body.classList.remove('theme-light', 'theme-dark');
		if (theme === 'light') {
			document.body.classList.add('theme-light');
		} else {
			document.body.classList.add('theme-dark');
		}
	}

	if (themeToggle) {
		themeToggle.addEventListener('change', () => {
			applyTheme(themeToggle.checked ? 'dark' : 'light');
		});
	}

	// --- Tab Switching ---
	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
			
			btn.classList.add('active');
			const tabId = btn.dataset.tab;
			if (tabId === 'general') generalTab.classList.add('active');
			if (tabId === 'prompts') promptsTab.classList.add('active');
			if (tabId === 'history') {
				historyTab.classList.add('active');
				loadHistoryList();
			}
		});
	});

	// --- Load Current Settings ---
	try {
		const settings = await window.api.getSettings();
		defaultAssistantSelect.value = settings.currentAssistant || 'Copilot';
		autoLaunchCheckbox.checked = !!settings.autoLaunch;
		standardWindowCheckbox.checked = !!settings.standardWindow;
		themeToggle.checked = settings.theme !== 'light';
		applyTheme(themeToggle.checked ? 'dark' : 'light');
		historyCleanupSelect.value = settings.historyCleanup || 'daily';
		activePrompts = settings.prompts || [];
		
		const defaults = await window.api.getDefaultPrompts();
		defaultPromptsJSON = JSON.stringify(defaults.map(p => ({
			id: p.id,
			name: p.name,
			shortcut: p.shortcut,
			text: p.text,
			autoSubmit: !!p.autoSubmit,
			isSystem: !!p.isSystem
		})));

		renderPromptsList();

		defaultAssistantSelect.addEventListener('change', updateSaveButtonState);
		autoLaunchCheckbox.addEventListener('change', updateSaveButtonState);
		standardWindowCheckbox.addEventListener('change', updateSaveButtonState);
		themeToggle.addEventListener('change', updateSaveButtonState);
		historyCleanupSelect.addEventListener('change', updateSaveButtonState);

		// Setup custom dropdown logic
		const initCustomSelects = () => {
			document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
				const trigger = wrapper.querySelector('.custom-select-trigger');
				const label = wrapper.querySelector('.custom-select-label');
				const optionsContainer = wrapper.querySelector('.custom-select-options');
				const selectId = wrapper.dataset.selectId;
				const hiddenSelect = document.getElementById(selectId);
				if (!hiddenSelect || !trigger || !label || !optionsContainer) return;

				const syncValue = () => {
					const val = hiddenSelect.value;
					const activeOpt = wrapper.querySelector(`.custom-select-option[data-value="${val}"]`);
					if (activeOpt) {
						label.textContent = activeOpt.textContent;
					}
					
					wrapper.querySelectorAll('.custom-select-option').forEach(opt => {
						if (opt.dataset.value === val) {
							opt.classList.add('selected');
						} else {
							opt.classList.remove('selected');
						}
					});
				};

				trigger.addEventListener('click', (e) => {
					e.stopPropagation();
					document.querySelectorAll('.custom-select-wrapper').forEach(other => {
						if (other !== wrapper) other.classList.remove('active');
					});
					wrapper.classList.toggle('active');
				});

				wrapper.querySelectorAll('.custom-select-option').forEach(opt => {
					opt.addEventListener('click', (e) => {
						e.stopPropagation();
						const val = opt.dataset.value;
						hiddenSelect.value = val;
						hiddenSelect.dispatchEvent(new Event('change'));
						wrapper.classList.remove('active');
					});
				});

				hiddenSelect.addEventListener('change', syncValue);
				syncValue();
			});

			document.addEventListener('click', () => {
				document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
					wrapper.classList.remove('active');
				});
			});
		};

		initCustomSelects();

		// Setup history page UI event listeners
		historySearchInput.addEventListener('input', () => {
			renderHistoryList();
		});

		if (historySettingsBtn && historySettingsModal) {
			historySettingsBtn.addEventListener('click', (e) => {
				e.preventDefault();
				historySettingsModal.classList.add('active');
			});
		}

		if (historySettingsCloseBtn && historySettingsModal) {
			historySettingsCloseBtn.addEventListener('click', (e) => {
				e.preventDefault();
				historySettingsModal.classList.remove('active');
			});
		}

		if (historySettingsModal) {
			historySettingsModal.addEventListener('click', (e) => {
				if (e.target === historySettingsModal) {
					historySettingsModal.classList.remove('active');
				}
			});
		}

		if (window.api.onHistoryUpdated) {
			window.api.onHistoryUpdated((items) => {
				activeHistory = items;
				renderHistoryList();
			});
		}

		clearHistoryBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			if (activeHistory.length === 0) return;
			const confirmed = await showConfirm(
				'Clear All History',
				'Are you sure you want to permanently delete your entire prompt history? This cannot be undone.',
				{ isDestructive: true, confirmText: 'Clear All' }
			);
			if (confirmed) {
				try {
					activeHistory = await window.api.clearHistory();
					renderHistoryList();
					if (historySettingsModal) {
						historySettingsModal.classList.remove('active');
					}
				} catch (err) {
					console.error('Failed to clear history:', err);
				}
			}
		});

		initialSettingsJSON = JSON.stringify(getSettingsObject());
		updateSaveButtonState();
	} catch (err) {
		console.error('Failed to load settings:', err);
	}

	const loadHistoryList = async () => {
		try {
			activeHistory = await window.api.getHistory();
			renderHistoryList();
		} catch (err) {
			console.error('Failed to load history list:', err);
		}
	};

	const renderHistoryList = () => {
		historyList.innerHTML = '';
		const query = historySearchInput.value.toLowerCase().trim();
		
		const filtered = activeHistory.filter(item => {
			return item.text.toLowerCase().includes(query);
		});

		if (filtered.length === 0) {
			const emptyState = document.createElement('div');
			emptyState.className = 'history-empty-state';
			emptyState.innerHTML = `
				<i data-lucide="archive"></i>
				<span>${query ? 'No matching prompts found.' : 'No prompt history logs yet.'}</span>
			`;
			historyList.appendChild(emptyState);
			lucide.createIcons();
			return;
		}

		filtered.forEach(item => {
			const card = document.createElement('div');
			card.className = 'history-card';

			const header = document.createElement('div');
			header.className = 'history-card-header';

			const headerLeft = document.createElement('div');
			headerLeft.className = 'history-card-header-left';

			const dateStr = new Date(item.timestamp).toLocaleString(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short'
			});

			const timeSpan = document.createElement('span');
			timeSpan.className = 'history-card-time';
			timeSpan.textContent = dateStr;
			headerLeft.appendChild(timeSpan);

			if (item.assistant) {
				const modelPill = document.createElement('span');
				modelPill.className = 'history-card-model-pill';
				modelPill.textContent = item.assistant;
				headerLeft.appendChild(modelPill);
			}

			const actions = document.createElement('div');
			actions.className = 'history-card-actions';

			const copyBtn = document.createElement('button');
			copyBtn.className = 'history-action-btn no-drag';
			copyBtn.title = 'Copy prompt text';
			copyBtn.innerHTML = '<i data-lucide="copy"></i>';
			copyBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				try {
					await navigator.clipboard.writeText(item.text);
					
					copyBtn.innerHTML = '<i data-lucide="check" style="color: #10B981;"></i>';
					lucide.createIcons();
					setTimeout(() => {
						copyBtn.innerHTML = '<i data-lucide="copy"></i>';
						lucide.createIcons();
					}, 1500);
				} catch (err) {
					console.error('Failed to copy text:', err);
				}
			});

			const deleteItemBtn = document.createElement('button');
			deleteItemBtn.className = 'history-action-btn btn-delete-item no-drag';
			deleteItemBtn.title = 'Delete history item';
			deleteItemBtn.innerHTML = '<i data-lucide="trash-2"></i>';
			deleteItemBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const confirmed = await showConfirm(
					'Delete History Item',
					'Are you sure you want to delete this prompt from your history?',
					{ isDestructive: true, confirmText: 'Delete' }
				);
				if (confirmed) {
					try {
						activeHistory = await window.api.deleteHistoryItem(item.id);
						renderHistoryList();
					} catch (err) {
						console.error('Failed to delete history item:', err);
					}
				}
			});

			actions.appendChild(copyBtn);
			actions.appendChild(deleteItemBtn);
			header.appendChild(headerLeft);
			header.appendChild(actions);

			const body = document.createElement('div');
			body.className = 'history-card-body';
			body.textContent = item.text;

			card.appendChild(header);
			card.appendChild(body);

			historyList.appendChild(card);
		});

		lucide.createIcons();
	};

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
			nameInput.addEventListener('input', (e) => {
				prompt.name = e.target.value;
				updateSaveButtonState();
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
			textInput.addEventListener('input', (e) => {
				prompt.text = e.target.value;
				updateSaveButtonState();
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
					updateSaveButtonState();
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
			deleteBtn.addEventListener('click', async () => {
				const confirmed = await showConfirm(
					'Delete Prompt',
					`Are you sure you want to delete the prompt "${prompt.name || 'Untitled'}"?`,
					{ isDestructive: true, confirmText: 'Delete' }
				);
				if (confirmed) {
					activePrompts.splice(index, 1);
					renderPromptsList();
					updateSaveButtonState();
				}
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
		updateSaveButtonState();
		
		// Scroll to bottom of list
		setTimeout(() => {
			promptsList.scrollTop = promptsList.scrollHeight;
		}, 50);
	});
	// --- Reset to Default Prompts ---
	resetDefaultsBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		const confirmed = await showConfirm(
			'Reset Defaults',
			'Are you sure you want to reset all shortcuts and prompts to their default values? This will overwrite your current settings.',
			{ isDestructive: true, confirmText: 'Reset' }
		);
		if (confirmed) {
			try {
				activePrompts = await window.api.getDefaultPrompts();
				renderPromptsList();
				updateSaveButtonState();
			} catch (err) {
				console.error('Failed to reset default prompts:', err);
			}
		}
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
				updateSaveButtonState();
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
			standardWindow: standardWindowCheckbox.checked,
			theme: themeToggle.checked ? 'dark' : 'light',
			historyCleanup: historyCleanupSelect.value,
			prompts: finalPrompts
		};

		try {
			await window.api.saveSettings(newSettings);
			initialSettingsJSON = JSON.stringify(getSettingsObject());
			updateSaveButtonState();
			const exitSettings = await showConfirm(
				'Settings Saved',
				'Your settings have been saved successfully.',
				{
					confirmText: 'Exit Settings',
					cancelText: 'Ok',
					isDestructive: false
				}
			);
			if (exitSettings) {
				window.api.closeSettings();
			}
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

	// --- Version and Update Check ---
	const updateVersionInfo = document.getElementById('updateVersionInfo');
	const checkUpdateBtn = document.getElementById('checkUpdateBtn');
	const sidebarVersion = document.getElementById('sidebarVersion');
	const aboutLink = document.getElementById('aboutLink');

	try {
		const version = await window.api.getAppVersion();
		updateVersionInfo.textContent = `Current version is v${version}`;
		if (sidebarVersion) {
			sidebarVersion.textContent = `v${version}`;
		}
	} catch (err) {
		console.error('Failed to get app version:', err);
		updateVersionInfo.textContent = 'Error loading version';
	}

	checkUpdateBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		
		const originalText = checkUpdateBtn.textContent;
		checkUpdateBtn.disabled = true;
		checkUpdateBtn.textContent = 'Checking...';
		
		try {
			const result = await window.api.checkUpdateStatus();
			if (result.success === false) {
				await showConfirm(
					'Update Check Failed',
					`Could not fetch update information: ${result.error || 'Unknown error'}`,
					{ confirmText: 'OK', showCancel: false }
				);
			} else if (result.updateAvailable) {
				const confirmed = await showConfirm(
					'Update Available',
					`A new version (v${result.latestVersion}) is available! (Current: v${result.currentVersion}).\nWould you like to download and install it now?`,
					{ confirmText: 'Update Now', cancelText: 'Later' }
				);
				if (confirmed) {
					window.api.startUpdate();
				}
			} else {
				await showConfirm(
					'Promptly Update',
					`Promptly is up to date!\nYou are running the latest version (v${result.currentVersion}).`,
					{ confirmText: 'OK', showCancel: false }
				);
			}
		} catch (err) {
			console.error('Failed to check updates:', err);
			await showConfirm(
				'Update Check Failed',
				`Could not check for updates: ${err.message}`,
				{ confirmText: 'OK', showCancel: false }
			);
		} finally {
			checkUpdateBtn.disabled = false;
			checkUpdateBtn.textContent = originalText;
		}
	});

	if (aboutLink) {
		aboutLink.addEventListener('click', (e) => {
			e.preventDefault();
			window.api.openAboutPage();
		});
	}

	// Automatically check for updates on load (quietly, only prompting if an update is available)
	setTimeout(async () => {
		try {
			const result = await window.api.checkUpdateStatus();
			if (result && result.success && result.updateAvailable) {
				const confirmed = await showConfirm(
					'Update Available',
					`A new version (v${result.latestVersion}) is available! (Current: v${result.currentVersion}).\nWould you like to download and install it now?`,
					{ confirmText: 'Update Now', cancelText: 'Later' }
				);
				if (confirmed) {
					window.api.startUpdate();
				}
			}
		} catch (err) {
			console.error('Failed to check updates automatically on load:', err);
		}
	}, 1000);
});
