// Base URL for API requests. The backend runs on localhost:3000 when
// developing locally, so all API calls target that server regardless of
// which port the frontend is served from. Update this value if your
// backend listens on a different host or port.
const API_BASE_URL = 'http://localhost:3000';

// Promise used to ensure the Socket.IO client library is loaded before
// attempting to create a connection. If the script tag included in the
// HTML fails (for example when the frontend is served separately from the
// backend) `io` will be undefined. This loader fetches the library from
// the API host so `login()` can always rely on it being available.
let socketIoReady = null;

function loadSocketIo() {
  if (typeof io !== 'undefined') {
    // Already loaded
    return Promise.resolve();
  }

  // Lazily inject the script only once and reuse the same promise for
  // subsequent calls if needed.
  if (!socketIoReady) {
    socketIoReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${API_BASE_URL}/socket.io/socket.io.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Socket.IO'));
      document.head.appendChild(script);
    });
  }

  return socketIoReady;
}

let currentUser = null; // stores logged in user info
let socket = null;      // active Socket.IO connection

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
      // Persist auth details so other pages can verify login state
      localStorage.setItem('token', u.token);
      localStorage.setItem('username', u.username);

      // Redirect straight to the dashboard where the websocket
      // connection will be established.
      window.location.href = 'dashboard.html';
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
      // Inform the user and send them to the login page
      document.getElementById('signupStatus').textContent = `Account ${u.username} created`;
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000);
    })
    .catch(err => {
      document.getElementById('signupStatus').textContent = err;
    });
}

function sendMessage() {
  const text = document.getElementById('messageInput').value;

  if (!socket || !text) {
    return;
  }

  // Emit the message through the WebSocket connection
  socket.emit('messages', { user: currentUser.username, text });

  // Clear the input for convenience
  document.getElementById('messageInput').value = '';
}

function loadMessages() {
  // Retrieve the latest chat messages from the API
  fetch(`${API_BASE_URL}/api/messages`)
    .then(r => r.json())
    .then(msgs => {
      const list = document.getElementById('messageList');
      list.innerHTML = '';
      msgs.forEach(appendMessage);
    });
}

// Helper to add a single message element to the chat log
function appendMessage(m) {
  const list = document.getElementById('messageList');
  const div = document.createElement('div');
  div.innerHTML = `<strong>${m.user}:</strong> ${m.text}`;
  list.appendChild(div);
}

// Verify the user is logged in before showing the dashboard
function checkAuth() {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  if (!token || !username) {
    // Not authenticated - return to login page
    window.location.href = 'login.html';
    return;
  }

  currentUser = { username, token };

  // After setting currentUser, connect to Socket.IO and load messages
  loadSocketIo().then(() => {
    socket = io(API_BASE_URL);
    socket.on('messages', msg => appendMessage(msg));
    loadMessages();
  });
}

// Clear stored credentials and return to login page
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  if (socket) {
    socket.disconnect();
  }
  window.location.href = 'login.html';
}
