/**
 * Functions supporting the simple admin panel. The panel relies on the
 * existing authentication logic from app.js to ensure only admins can
 * access the configuration endpoints.
 */

function initAdmin() {
  // Reuse the common auth check. This sets the global currentUser object.
  checkAuth();

  // Redirect non-admins back to the dashboard for safety.
  if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  // Fetch and display the current configuration values.
  loadConfig();

  // Show the list of API endpoints so future functionality can be wired up
  // without digging through backend source files.
  renderEndpoints();
}

/**
 * Retrieve all stored configuration key/value pairs from the backend and
 * render them in a simple list.
 */
function loadConfig() {
  fetch(`${API_BASE_URL}/api/admin/config`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(items => {
      const list = document.getElementById('configList');
      list.innerHTML = '';
      items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.key}: ${item.value}`;
        list.appendChild(li);
      });
    });
}

/**
 * Submit a new configuration value or update an existing one. After the
 * request completes the list is reloaded so the UI reflects the change.
 */
function createConfig(e) {
  e.preventDefault();
  const key = document.getElementById('configKey').value;
  const value = document.getElementById('configValue').value;

  fetch(`${API_BASE_URL}/api/admin/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ key, value })
  })
    .then(() => {
      document.getElementById('configKey').value = '';
      document.getElementById('configValue').value = '';
      loadConfig();
    });
}

/**
 * Display a list of available backend endpoints. This provides visibility
 * into the API surface and acts as a placeholder for more advanced admin
 * functionality we may implement later.
 */
function renderEndpoints() {
  const endpoints = [
    '/api/messages',
    '/api/channels',
    '/api/crm',
    '/api/projects',
    '/api/programs',
    '/api/timesheets',
    '/api/leaves',
    '/api/users',
    '/api/teams',
    '/api/admin'
  ];

  const placeholder = document.getElementById('endpointPlaceholder');
  placeholder.innerHTML = '';
  const ul = document.createElement('ul');
  endpoints.forEach(e => {
    const li = document.createElement('li');
    li.textContent = e;
    ul.appendChild(li);
  });
  placeholder.appendChild(ul);
}
