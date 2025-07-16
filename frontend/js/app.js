// Base URL for API requests. The backend runs on localhost:3000 when
// developing locally, so all API calls target that server regardless of
// which port the frontend is served from. Update this value if your
// backend listens on a different host or port.
const API_BASE_URL = 'http://localhost:3000';

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

// Register a new user via the signup form
function signup() {
  const username = document.getElementById('signupUsername').value;
  const password = document.getElementById('signupPassword').value;

  fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.message || 'Signup failed')))
    .then(u => {
      document.getElementById('signupStatus').textContent = `Account ${u.username} created`;
    })
    .catch(err => {
      document.getElementById('signupStatus').textContent = err;
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
