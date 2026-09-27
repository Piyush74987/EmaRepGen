document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('backend-status-pill');
  const statusText = document.getElementById('backend-status-text');
  const toneSelect = document.getElementById('default-tone');
  const backendUrlInput = document.getElementById('backend-url');
  const saveUrlBtn = document.getElementById('save-url-btn');
  const checkBtn = document.getElementById('check-connection-btn');
  const connectionMsg = document.getElementById('connection-message');

  // Load saved configuration
  const defaultSettings = {
    backendUrl: 'http://localhost:8080',
    defaultTone: 'professional'
  };

  chrome.storage.local.get(defaultSettings, (items) => {
    if (items.backendUrl) backendUrlInput.value = items.backendUrl;
    if (items.defaultTone) toneSelect.value = items.defaultTone;
    checkBackendHealth(items.backendUrl || defaultSettings.backendUrl);
  });

  // Tone change listener
  toneSelect.addEventListener('change', () => {
    chrome.storage.local.set({ defaultTone: toneSelect.value });
    showMessage('Default tone saved!', 'success');
  });

  // Save backend URL
  saveUrlBtn.addEventListener('click', () => {
    let url = backendUrlInput.value.trim().replace(/\/+$/, '');
    if (!url) url = 'http://localhost:8080';
    backendUrlInput.value = url;
    chrome.storage.local.set({ backendUrl: url }, () => {
      showMessage('Backend URL saved!', 'success');
      checkBackendHealth(url);
    });
  });

  // Test button
  checkBtn.addEventListener('click', () => {
    let url = backendUrlInput.value.trim().replace(/\/+$/, '');
    if (!url) url = 'http://localhost:8080';
    checkBackendHealth(url);
  });

  async function checkBackendHealth(baseUrl) {
    setStatus('checking', 'Checking...');
    connectionMsg.textContent = 'Connecting to ' + baseUrl + '...';
    connectionMsg.className = 'info-message';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${baseUrl}/api/email/health`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        setStatus('online', 'Connected');
        showMessage('Backend is online and reachable!', 'success');
      } else {
        setStatus('offline', 'Error ' + response.status);
        showMessage('Server returned status: ' + response.status, 'error');
      }
    } catch (err) {
      console.warn('Health check failed:', err);
      setStatus('offline', 'Offline');
      showMessage('Cannot connect. Please run the Spring Boot backend!', 'error');
    }
  }

  function setStatus(state, text) {
    statusPill.className = 'status-pill status-' + (state === 'checking' ? 'unknown' : (state === 'online' ? 'online' : 'offline'));
    statusText.textContent = text;
  }

  function showMessage(msg, type) {
    connectionMsg.textContent = msg;
    connectionMsg.className = 'info-message ' + type;
    setTimeout(() => {
      if (connectionMsg.textContent === msg) {
        connectionMsg.textContent = '';
      }
    }, 4000);
  }
});
