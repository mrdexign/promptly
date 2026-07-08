document.addEventListener('DOMContentLoaded', async () => {
	let webchatProviders = [];

	const renderWebChatOptions = () => {

		// 1. Populate General Tab provider selector dropdown
		const webChatsGroup = document.getElementById('webChatsGroup');
		if (webChatsGroup) {
			const label = webChatsGroup.querySelector('.provider-select-group-label');
			webChatsGroup.innerHTML = '';
			if (label) webChatsGroup.appendChild(label);

			webchatProviders.forEach(p => {
				const opt = document.createElement('div');
				opt.className = 'provider-select-option';
				opt.dataset.value = p.id;
				opt.dataset.type = 'webchat';
				opt.innerHTML = `
					<span class="provider-option-icon">${p.icon || '🌐'}</span>
					<span>${p.name}</span>
				`;
				opt.addEventListener('click', (e) => {
					e.stopPropagation();
					activeAssistantId = p.id;
					rebuildAllSelects();
					renderApiProvidersList();
					updateProvidersTabActiveState();
					updateProviderSelector();
					providerSelectWrapper.classList.remove('active');
					autoSave();
				});
				webChatsGroup.appendChild(opt);
			});
		}

		// 2. Populate Providers Tab custom select and native select options
		const webChatSelectOptions = document.getElementById('webChatSelectOptions');
		const webChatSelect = document.getElementById('webChatSelect');

		if (webChatSelectOptions && webChatSelect) {
			webChatSelectOptions.innerHTML = '';
			webChatSelect.innerHTML = '';

			webchatProviders.forEach(p => {
				const opt = document.createElement('div');
				opt.className = 'custom-select-option';
				opt.dataset.value = p.id;
				opt.textContent = p.name;
				webChatSelectOptions.appendChild(opt);

				const nativeOpt = document.createElement('option');
				nativeOpt.value = p.id;
				nativeOpt.textContent = p.name;
				webChatSelect.appendChild(nativeOpt);
			});
		}
	};

	renderWebChatOptions();
	lucide.createIcons();
	const generalTab = document.getElementById('generalTab');
	const promptsTab = document.getElementById('promptsTab');
	const promptsList = document.getElementById('promptsList');
	const autoLaunchCheckbox = document.getElementById('autoLaunch');
	const standardWindowCheckbox = document.getElementById('standardWindow');
	const themeToggle = document.getElementById('themeToggle');

	const addPromptBtn = document.getElementById('addPromptBtn');
	const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
	const closeBtn = document.getElementById('closeBtn');

	const historyTab = document.getElementById('historyTab');
	const historyList = document.getElementById('historyList');
	const historySearchInput = document.getElementById('historySearchInput');
	const historyCleanupSelect = document.getElementById('historyCleanupSelect');
	const clearHistoryBtn = document.getElementById('clearHistoryBtn');
	const historySettingsModal = document.getElementById('historySettingsModal');
	const historySettingsBtn = document.getElementById('historySettingsBtn');
	const historySettingsCloseBtn = document.getElementById('historySettingsCloseBtn');

	// Providers-related elements
	const providersTab = document.getElementById('providersTab');
	const webChatBox = document.getElementById('webChatBox');
	const webChatSelect = document.getElementById('webChatSelect');
	const webChatStatus = document.getElementById('webChatStatus');
	const apiProvidersList = document.getElementById('apiProvidersList');
	const addApiProviderBtn = document.getElementById('addApiProviderBtn');

	// Provider selector elements (General tab)
	const providerSelectWrapper = document.getElementById('providerSelectWrapper');
	const providerSelectTrigger = document.getElementById('providerSelectTrigger');
	const providerSelectLabel = document.getElementById('providerSelectLabel');
	const providerBadge = document.getElementById('providerBadge');
	const providerSelectDropdown = document.getElementById('providerSelectDropdown');
	const activeProviderDesc = document.getElementById('activeProviderDesc');
	const apiProvidersGroup = document.getElementById('apiProvidersGroup');

	// API modal fields
	const apiProviderModal = document.getElementById('apiProviderModal');
	const apiProviderForm = document.getElementById('apiProviderForm');
	const apiModalTitle = document.getElementById('apiModalTitle');
	const apiModalCloseBtn = document.getElementById('apiModalCloseBtn');
	const apiModalCancelBtn = document.getElementById('apiModalCancelBtn');
	const apiModalSaveBtn = document.getElementById('apiModalSaveBtn');

	const apiProviderId = document.getElementById('apiProviderId');
	const apiName = document.getElementById('apiName');
	const apiBaseUrl = document.getElementById('apiBaseUrl');
	const apiApiKey = document.getElementById('apiApiKey');
	const apiModel = document.getElementById('apiModel');
	const apiSystemPrompt = document.getElementById('apiSystemPrompt');
	const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');

	let activePrompts = [];
	let activeHistory = [];
	let recordingBtn = null;
	let originalShortcut = '';
	let defaultPromptsJSON = '';

	let activeAssistantId = 'Copilot';
	let activeApiProviders = [];

	const getSettingsObject = () => {
		const finalPrompts = activePrompts.filter(p => {
			if (p.isSystem) return true;
			return p.name.trim() !== '' && p.shortcut.trim() !== '';
		});

		return {
			currentAssistant: activeAssistantId,
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
				isSystem: !!p.isSystem,
			})),
			apiProviders: activeApiProviders,
		};
	};

	const updateResetDefaultsButtonVisibility = () => {
		const currentPrompts = activePrompts.filter(p => {
			if (p.isSystem) return true;
			return p.name.trim() !== '' && p.shortcut.trim() !== '';
		});
		const currentPromptsJSON = JSON.stringify(
			currentPrompts.map(p => ({
				id: p.id,
				name: p.name,
				shortcut: p.shortcut,
				text: p.text,
				autoSubmit: !!p.autoSubmit,
				isSystem: !!p.isSystem,
			})),
		);

		if (currentPromptsJSON === defaultPromptsJSON) {
			resetDefaultsBtn.style.display = 'none';
		} else {
			resetDefaultsBtn.style.display = 'inline-flex';
		}
	};

	const autoSave = async () => {
		updateResetDefaultsButtonVisibility();
		try {
			await window.api.saveSettings(getSettingsObject());
		} catch (err) {
			console.error('Failed to auto-save settings:', err);
		}
	};

	// --- Custom Confirmation Modal Helper ---
	const confirmModal = document.getElementById('confirmModal');
	const confirmTitle = document.getElementById('confirmTitle');
	const confirmMessage = document.getElementById('confirmMessage');
	const confirmCancelBtn = document.getElementById('confirmCancelBtn');
	const confirmApproveBtn = document.getElementById('confirmApproveBtn');
	const confirmCloseBtn = document.getElementById('confirmCloseBtn');

	function showConfirm(title, message, options = {}) {
		return new Promise(resolve => {
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

			const cleanUp = value => {
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
			localStorage.setItem('activeTab', tabId);
			if (tabId === 'general') generalTab.classList.add('active');
			if (tabId === 'providers') providersTab.classList.add('active');
			if (tabId === 'prompts') promptsTab.classList.add('active');
			if (tabId === 'history') {
				historyTab.classList.add('active');
				loadHistoryList();
			}
		});
	});

	const savedTab = localStorage.getItem('activeTab');
	if (savedTab) {
		const savedBtn = document.querySelector(`.tab-btn[data-tab="${savedTab}"]`);
		if (savedBtn) savedBtn.click();
	}

	// --- Providers and APIs Helper Functions ---
	const isWebChat = id => webchatProviders.some(p => p.id === id);

	const updateProvidersTabActiveState = () => {
		const webChatsGroup = document.querySelector('.providers-group');
		if (isWebChat(activeAssistantId)) {
			if (webChatsGroup) webChatsGroup.classList.add('active-group');
			if (webChatBox) webChatBox.classList.add('active');
			if (webChatStatus) {
				webChatStatus.innerHTML = '<i data-lucide="check" style="width: 10px; height: 10px;"></i> Active';
				webChatStatus.className = 'api-active-badge';
				webChatStatus.style.display = 'inline-flex';
				lucide.createIcons();
			}
		} else {
			if (webChatsGroup) webChatsGroup.classList.remove('active-group');
			if (webChatBox) webChatBox.classList.remove('active');
			if (webChatStatus) {
				webChatStatus.innerHTML = '';
				webChatStatus.className = 'web-chat-status';
				webChatStatus.style.display = '';
			}
		}
	};

	const updateProviderSelector = () => {
		const isCurrentWebChat = isWebChat(activeAssistantId);
		let providerName = 'Copilot';
		let providerType = 'webchat';

		if (isCurrentWebChat) {
			providerName = activeAssistantId;
			providerType = 'webchat';
		} else {
			const apiProvider = activeApiProviders.find(p => p.id === activeAssistantId);
			if (apiProvider) {
				providerName = apiProvider.name;
				providerType = 'api';
			} else {
				providerName = 'Copilot';
				providerType = 'webchat';
				activeAssistantId = 'Copilot';
			}
		}

		// Update trigger display
		providerBadge.textContent = providerType === 'webchat' ? 'Chat' : 'API';
		providerBadge.className = `provider-select-badge badge-${providerType}`;
		providerSelectLabel.textContent = providerName;

		// Update description
		if (activeProviderDesc) {
			activeProviderDesc.textContent = providerType === 'webchat'
				? `Using ${providerName} web interface`
				: `Connected to ${providerName}`;
		}

		// Update dropdown selection state
		providerSelectDropdown.querySelectorAll('.provider-select-option').forEach(opt => {
			opt.classList.toggle('selected', opt.dataset.value === activeAssistantId);
		});

		// Rebuild API providers list in dropdown
		const existingApiOptions = apiProvidersGroup.querySelectorAll('.provider-select-option');
		existingApiOptions.forEach(opt => opt.remove());

		if (activeApiProviders.length === 0) {
			const emptyMsg = document.createElement('div');
			emptyMsg.className = 'provider-empty-state';
			emptyMsg.textContent = 'No API providers configured';
			apiProvidersGroup.appendChild(emptyMsg);
		} else {
			activeApiProviders.forEach(provider => {
				const opt = document.createElement('div');
				opt.className = 'provider-select-option';
				opt.dataset.value = provider.id;
				opt.dataset.type = 'api';
				if (provider.id === activeAssistantId) {
					opt.classList.add('selected');
				}
				opt.innerHTML = `<span class="provider-option-icon">⚡</span><span>${provider.name}</span>`;
				opt.addEventListener('click', (e) => {
					e.stopPropagation();
					activeAssistantId = provider.id;
					rebuildAllSelects();
					renderApiProvidersList();
					updateProvidersTabActiveState();
					updateProviderSelector();
					providerSelectWrapper.classList.remove('active');
					autoSave();
				});
				apiProvidersGroup.appendChild(opt);
			});
		}
	};

	const rebuildAllSelects = () => {
		const isCurrentWebChat = isWebChat(activeAssistantId);
		if (webChatSelect) {
			if (isCurrentWebChat) {
				webChatSelect.value = activeAssistantId;
			}
			// Update custom select label
			const wrapper = document.querySelector('.custom-select-wrapper[data-select-id="webChatSelect"]');
			if (wrapper) {
				const label = wrapper.querySelector('.custom-select-label');
				const options = wrapper.querySelectorAll('.custom-select-option');
				if (label) {
					const activeOpt = Array.from(options).find(o => o.dataset.value === webChatSelect.value);
					label.textContent = activeOpt ? activeOpt.textContent : 'Copilot';
				}
				options.forEach(o => {
					o.classList.toggle('selected', o.dataset.value === webChatSelect.value);
				});
			}
		}
		updateProvidersTabActiveState();
	};

	const activateApiProvider = (providerId) => {
		activeAssistantId = providerId;
		rebuildAllSelects();
		renderApiProvidersList();
		updateProvidersTabActiveState();
		updateProviderSelector();
		autoSave();
	};

	const renderApiProvidersList = () => {
		apiProvidersList.innerHTML = '';

		if (activeApiProviders.length === 0) {
			const emptyState = document.createElement('div');
			emptyState.className = 'history-empty-state';
			emptyState.style.height = '120px';
			emptyState.innerHTML = `
				<i data-lucide="cpu" style="width: 32px; height: 32px; opacity: 0.4;"></i>
				<span style="font-size: 13px;">No custom API providers configured yet.</span>
			`;
			apiProvidersList.appendChild(emptyState);
			lucide.createIcons();
			return;
		}

		let draggedItem = null;

		activeApiProviders.forEach((provider, index) => {
			const card = document.createElement('div');
			card.className = 'api-provider-card';
			card.draggable = true;
			card.dataset.index = index;
			if (provider.id === activeAssistantId) {
				card.classList.add('active');
			}

			card.addEventListener('dragstart', (e) => {
				draggedItem = card;
				card.classList.add('dragging');
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', index);
			});

			card.addEventListener('dragend', () => {
				card.classList.remove('dragging');
				draggedItem = null;
				document.querySelectorAll('.api-provider-card').forEach(c => c.classList.remove('drag-over'));
			});

			card.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				if (draggedItem && draggedItem !== card) {
					card.classList.add('drag-over');
				}
			});

			card.addEventListener('dragleave', () => {
				card.classList.remove('drag-over');
			});

			card.addEventListener('drop', (e) => {
				e.preventDefault();
				card.classList.remove('drag-over');
				const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
				const toIndex = index;
				if (fromIndex !== toIndex) {
					const [moved] = activeApiProviders.splice(fromIndex, 1);
					activeApiProviders.splice(toIndex, 0, moved);
					renderApiProvidersList();
					autoSave();
				}
			});

			card.addEventListener('click', e => {
				if (e.target.closest('.no-card-click')) return;
				activateApiProvider(provider.id);
			});

			const info = document.createElement('div');
			info.className = 'api-provider-info';

			const nameRow = document.createElement('div');
			nameRow.className = 'api-provider-name-row';

			const name = document.createElement('span');
			name.className = 'api-provider-name';
			name.textContent = provider.name;
			nameRow.appendChild(name);

			if (provider.id === activeAssistantId) {
				const badge = document.createElement('span');
				badge.className = 'api-active-badge';
				badge.innerHTML = '<i data-lucide="check" style="width: 10px; height: 10px;"></i> Active';
				nameRow.appendChild(badge);
			}

			const details = document.createElement('div');
			details.className = 'api-provider-details';

			const modelItem = document.createElement('div');
			modelItem.className = 'api-provider-detail-item';
			modelItem.innerHTML = `<i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> ${provider.model}`;

			const urlItem = document.createElement('div');
			urlItem.className = 'api-provider-detail-item';
			const displayUrl = provider.baseUrl.length > 35 ? provider.baseUrl.substring(0, 32) + '...' : provider.baseUrl;
			urlItem.innerHTML = `<i data-lucide="link-2" style="width: 12px; height: 12px;"></i> ${displayUrl}`;

			details.appendChild(modelItem);
			details.appendChild(urlItem);

			info.appendChild(nameRow);
			info.appendChild(details);

			const actions = document.createElement('div');
			actions.className = 'api-provider-actions no-card-click';

			const editBtn = document.createElement('button');
			editBtn.className = 'btn-delete';
			editBtn.style.fontSize = '14px';
			editBtn.title = 'Edit Provider';
			editBtn.innerHTML = '<i data-lucide="pencil" style="width: 14px; height: 14px;"></i>';
			editBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				try {
					openApiProviderModal(provider);
				} catch (err) {
					console.error('Failed to open edit modal:', err);
				}
			});

			const cloneBtn = document.createElement('button');
			cloneBtn.className = 'btn-delete';
			cloneBtn.style.fontSize = '14px';
			cloneBtn.title = 'Clone Provider';
			cloneBtn.innerHTML = '<i data-lucide="copy" style="width: 14px; height: 14px;"></i>';
			cloneBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const clonedProvider = {
					...provider,
					id: '', // Empty ID tells the modal to add a new provider on save
					name: `${provider.name} (Cloned)`
				};
				openApiProviderModal(clonedProvider);
			});

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'btn-delete';
			deleteBtn.title = 'Delete Provider';
			deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>';
			deleteBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const confirmed = await showConfirm(
					'Delete Provider',
					`Are you sure you want to delete the API provider "${provider.name}"?`,
					{ isDestructive: true, confirmText: 'Delete' },
				);
				if (confirmed) {
					if (activeAssistantId === provider.id) {
						activeAssistantId = 'Copilot';
					}
					activeApiProviders = activeApiProviders.filter(p => p.id !== provider.id);
					renderApiProvidersList();
					rebuildAllSelects();
					updateProvidersTabActiveState();
					updateProviderSelector();
					autoSave();
				}
			});

			actions.appendChild(editBtn);
			actions.appendChild(cloneBtn);
			actions.appendChild(deleteBtn);

			card.appendChild(info);
			card.appendChild(actions);

			apiProvidersList.appendChild(card);
		});

		lucide.createIcons();
		updateProviderSelector();
	};

	const openApiProviderModal = (provider = null) => {
		document.querySelectorAll('.form-field').forEach(f => f.classList.remove('invalid'));
		apiProviderForm.reset();

		if (provider) {
			apiModalTitle.textContent = provider.id ? 'Edit API Provider' : 'Add API Provider';
			apiProviderId.value = provider.id || '';
			apiName.value = provider.name;
			apiBaseUrl.value = provider.baseUrl;
			apiApiKey.value = provider.apiKey;
			apiModel.value = provider.model;
			apiSystemPrompt.value = provider.systemPrompt || '';
			setTimeout(fetchAvailableModels, 100);
		} else {
			apiModalTitle.textContent = 'Add API Provider';
			apiProviderId.value = '';
			apiSystemPrompt.value = 'Return ONLY the direct final response. No intro, explanation, or conversational filler.';
			const apiModelInfo = document.getElementById('apiModelInfo');
			const apiModelList = document.getElementById('apiModelList');
			if (apiModelInfo) apiModelInfo.style.display = 'none';
			if (apiModelList) apiModelList.innerHTML = '';
		}

		apiApiKey.type = 'password';
		toggleApiKeyVisibility.innerHTML = '<i data-lucide="eye"></i>';
		lucide.createIcons();

		apiProviderModal.classList.add('active');
		setTimeout(() => {
			apiName.focus();
		}, 100);
	};

	const closeApiProviderModal = () => {
		apiProviderModal.classList.remove('active');
	};

	let fetchedModels = [];
	let activeDropdownIndex = -1;
	const apiModelDropdown = document.getElementById('apiModelDropdown');
	const apiModelWrapper = document.getElementById('apiModelWrapper');
	const apiModelInfo = document.getElementById('apiModelInfo');
	const modelLoadingSpinner = document.getElementById('modelLoadingSpinner');
	
	const renderModelDropdown = (query = '') => {
		apiModelDropdown.innerHTML = '';
		activeDropdownIndex = -1;
		const filtered = fetchedModels.filter(m => m.toLowerCase().includes(query.toLowerCase()));
		
		if (filtered.length === 0) {
			apiModelWrapper.classList.remove('active');
			return;
		}
		
		filtered.forEach((modelId, idx) => {
			const optDiv = document.createElement('div');
			optDiv.className = 'custom-select-option';
			optDiv.dataset.index = idx;
			if (modelId === apiModel.value) {
				optDiv.classList.add('selected');
				activeDropdownIndex = idx;
			}
			optDiv.textContent = modelId;
			
			optDiv.addEventListener('mousedown', (e) => {
				e.preventDefault();
				apiModel.value = modelId;
				apiModelWrapper.classList.remove('active');
				autoSave();
			});
			
			apiModelDropdown.appendChild(optDiv);
		});
	};
	
	const fetchAvailableModels = async () => {
		const baseUrl = apiBaseUrl.value.trim();
		const apiKey = apiApiKey.value.trim();
		
		if (!baseUrl || !apiKey) {
			apiModelInfo.style.display = 'none';
			if (modelLoadingSpinner) modelLoadingSpinner.style.display = 'none';
			fetchedModels = [];
			renderModelDropdown();
			return;
		}
		
		try {
			new URL(baseUrl);
		} catch (_) {
			return;
		}
		
		apiModelInfo.style.display = 'none';
		if (modelLoadingSpinner) modelLoadingSpinner.style.display = 'block';
		fetchedModels = [];
		renderModelDropdown();
		
		try {
			const result = await window.api.fetchModels(baseUrl, apiKey);
			if (modelLoadingSpinner) modelLoadingSpinner.style.display = 'none';
			
			if (result.success && Array.isArray(result.models) && result.models.length > 0) {
				fetchedModels = result.models;
				renderModelDropdown(apiModel.value);
				apiModelInfo.style.display = 'block';
				apiModelInfo.style.color = '#10B981';
				apiModelInfo.style.fontWeight = '500';
				apiModelInfo.textContent = `✓ ${result.models.length} models loaded`;
			} else {
				apiModelInfo.style.display = 'block';
				apiModelInfo.style.color = 'var(--text-secondary)';
				apiModelInfo.textContent = `⚠ Could not fetch models automatically: ${result.error || 'Check URL/Key.'}`;
			}
		} catch (err) {
			if (modelLoadingSpinner) modelLoadingSpinner.style.display = 'none';
			apiModelInfo.style.display = 'block';
			apiModelInfo.style.color = 'var(--text-secondary)';
			apiModelInfo.textContent = `⚠ Could not fetch models automatically: ${err.message}`;
		}
	};
	
	apiBaseUrl.addEventListener('blur', fetchAvailableModels);
	apiApiKey.addEventListener('blur', fetchAvailableModels);
	
	apiModel.addEventListener('focus', () => {
		if (fetchedModels.length > 0) {
			renderModelDropdown(apiModel.value);
			apiModelWrapper.classList.add('active');
		}
	});
	
	apiModel.addEventListener('input', () => {
		if (fetchedModels.length > 0) {
			renderModelDropdown(apiModel.value);
			apiModelWrapper.classList.add('active');
		}
	});
	
	apiModel.addEventListener('blur', () => {
		setTimeout(() => {
			apiModelWrapper.classList.remove('active');
		}, 150);
	});
	
	apiModelWrapper.addEventListener('click', (e) => {
		e.stopPropagation();
	});
	
	apiModel.addEventListener('keydown', (e) => {
		if (!apiModelWrapper.classList.contains('active')) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				if (fetchedModels.length > 0) {
					renderModelDropdown(apiModel.value);
					apiModelWrapper.classList.add('active');
				}
			}
			return;
		}
		
		const options = apiModelDropdown.querySelectorAll('.custom-select-option');
		if (options.length === 0) return;
		
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeDropdownIndex++;
			if (activeDropdownIndex >= options.length) {
				activeDropdownIndex = 0;
			}
			highlightOption(options);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeDropdownIndex--;
			if (activeDropdownIndex < 0) {
				activeDropdownIndex = options.length - 1;
			}
			highlightOption(options);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (activeDropdownIndex >= 0 && activeDropdownIndex < options.length) {
				const selectedOpt = options[activeDropdownIndex];
				apiModel.value = selectedOpt.textContent;
				apiModelWrapper.classList.remove('active');
				autoSave();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			apiModelWrapper.classList.remove('active');
			apiModel.blur();
		}
	});
	
	const highlightOption = (options) => {
		options.forEach(opt => opt.classList.remove('highlighted'));
		if (activeDropdownIndex >= 0 && activeDropdownIndex < options.length) {
			const activeOpt = options[activeDropdownIndex];
			activeOpt.classList.add('highlighted');
			activeOpt.scrollIntoView({ block: 'nearest' });
		}
	};

	// --- Load Current Settings ---
	try {
		webchatProviders = await window.api.getWebChatProviders();
		renderWebChatOptions();

		const settings = await window.api.getSettings();
		activeAssistantId = settings.currentAssistant || 'Copilot';
		activeApiProviders = settings.apiProviders || [];

		autoLaunchCheckbox.checked = !!settings.autoLaunch;
		standardWindowCheckbox.checked = !!settings.standardWindow;
		themeToggle.checked = settings.theme !== 'light';
		applyTheme(themeToggle.checked ? 'dark' : 'light');
		historyCleanupSelect.value = settings.historyCleanup || 'daily';
		activePrompts = settings.prompts || [];

		const defaults = await window.api.getDefaultPrompts();
		defaultPromptsJSON = JSON.stringify(
			defaults.map(p => ({
				id: p.id,
				name: p.name,
				shortcut: p.shortcut,
				text: p.text,
				autoSubmit: !!p.autoSubmit,
				isSystem: !!p.isSystem,
			})),
		);

		renderPromptsList();
		rebuildAllSelects();
		renderApiProvidersList();
		updateProvidersTabActiveState();
		updateProviderSelector();

		autoLaunchCheckbox.addEventListener('change', autoSave);
		standardWindowCheckbox.addEventListener('change', autoSave);
		themeToggle.addEventListener('change', autoSave);
		historyCleanupSelect.addEventListener('change', autoSave);

		// Web Chat Box click handler
		if (webChatBox) {
			webChatBox.addEventListener('click', (e) => {
				// Don't activate if clicking on the dropdown
				if (e.target.closest('.custom-select-wrapper')) return;
				const selectedValue = webChatSelect ? webChatSelect.value : 'Copilot';
				activeAssistantId = selectedValue;
				rebuildAllSelects();
				renderApiProvidersList();
				updateProviderSelector();
				autoSave();
			});
		}

		// Web Chat Select change handler
		if (webChatSelect) {
			webChatSelect.addEventListener('change', () => {
				activeAssistantId = webChatSelect.value;
				rebuildAllSelects();
				renderApiProvidersList();
				updateProviderSelector();
				autoSave();
			});
		}

		// Provider Selector Dropdown (General tab)
		if (providerSelectTrigger) {
			providerSelectTrigger.addEventListener('click', (e) => {
				e.stopPropagation();
				document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('active'));
				providerSelectWrapper.classList.toggle('active');
			});
		}



		// Close provider dropdown on outside click
		document.addEventListener('click', () => {
			if (providerSelectWrapper) {
				providerSelectWrapper.classList.remove('active');
			}
		});

		addApiProviderBtn.addEventListener('click', () => {
			openApiProviderModal();
		});

		apiModalCloseBtn.addEventListener('click', closeApiProviderModal);
		apiModalCancelBtn.addEventListener('click', closeApiProviderModal);

		apiProviderModal.addEventListener('click', e => {
			if (e.target === apiProviderModal) {
				closeApiProviderModal();
			}
		});

		toggleApiKeyVisibility.addEventListener('click', (e) => {
			e.preventDefault();
			const type = apiApiKey.getAttribute('type') === 'password' ? 'text' : 'password';
			apiApiKey.setAttribute('type', type);
			const iconName = type === 'password' ? 'eye' : 'eye-off';
			toggleApiKeyVisibility.innerHTML = `<i data-lucide="${iconName}"></i>`;
			lucide.createIcons();
		});



		apiModalSaveBtn.addEventListener('click', e => {
			e.preventDefault();

			document.querySelectorAll('.form-field').forEach(f => f.classList.remove('invalid'));

			let firstInvalidField = null;

			const markInvalid = inputEl => {
				const field = inputEl.closest('.form-field');
				if (field) {
					field.classList.add('invalid');
					if (!firstInvalidField) firstInvalidField = inputEl;
				}
			};

			if (!apiName.value.trim()) {
				markInvalid(apiName);
			}

			const urlVal = apiBaseUrl.value.trim();
			let isValidUrl = false;
			try {
				new URL(urlVal);
				isValidUrl = urlVal.startsWith('http://') || urlVal.startsWith('https://');
			} catch (_) {
				isValidUrl = false;
			}
			if (!urlVal) {
				const errorEl = document.getElementById('apiBaseUrlError');
				if (errorEl) errorEl.textContent = 'This field is required.';
				markInvalid(apiBaseUrl);
			} else if (!isValidUrl) {
				const errorEl = document.getElementById('apiBaseUrlError');
				if (errorEl) errorEl.textContent = 'Enter a valid URL (starting with http:// or https://).';
				markInvalid(apiBaseUrl);
			}

			if (!apiApiKey.value.trim()) {
				markInvalid(apiApiKey);
			}

			if (!apiModel.value.trim()) {
				markInvalid(apiModel);
			}

			if (firstInvalidField) {
				firstInvalidField.focus();
				return;
			}

			const id = apiProviderId.value;
			const name = apiName.value.trim();
			const baseUrl = apiBaseUrl.value.trim();
			const apiKey = apiApiKey.value.trim();
			const model = apiModel.value.trim();
			const systemPrompt = apiSystemPrompt.value.trim();

			if (id) {
				const provider = activeApiProviders.find(p => p.id === id);
				if (provider) {
					provider.name = name;
					provider.baseUrl = baseUrl;
					provider.apiKey = apiKey;
					provider.model = model;
					provider.systemPrompt = systemPrompt;
				}
			} else {
				const newId = `api-${Date.now()}`;
				activeApiProviders.push({
					id: newId,
					name,
					baseUrl,
					apiKey,
					model,
					systemPrompt,
				});
			}

			closeApiProviderModal();
			renderApiProvidersList();
			updateProviderSelector();
			autoSave();
		});

		// Setup custom dropdown logic
		const initCustomSelects = () => {
			document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
				const trigger = wrapper.querySelector('.custom-select-trigger');
				const label = wrapper.querySelector('.custom-select-label');
				const optionsContainer = wrapper.querySelector('.custom-select-options');
				const selectId = wrapper.dataset.selectId;
				const hiddenSelect = document.getElementById(selectId);
				if (!trigger || !label || !optionsContainer || !hiddenSelect) return;

				trigger.addEventListener('click', e => {
					e.stopPropagation();
					document.querySelectorAll('.custom-select-wrapper').forEach(other => {
						if (other !== wrapper) other.classList.remove('active');
					});
					wrapper.classList.toggle('active');
				});

				optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
					opt.addEventListener('click', e => {
						e.stopPropagation();
						const val = opt.dataset.value;
						hiddenSelect.value = val;
						label.textContent = opt.textContent;

						optionsContainer.querySelectorAll('.custom-select-option').forEach(o => {
							o.classList.toggle('selected', o.dataset.value === val);
						});

						wrapper.classList.remove('active');
						hiddenSelect.dispatchEvent(new Event('change'));
					});
				});
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
			historySettingsBtn.addEventListener('click', e => {
				e.preventDefault();
				historySettingsModal.classList.add('active');
			});
		}

		if (historySettingsCloseBtn && historySettingsModal) {
			historySettingsCloseBtn.addEventListener('click', e => {
				e.preventDefault();
				historySettingsModal.classList.remove('active');
			});
		}

		if (historySettingsModal) {
			historySettingsModal.addEventListener('click', e => {
				if (e.target === historySettingsModal) {
					historySettingsModal.classList.remove('active');
				}
			});
		}

		if (window.api.onHistoryUpdated) {
			window.api.onHistoryUpdated(items => {
				activeHistory = items;
				renderHistoryList();
			});
		}

		clearHistoryBtn.addEventListener('click', async e => {
			e.preventDefault();
			if (activeHistory.length === 0) return;
			const confirmed = await showConfirm(
				'Clear All History',
				'Are you sure you want to permanently delete your entire prompt history? This cannot be undone.',
				{ isDestructive: true, confirmText: 'Clear All' },
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

		autoSave();
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
				timeStyle: 'short',
			});

			const timeSpan = document.createElement('span');
			timeSpan.className = 'history-card-time';
			timeSpan.textContent = dateStr;
			headerLeft.appendChild(timeSpan);

			if (item.assistant) {
				const modelPill = document.createElement('span');
				modelPill.className = 'history-card-model-pill';
				const provider = activeApiProviders.find(p => p.id === item.assistant);
				if (provider) {
					modelPill.innerHTML = `<span style="opacity: 0.45; font-weight: 600; text-transform: uppercase; font-size: 9px; margin-right: 6px; letter-spacing: 0.5px;">API</span>${provider.name}`;
				} else {
					modelPill.innerHTML = `<span style="opacity: 0.45; font-weight: 600; text-transform: uppercase; font-size: 9px; margin-right: 6px; letter-spacing: 0.5px;">Chat</span>${item.assistant}`;
				}
				headerLeft.appendChild(modelPill);
			}

			const actions = document.createElement('div');
			actions.className = 'history-card-actions';

			const copyBtn = document.createElement('button');
			copyBtn.className = 'history-action-btn no-drag';
			copyBtn.title = 'Copy prompt text';
			copyBtn.innerHTML = '<i data-lucide="copy"></i>';
			copyBtn.addEventListener('click', async e => {
				e.stopPropagation();
				try {
					const textToCopy = item.response || item.text;
					await navigator.clipboard.writeText(textToCopy);

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
			deleteItemBtn.addEventListener('click', async e => {
				e.stopPropagation();
				const confirmed = await showConfirm(
					'Delete History Item',
					'Are you sure you want to delete this prompt from your history?',
					{ isDestructive: true, confirmText: 'Delete' },
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

			// Show response if available (API mode)
			if (item.response) {
				const responseDiv = document.createElement('div');
				responseDiv.className = 'history-card-response';
				responseDiv.innerHTML = `
					<div class="history-response-label">Response</div>
					<div class="history-response-text"></div>
				`;
				responseDiv.querySelector('.history-response-text').textContent = item.response;
				card.appendChild(responseDiv);
			}

			historyList.appendChild(card);
		});

		lucide.createIcons();
	};

	// --- Render Prompts List ---
	function renderPromptsList() {
		promptsList.innerHTML = '';

		const headerRow = document.createElement('div');
		headerRow.className = 'prompt-header-row';
		const headers = ['Shortcut', 'Title', 'Prefixed Prompt', 'Auto Submit', ''];
		headers.forEach((text, i) => {
			const span = document.createElement('span');
			span.textContent = text;
			span.className = 'prompt-header-item';
			if (i === 3) {
				span.title = 'When enabled, the prompt is sent immediately without pressing Enter';
			}
			headerRow.appendChild(span);
		});
		promptsList.appendChild(headerRow);

		activePrompts.forEach((prompt, index) => {
	const row = document.createElement('div');
		row.className = 'prompt-row' + (prompt.isSystem ? ' system-prompt' : '');
		row.dataset.id = prompt.id;
		row.dataset.index = index;

			// Name input
			const nameInput = document.createElement('input');
			nameInput.type = 'text';
			nameInput.className = 'text-input';
			nameInput.value = prompt.name || '';
			nameInput.disabled = !!prompt.isSystem;
			nameInput.placeholder = 'Action Name';
			nameInput.addEventListener('input', e => {
				prompt.name = e.target.value;
				autoSave();
			});

			// Shortcut button (recorder)
			const shortcutBtn = document.createElement('button');
			shortcutBtn.className = 'shortcut-recorder-btn no-drag';
			shortcutBtn.dataset.shortcut = prompt.shortcut || '';
			shortcutBtn.innerText = prompt.shortcut || 'None';
			shortcutBtn.title = 'Click to record new shortcut';
			shortcutBtn.addEventListener('click', e => {
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
			textInput.addEventListener('input', e => {
				prompt.text = e.target.value;
				autoSave();
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
				checkbox.addEventListener('change', e => {
					prompt.autoSubmit = e.target.checked;
					autoSave();
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
					{ isDestructive: true, confirmText: 'Delete' },
				);
				if (confirmed) {
					activePrompts.splice(index, 1);
					renderPromptsList();
					autoSave();
				}
			});

			actionsCell.appendChild(deleteBtn);

		row.appendChild(shortcutBtn);
		row.appendChild(nameInput);
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
			isSystem: false,
		});
		renderPromptsList();
		autoSave();

		// Scroll to bottom of list
		setTimeout(() => {
			promptsList.scrollTop = promptsList.scrollHeight;
		}, 50);
	});
	// --- Reset to Default Prompts ---
	resetDefaultsBtn.addEventListener('click', async e => {
		e.preventDefault();
		const confirmed = await showConfirm(
			'Reset Defaults',
			'Are you sure you want to reset all shortcuts and prompts to their default values? This will overwrite your current settings.',
			{ isDestructive: true, confirmText: 'Reset' },
		);
		if (confirmed) {
			try {
				activePrompts = await window.api.getDefaultPrompts();
				renderPromptsList();
				autoSave();
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

		const keydownHandler = e => {
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
				autoSave();
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

	checkUpdateBtn.addEventListener('click', async e => {
		e.preventDefault();

		const originalText = checkUpdateBtn.textContent;
		checkUpdateBtn.disabled = true;
		checkUpdateBtn.textContent = 'Checking...';

		try {
			const result = await window.api.checkUpdateStatus();
			if (result.success === false) {
				await showConfirm('Update Check Failed', `Could not fetch update information: ${result.error || 'Unknown error'}`, {
					confirmText: 'OK',
					showCancel: false,
				});
			} else if (result.updateAvailable) {
				const confirmed = await showConfirm(
					'Update Available',
					`A new version (v${result.latestVersion}) is available! (Current: v${result.currentVersion}).\nWould you like to download and install it now?`,
					{ confirmText: 'Update Now', cancelText: 'Later' },
				);
				if (confirmed) {
					window.api.startUpdate();
				}
			} else {
				await showConfirm(
					'Promptly Update',
					`Promptly is up to date!\nYou are running the latest version (v${result.currentVersion}).`,
					{ confirmText: 'OK', showCancel: false },
				);
			}
		} catch (err) {
			console.error('Failed to check updates:', err);
			await showConfirm('Update Check Failed', `Could not check for updates: ${err.message}`, {
				confirmText: 'OK',
				showCancel: false,
			});
		} finally {
			checkUpdateBtn.disabled = false;
			checkUpdateBtn.textContent = originalText;
		}
	});

	if (aboutLink) {
		aboutLink.addEventListener('click', e => {
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
					{ confirmText: 'Update Now', cancelText: 'Later' },
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
