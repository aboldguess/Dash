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

// Logged in user information including avatar URL
let currentUser = null;
let socket = null;      // active Socket.IO connection
let currentChannel = null; // id of the selected channel
let selectedUser = null; // username of direct message recipient
// Number of unread messages per user for quick badges
let unreadCounts = {};
let activeTool = 'messages'; // currently selected tool

// Switch between major tools (messaging, CRM, etc.) and update layout
function selectTool(tool) {
  activeTool = tool;

  // Highlight the selected tool in the sidebar
  document.querySelectorAll('.tool-sidebar li').forEach(li => li.classList.remove('active'));
  const activeItem = document.getElementById('tool-' + tool);
  if (activeItem) activeItem.classList.add('active');

  // Show or hide the contextual sidebar
  const context = document.getElementById('contextSidebar');
  if (tool === 'messages') {
    context.classList.remove('hidden');
    // Refresh messaging context when switching back
    loadUsers();
    loadChannels();
  } else {
    context.classList.add('hidden');
  }

  // Display the relevant section in the main area
  document.querySelectorAll('.content > section').forEach(sec => sec.classList.add('hidden'));
  const activeSection = document.getElementById(tool);
  if (activeSection) activeSection.classList.remove('hidden');

  // Clear message view state when leaving messaging
  if (tool !== 'messages') {
    selectedUser = null;
    currentChannel = null;
  }
}

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
      // Store calculated gravatar URL so it can be reused on the dashboard
      localStorage.setItem('avatarUrl', getGravatarUrl(u.username));

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

  if (selectedUser) {
    // Direct message to another user
    const dm = {
      from: currentUser.username,
      to: selectedUser,
      text,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    // Optimistically render the message so it appears instantly
    appendDirectMessage(dm);
    socket.emit('directMessage', dm);
  } else if (currentChannel) {
    // Channel message
    const msg = {
      user: currentUser.username,
      text,
      channel: currentChannel
    };
    appendMessage(msg);
    socket.emit('messages', msg);
  }

  // Clear the input for convenience
  document.getElementById('messageInput').value = '';
}

