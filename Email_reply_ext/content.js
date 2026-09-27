/**
 * AI Email Reply Assistant - Content Script for Gmail
 */

(function () {
  'use strict';

  console.log('[AI Email Assistant] Content script initialized on Gmail');

  // Sparkle SVG icon
  const SPARKLE_ICON_SVG = `
    <svg class="ai-btn-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L14.4 7.6L20 10L14.4 12.4L12 18L9.6 12.4L4 10L9.6 7.6L12 2Z" />
      <path d="M19 16L20.2 18.8L23 20L20.2 21.2L19 24L17.8 21.2L15 20L17.8 18.8L19 16Z" opacity="0.8" />
    </svg>
  `;

  const SPINNER_SVG = `<div class="ai-spinner"></div>`;

  /**
   * Show a modern floating toast inside Gmail
   */
  function showToast(message, type = 'info', duration = 5000) {
    const existingToast = document.querySelector('.ai-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `ai-toast ai-toast-${type}`;

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => toast.remove();
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, duration);
    }
  }

  /**
   * Find the original email content in the thread related to the compose window
   */
  function extractOriginalEmail(composeContainer) {
    // Thread message container selectors in Gmail
    const threadSelectors = [
      '.adn.ads',                   // Message container in conversation view
      '.h7',                       // Expanded message container
      '.a3s.aiL',                  // Email body container
      '.a3s',                      // Alternate email body
      '.gmail_quote',              // Quoted text inside reply
      '[data-message-id] .a3s'     // Specific message card
    ];

    for (const selector of threadSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      if (elements.length > 0) {
        // Return the last non-empty email message body that isn't inside our compose container
        for (let i = elements.length - 1; i >= 0; i--) {
          const el = elements[i];
          if (composeContainer && composeContainer.contains(el)) {
            continue; // Skip if it's inside the current compose box
          }
          const text = el.innerText ? el.innerText.trim() : '';
          if (text.length > 10) {
            return text;
          }
        }
      }
    }

    // If nothing found from previous messages, check if user wrote draft notes in the compose box
    const composeBox = findComposeBox(composeContainer);
    if (composeBox) {
      const text = composeBox.innerText ? composeBox.innerText.trim() : '';
      if (text.length > 5) {
        return text;
      }
    }

    return '';
  }

  /**
   * Locate the editable content area for a given compose container
   */
  function findComposeBox(container) {
    if (!container) return document.querySelector('[role="textbox"][g_editable="true"], [role="textbox"], div[contenteditable="true"]');

    return (
      container.querySelector('[role="textbox"][g_editable="true"]') ||
      container.querySelector('[role="textbox"]') ||
      container.querySelector('div[contenteditable="true"]') ||
      document.querySelector('[role="textbox"][g_editable="true"]')
    );
  }

  /**
   * Insert text safely into the Gmail compose box
   */
  function insertReplyIntoCompose(composeBox, replyText) {
    if (!composeBox) return false;

    composeBox.focus();

    // Use execCommand for undo stack support in contenteditable
    const inserted = document.execCommand('insertText', false, replyText);

    if (!inserted) {
      // Fallback: direct manipulation
      const p = document.createElement('div');
      p.innerText = replyText;
      composeBox.appendChild(p);

      // Trigger synthetic input events so Gmail syncs its state
      composeBox.dispatchEvent(new Event('input', { bubbles: true }));
      composeBox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return true;
  }

  /**
   * Get settings (backend URL and default tone) from chrome.storage
   */
  async function getStoredSettings() {
    return new Promise((resolve) => {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(
          { backendUrl: 'http://localhost:8080', defaultTone: 'professional' },
          (items) => resolve(items)
        );
      } else {
        resolve({ backendUrl: 'http://localhost:8080', defaultTone: 'professional' });
      }
    });
  }

  /**
   * Creates the AI button and tone selector wrapper
   */
  function createAIWrapper(defaultTone) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-reply-wrapper';

    // AI Button
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-reply-btn';
    button.setAttribute('role', 'button');
    button.title = 'Generate AI Reply for this email';
    button.innerHTML = `${SPARKLE_ICON_SVG}<span>AI Reply</span>`;

    // Tone select
    const toneSelect = document.createElement('select');
    toneSelect.className = 'ai-tone-select';
    toneSelect.title = 'Select reply tone';

    const tones = [
      { value: 'professional', label: 'Professional' },
      { value: 'casual', label: 'Casual' },
      { value: 'friendly', label: 'Friendly' },
      { value: 'concise', label: 'Concise' },
      { value: 'formal', label: 'Formal' },
      { value: 'urgent', label: 'Urgent' }
    ];

    tones.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = t.label;
      if (t.value === defaultTone) opt.selected = true;
      toneSelect.appendChild(opt);
    });

    wrapper.appendChild(button);
    wrapper.appendChild(toneSelect);

    return { wrapper, button, toneSelect };
  }

  /**
   * Attach the AI Reply button and tone selector to a compose window next to the Send button
   */
  async function injectAIControls(sendButton, composeContainer) {
    // Strict guard: verify composeContainer does not already have an AI wrapper
    if (composeContainer.querySelector('.ai-reply-wrapper')) {
      return;
    }

    const settings = await getStoredSettings();
    const { wrapper, button, toneSelect } = createAIWrapper(settings.defaultTone);

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const originalBtnHtml = button.innerHTML;
      button.innerHTML = `${SPINNER_SVG}<span>Generating...</span>`;
      button.disabled = true;

      try {
        const originalContent = extractOriginalEmail(composeContainer);

        if (!originalContent) {
          showToast('No email content found to reply to. Please open an email thread or write some draft context.', 'warning');
          return;
        }

        const selectedTone = toneSelect.value || 'professional';
        const currentSettings = await getStoredSettings();
        const baseUrl = (currentSettings.backendUrl || 'http://localhost:8080').replace(/\/+$/, '');

        let response;
        try {
          response = await fetch(`${baseUrl}/api/email/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emailContent: originalContent,
              tone: selectedTone
            })
          });
        } catch (fetchErr) {
          // Fallback to legacy endpoint alias if needed
          try {
            response = await fetch(`${baseUrl}/api/email/genrate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                emailContent: originalContent,
                tone: selectedTone
              })
            });
          } catch {
            throw fetchErr;
          }
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || `Server responded with ${response.status}`);
        }

        const replyText = await response.text();

        // Check if backend returned configuration or API errors
        if (replyText.startsWith('Configuration Error:') || replyText.startsWith('Gemini API Error:')) {
          showToast(replyText, 'error', 8000);
          return;
        }

        const composeBox = findComposeBox(composeContainer);
        if (!composeBox) {
          showToast('Compose box not found. Please click into the draft text area.', 'error');
          return;
        }

        const success = insertReplyIntoCompose(composeBox, replyText);
        if (success) {
          showToast('✨ AI Reply inserted successfully!', 'success');
        } else {
          showToast('Could not automatically insert reply text.', 'warning');
        }
      } catch (err) {
        console.error('[AI Email Assistant] Error:', err);
        if (err.name === 'TypeError' || err.message.includes('Failed to fetch')) {
          showToast('Cannot connect to backend at localhost:8080. Make sure the Spring Boot server is running!', 'error', 7000);
        } else {
          showToast(`Error: ${err.message}`, 'error', 6000);
        }
      } finally {
        button.innerHTML = originalBtnHtml;
        button.disabled = false;
      }
    });

    // In Gmail, the Send button is inside a container (.dC or .wG)
    const sendContainer = sendButton.closest('.dC') || sendButton;

    // Place our controls immediately to the right of the Send button group
    sendContainer.insertAdjacentElement('afterend', wrapper);
  }

  /**
   * Scan for active compose windows and ensure EXACTLY ONE button per compose window
   */
  function scanAndInject() {
    // Find all Send buttons on the page (one per compose box/thread reply)
    const sendButtons = document.querySelectorAll(
      '[data-tooltip*="Send"], [aria-label*="Send"], .T-I.aoO.v7, .T-I-atl.L3'
    );

    sendButtons.forEach((sendBtn) => {
      // Find the enclosing compose window or container
      const composeContainer = sendBtn.closest(
        '.M9, .AD, .aoI, .ip, [role="dialog"], .inboxsdk__compose, .btC, .aDh'
      ) || sendBtn.parentElement;

      if (!composeContainer) return;

      // Clean up any duplicates if they exist (keep only the first one)
      const existingWrappers = composeContainer.querySelectorAll('.ai-reply-wrapper');
      if (existingWrappers.length > 1) {
        for (let i = 1; i < existingWrappers.length; i++) {
          existingWrappers[i].remove();
        }
        return; // First one already exists
      } else if (existingWrappers.length === 1) {
        return; // Already cleanly injected!
      }

      // No wrapper exists yet in this compose window — inject exactly one!
      injectAIControls(sendBtn, composeContainer);
    });
  }

  // Initial scan
  scanAndInject();

  // Watch for DOM changes (compose dialog open, inline reply click)
  let debounceTimeout = null;
  const observer = new MutationObserver(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(scanAndInject, 250);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();