// Base URL for API requests. If the frontend is served from the same
// port as the backend (e.g. both on port 3000), leave this empty so
// all requests use the current origin. Otherwise, point to the backend
// explicitly. Adjust the URL if your backend runs elsewhere.
const API_BASE_URL = window.location.port === '3000' ? '' : 'http://localhost:3000';

let currentUser = null;

function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // Use the API base URL for all requests so the frontend works even
  // when served on a different port from the backend.
  fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(r => r.ok ? r.json() : Promise.reject('Login failed'))
    .then(u => {
      currentUser = u;
      document.getElementById('loginStatus').textContent = `Logged in as ${u.username}`;
      document.getElementById('messages').style.display = 'block';
    })
    .catch(err => {
      document.getElementById('loginStatus').textContent = err;
    });
}

function sendMessage() {
  const text = document.getElementById('messageInput').value;
  // Send a new chat message to the API
  fetch(`${API_BASE_URL}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: currentUser.username, text })
  })
    .then(() => loadMessages());
}

function loadMessages() {
  // Retrieve the latest chat messages from the API
  fetch(`${API_BASE_URL}/api/messages`)
    .then(r => r.json())
    .then(msgs => {
      const list = document.getElementById('messageList');
      list.innerHTML = msgs.map(m => `<div><strong>${m.user}:</strong> ${m.text}</div>`).join('');
    });
}

// Periodically refresh messages
setInterval(loadMessages, 3000);
