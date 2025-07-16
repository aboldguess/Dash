let currentUser = null;

function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  fetch('/api/auth/login', {
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
  fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: currentUser.username, text })
  })
    .then(() => loadMessages());
}

function loadMessages() {
  fetch('/api/messages')
    .then(r => r.json())
    .then(msgs => {
      const list = document.getElementById('messageList');
      list.innerHTML = msgs.map(m => `<div><strong>${m.user}:</strong> ${m.text}</div>`).join('');
    });
}

// Periodically refresh messages
setInterval(loadMessages, 3000);