// Retrieve available channels for the logged in user
function loadChannels() {
  fetch(`${API_BASE_URL}/api/channels`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(chs => {
      const select = document.getElementById('channelSelect');
      select.innerHTML = '';
      chs.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c._id;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
      if (chs.length > 0) {
        currentChannel = chs[0]._id;
        select.value = currentChannel;
        if (socket) {
          socket.emit('join', currentChannel);
        }
        loadMessages();
      }
    });
}

// Switch the active channel and request a fresh message list
function changeChannel() {
  const select = document.getElementById('channelSelect');
  currentChannel = select.value;
  if (socket) {
    socket.emit('join', currentChannel);
  }
  loadMessages();
}

function loadMessages() {
  const list = document.getElementById('messageList');
  list.innerHTML = '';

  if (selectedUser) {
    // Load direct messages with the selected user
    fetch(`${API_BASE_URL}/api/users/conversation/${selectedUser}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    })
      .then(r => r.json())
      .then(msgs => {
        msgs.forEach(appendDirectMessage);
        // Reload unread counts as messages have been marked read
        loadUnreadCounts();
      });
  } else if (currentChannel) {
    // Retrieve the latest chat messages for the active channel
    fetch(`${API_BASE_URL}/api/messages/channel/${currentChannel}`)
      .then(r => r.json())
      .then(msgs => msgs.forEach(appendMessage));
  }
}

// Helper to add a single message element to the chat log
function appendMessage(m) {
  const list = document.getElementById('messageList');
  const div = document.createElement('div');
  div.innerHTML = `<strong>${m.user}:</strong> ${m.text}`;
  list.appendChild(div);
}

// Render a direct message including timestamp and avatars
function appendDirectMessage(m) {
  const list = document.getElementById('messageList');
  const div = document.createElement('div');
  const time = new Date(m.createdAt).toLocaleTimeString();
  div.className = 'message';
  const receipt = m.from === currentUser.username
    ? `<span class="read">${m.isRead ? '✔✔' : '✔'}</span>`
    : '';
  div.innerHTML = `
    <img class="avatar" src="${getGravatarUrl(m.from)}" alt="avatar">
    <span class="user">${m.from}</span>
    <span class="time">${time}</span>
    <span class="text">${m.text}</span>${receipt}`;
  list.appendChild(div);
}

// Fetch list of all users for the sidebar
function loadUsers() {
  fetch(`${API_BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(users => {
      const list = document.getElementById('userList');
      list.innerHTML = '';
      users.forEach(u => {
        if (u.username === currentUser.username) return; // skip self
        const li = document.createElement('li');
        li.dataset.user = u.username;
        li.className = u.online ? 'user-online' : 'user-offline';
        li.innerHTML = `<span class="online-indicator"></span>${u.username}<span class="badge hidden"></span>`;
        li.onclick = () => selectUser(u.username);
        list.appendChild(li);
      });
      // After rendering users load unread counts to display badges
      loadUnreadCounts();
    });
}

// Fetch unread message counts and display badges next to users
function loadUnreadCounts() {
  fetch(`${API_BASE_URL}/api/users/unread`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(counts => {
      unreadCounts = counts;
      Object.keys(counts).forEach(user => {
        const li = document.querySelector(`#userList li[data-user="${user}"]`);
        if (li) {
          const badge = li.querySelector('.badge');
          if (counts[user] > 0) {
            badge.textContent = counts[user];
            badge.classList.remove('hidden');
            li.classList.add('unread');
          } else {
            badge.classList.add('hidden');
            li.classList.remove('unread');
          }
        }
      });
    });
}

// Increase the unread counter for a given user and update the badge
function incrementUnread(user) {
  unreadCounts[user] = (unreadCounts[user] || 0) + 1;
  const li = document.querySelector(`#userList li[data-user="${user}"]`);
  if (li) {
    const badge = li.querySelector('.badge');
    badge.textContent = unreadCounts[user];
    badge.classList.remove('hidden');
    li.classList.add('unread');
  }
}

// Clear unread count when opening a conversation
function clearUnread(user) {
  unreadCounts[user] = 0;
  const li = document.querySelector(`#userList li[data-user="${user}"]`);
  if (li) {
    const badge = li.querySelector('.badge');
    if (badge) badge.classList.add('hidden');
    li.classList.remove('unread');
  }
}

// Update the displayed online status for a single user
function handlePresence(name, online) {
  const item = document.querySelector(`#userList li[data-user="${name}"]`);
  if (item) {
    item.className = online ? 'user-online' : 'user-offline';
  }
}

// Select a user to view direct conversation
function selectUser(name) {
  selectedUser = name;
  currentChannel = null; // hide channel context
  clearUnread(name);
  loadMessages();
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

  const avatarUrl = localStorage.getItem('avatarUrl') || getGravatarUrl(username);
  currentUser = { username, token, avatarUrl };

  // After setting currentUser, connect to Socket.IO and load channels/messages
  loadSocketIo().then(() => {
    socket = io(API_BASE_URL);
    socket.emit('register', currentUser.username);
    socket.on('messages', msg => appendMessage(msg));
    socket.on('directMessage', dm => {
      // Only show incoming messages if conversation is open
      if (selectedUser === dm.from || selectedUser === dm.to) {
        appendDirectMessage(dm);
      } else if (dm.to === currentUser.username) {
        incrementUnread(dm.from);
      }
    });
    // Receive read receipt updates for sent messages
    socket.on('messagesRead', data => {
      if (selectedUser === data.from) {
        // Reload counts and conversation so read indicators update
        loadMessages();
      }
    });
    // Update presence indicators in real time
    socket.on('userOnline', name => handlePresence(name, true));
    socket.on('userOffline', name => handlePresence(name, false));
    // Default to messaging view once authenticated
    selectTool('messages');
  });
}

// Clear stored credentials and return to login page
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('avatarUrl');
  if (socket) {
    socket.disconnect();
  }
  window.location.href = 'login.html';
}

/**
 * Return the Gravatar URL for the given identifier. The identifier is
 * typically an email address but here we simply use the username so users
 * don't need to upload avatars. The username is lowercased and hashed
 * with MD5 per the Gravatar specification.
 */
function getGravatarUrl(id) {
  const hash = md5(id.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?d=identicon`;
}

/**
 * JavaScript implementation of the MD5 hash function. Based on the reference
 * implementation at https://www.myersdaily.org/joseph/javascript/md5-text.html
 * and adapted for clarity. Returns a hex string.
 */
function md5(str) {
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function md5cycle(x, k) {
    let [a, b, c, d] = x;

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function md51(s) {
    const txt = unescape(encodeURI(s));
    const n = txt.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr[i >> 2] |= txt.charCodeAt(i) << ((i % 4) << 3);
    }
    arr[n >> 2] |= 0x80 << ((n % 4) << 3);
    arr[(((n + 8) >> 6) + 1) * 16 - 2] = n * 8;

    for (let i = 0; i < arr.length; i += 16) {
      md5cycle(state, arr.slice(i, i + 16));
    }

    return state;
  }

  function rhex(n) {
    let s = '', j = 0;
    for (; j < 4; j++) {
      s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16);
    }
    return s;
  }

  function hex(x) {
    for (let i = 0; i < x.length; i++) {
      x[i] = rhex(x[i]);
    }
    return x.join('');
  }

  function add32(a, b) {
    return (a + b) & 0xffffffff;
  }

  return hex(md51(str));
}
