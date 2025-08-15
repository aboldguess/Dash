/**
 * Dash client logic
 * ------------------
 * Handles login, real-time messaging and business tool helpers for the
 * dashboard pages. Structured as a collection of small functions grouped by
 * feature area (authentication, messaging, CRM, projects, etc.).
 *
 * Security notes:
 *  - Authentication tokens are kept in sessionStorage to avoid long-term
 *    persistence in the browser.
 *  - DOM insertion uses element.textContent where possible to limit XSS risk.
 *
 * The base URL assumes the backend is served from the same origin as the
 * frontend. When pages are opened directly from the filesystem (no origin)
 * we fall back to `http://localhost:3000` so local testing still reaches the
 * backend without editing this file. Replace `API_BASE_URL` if your backend
 * runs elsewhere.
 */
const API_BASE_URL =
  window.location.origin && window.location.origin.startsWith('http')
    ? window.location.origin
    : 'http://localhost:3000';

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
// Track unread direct messages for each user so their names can be bolded
let unreadCounts = {};
let activeTool = 'messages'; // currently selected tool
// Track pagination state for message history
let oldestMessageTimestamp = null;
let loadingOlderMessages = false;
// Threshold in ms after which recently offline users show as away
const AWAY_THRESHOLD = 5 * 60 * 1000;

/** Escape HTML special characters to mitigate XSS when using innerHTML. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/** Toggle the visibility of the profile dropdown menu. */
function toggleProfileMenu() {
  const menu = document.getElementById('profileMenu');
  if (menu) {
    menu.classList.toggle('hidden');
    console.debug('Profile menu toggled');
  }
}

// Hide the profile menu when clicking anywhere outside of it
document.addEventListener('click', event => {
  const menu = document.getElementById('profileMenu');
  const avatar = document.getElementById('navAvatar');
  if (menu && !menu.classList.contains('hidden')) {
    if (avatar && !avatar.contains(event.target) && !menu.contains(event.target)) {
      menu.classList.add('hidden');
    }
  }
});

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

  if (tool === 'crm') {
    loadContacts();
    resetContactForm();
  }

  if (tool === 'projects') {
    loadProjects();
    resetProjectForm();
  }

  if (tool === 'social') {
    loadPosts();
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
  const status = document.getElementById('loginStatus');
  // Reset status text and styling on each attempt
  status.textContent = '';
  status.classList.remove('error');

  // Use the API base URL for all requests so the frontend works even
  // when served on a different port from the backend.
  console.debug('Attempting login', { username });
  fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(async r => {
      const text = await r.text();
      const contentType = r.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = JSON.parse(text);
        if (r.ok) return data;
        // Include HTTP status for clearer error reporting downstream
        const error = new Error(data.message || 'Login failed');
        error.status = r.status;
        throw error;
      }
      // Non-JSON response indicates a server-side problem or misconfiguration
      console.error('Unexpected response format', text);
      const error = new Error(
        `Unexpected response from server (status ${r.status}) - expected JSON`
      );
      error.status = r.status;
      throw error;
    })
    .then(u => {
      // Persist auth details in sessionStorage so other pages can verify
      // login state without leaving tokens sitting in long-term storage.
      sessionStorage.setItem('token', u.token);
      sessionStorage.setItem('username', u.username);
      // Remember the role so pages can conditionally display admin features
      sessionStorage.setItem('role', u.role);
      // Store calculated gravatar URL so it can be reused on the dashboard
      sessionStorage.setItem('avatarUrl', getGravatarUrl(u.username));

      // Redirect straight to the dashboard where the websocket
      // connection will be established.
      window.location.href = 'dashboard.html';
    })
    .catch(err => {
      console.error('Login request failed', err);
      // Surface HTTP status and message to the user for easier troubleshooting
      const statusMsg = err.status ? ` (status ${err.status})` : '';
      status.textContent = `Login failed${statusMsg}: ${err.message || err}`;
      status.classList.add('error');
    });
}

// Register a new user via the signup form
function signup() {
  const username = document.getElementById('signupUsername').value;
  const password = document.getElementById('signupPassword').value;
  const teamName = document.getElementById('signupTeamName').value;
  // Number of seats/licenses for the new team. Defaults to 1 if not provided.
  const seats = parseInt(document.getElementById('signupSeats').value, 10) || 1;
  const token = document.getElementById('signupToken').value;
  const status = document.getElementById('signupStatus');
  status.textContent = '';
  status.classList.remove('error');

  // Send the collected details to the signup endpoint. When a team name is
  // supplied the backend will create the team and process a dummy payment
  // before completing registration.
  console.debug('Attempting signup', { username, teamName, seats });
  fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, teamName, token, seats })
  })
    .then(async r => {
      const text = await r.text();
      const contentType = r.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = JSON.parse(text);
        if (r.ok) return data;
        throw new Error(data.message || 'Signup failed');
      }
      console.error('Unexpected response format', text);
      throw new Error('Unexpected response from server');
    })
    .then(u => {
      // Inform the user and send them to the login page
      status.textContent = `Account ${u.username} created`;
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000);
    })
    .catch(err => {
      console.error('Signup request failed', err);
      status.textContent = `Signup failed: ${err.message || err}`;
      status.classList.add('error');
    });
}

// Attach event listeners for authentication forms after the DOM loads. Using
// JavaScript listeners keeps inline script out of the HTML, satisfying the
// strict Content Security Policy while still providing graceful form handling.
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', evt => {
      evt.preventDefault();
      login();
    });
  }

  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', evt => {
      evt.preventDefault();
      signup();
    });
  }

  const avatar = document.getElementById('navAvatar');
  if (avatar) {
    const dashboard = !!document.getElementById('tool-messages');
    checkAuth(dashboard);
    avatar.addEventListener('click', toggleProfileMenu);
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      logoutLink.addEventListener('click', e => {
        e.preventDefault();
        logout();
      });
    }
  }

  // Dashboard-specific initialisation. All listeners are attached here to
  // satisfy the strict CSP which forbids inline event handlers.
  if (document.getElementById('tool-messages')) {
    document.querySelectorAll('.tool-sidebar li').forEach(li => {
      li.addEventListener('click', () => {
        const tool = li.id.replace('tool-', '');
        selectTool(tool);
      });
    });

    const sendBtn = document.getElementById('sendButton');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    const channelSelect = document.getElementById('channelSelect');
    if (channelSelect) channelSelect.addEventListener('change', changeChannel);

    const messageList = document.getElementById('messageList');
    if (messageList)
      messageList.addEventListener('scroll', () => {
        if (messageList.scrollTop === 0 && !loadingOlderMessages) {
          loadingOlderMessages = true;
          loadMessages(false).finally(() => {
            loadingOlderMessages = false;
          });
        }
      });

    const contactForm = document.getElementById('contactForm');
    if (contactForm)
      contactForm.addEventListener('submit', e => {
        e.preventDefault();
        saveContact(e);
      });

    const projectForm = document.getElementById('projectForm');
    if (projectForm)
      projectForm.addEventListener('submit', e => {
        e.preventDefault();
        saveProject(e);
      });

    const workPackageForm = document.getElementById('workPackageForm');
    if (workPackageForm)
      workPackageForm.addEventListener('submit', e => {
        e.preventDefault();
        saveWorkPackage(e);
      });

    const taskForm = document.getElementById('taskForm');
    if (taskForm)
      taskForm.addEventListener('submit', e => {
        e.preventDefault();
        saveTask(e);
      });

    const postForm = document.getElementById('postForm');
    if (postForm)
      postForm.addEventListener('submit', e => {
        e.preventDefault();
        savePost(e);
      });
  }
});

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
      // This flag will be updated once the recipient actually views the message
      isSeen: false
    };
    // Send the message to the server which will broadcast it back
    // to both participants. Rendering here would cause duplicates
    // when the echoed event arrives.
    socket.emit('directMessage', dm);
  } else if (currentChannel) {
    // Channel message
    const msg = {
      user: currentUser.username,
      text,
      channel: currentChannel
    };
    // Send to the server and rely on the broadcast for rendering
    // to avoid duplicate messages being displayed.
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

// Retrieve chat history for the active channel or direct conversation. The
// returned promise resolves once messages have been rendered so callers can
// chain additional actions. When `initial` is true the latest batch is
// requested and the view scrolled to the bottom. Subsequent calls with
// `initial` false prepend older messages when the user scrolls upwards.
function loadMessages(initial = true) {
  const list = document.getElementById('messageList');
  if (initial) {
    list.innerHTML = '';
    oldestMessageTimestamp = null;
  }

  console.debug('Loading messages', {
    initial,
    selectedUser,
    currentChannel,
    before: oldestMessageTimestamp
  });

  const params = new URLSearchParams();
  params.set('limit', '20');
  if (!initial && oldestMessageTimestamp) {
    params.set('before', oldestMessageTimestamp);
  }

  if (selectedUser) {
    // Load direct messages with the selected user
    return fetch(
      `${API_BASE_URL}/api/users/conversation/${selectedUser}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${currentUser.token}` } }
    )
      .then(r => r.json())
      .then(msgs => {
        const prevHeight = list.scrollHeight;
        msgs
          .reverse() // API returns newest first
          .forEach(m => {
            if (initial) appendDirectMessage(m, false);
            else prependDirectMessage(m);
          });
        if (msgs.length > 0) {
          oldestMessageTimestamp = msgs[0].createdAt;
        }
        if (initial) {
          scrollMessagesToBottom();
          // Reload unread counts as messages have been marked seen
          loadUnreadCounts();
        } else {
          list.scrollTop = list.scrollHeight - prevHeight;
        }
      });
  } else if (currentChannel) {
    // Retrieve the latest chat messages for the active channel
    return fetch(
      `${API_BASE_URL}/api/messages/channel/${currentChannel}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${currentUser.token}` } }
    )
      .then(r => r.json())
      .then(msgs => {
        const prevHeight = list.scrollHeight;
        msgs
          .reverse()
          .forEach(m => {
            if (initial) appendMessage(m, false);
            else prependMessage(m);
          });
        if (msgs.length > 0) {
          oldestMessageTimestamp = msgs[0].createdAt;
        }
        if (initial) {
          scrollMessagesToBottom();
        } else {
          list.scrollTop = list.scrollHeight - prevHeight;
        }
      });
  }

  return Promise.resolve();
}

/** Build a DOM element for a channel message. */
function buildChannelMessage(m) {
  const div = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${m.user}:`;
  div.appendChild(strong);
  div.appendChild(document.createTextNode(' ' + m.text));
  return div;
}

/** Append a channel message to the end of the list. */
function appendMessage(m, scroll = true) {
  const list = document.getElementById('messageList');
  list.appendChild(buildChannelMessage(m));
  if (scroll) scrollMessagesToBottom();
}

/** Prepend a channel message to the start of the list. */
function prependMessage(m) {
  const list = document.getElementById('messageList');
  list.insertBefore(buildChannelMessage(m), list.firstChild);
}

// Render a direct message including timestamp and avatars
function formatRelativeTime(dateStr) {
  // Difference in seconds between now and when the message was created
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (diff < 60) return 'just now';
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function buildDirectMessage(m) {
  const div = document.createElement('div');
  // Convert message timestamp to a relative description like "5 minutes ago"
  const time = formatRelativeTime(m.createdAt);
  div.className = 'message';

  const img = document.createElement('img');
  img.className = 'avatar';
  img.src = getGravatarUrl(m.from);
  img.alt = 'avatar';
  div.appendChild(img);

  const userSpan = document.createElement('span');
  userSpan.className = 'user';
  userSpan.textContent = `${m.from}:`;
  div.appendChild(userSpan);

  const textSpan = document.createElement('span');
  textSpan.className = 'text';
  textSpan.textContent = m.text;
  div.appendChild(textSpan);

  const timeSpan = document.createElement('span');
  timeSpan.className = 'time';
  timeSpan.textContent = time;
  div.appendChild(timeSpan);
  return div;
}

function appendDirectMessage(m, scroll = true) {
  const list = document.getElementById('messageList');
  list.appendChild(buildDirectMessage(m));
  if (scroll) scrollMessagesToBottom();
}

function prependDirectMessage(m) {
  const list = document.getElementById('messageList');
  list.insertBefore(buildDirectMessage(m), list.firstChild);
}

/** Scroll the message list to show the newest message. */
function scrollMessagesToBottom() {
  const list = document.getElementById('messageList');
  list.scrollTop = list.scrollHeight;
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
          const lastSeen = u.lastSeen ? new Date(u.lastSeen) : null;
          const statusClass = u.online
            ? 'user-online'
            : lastSeen && Date.now() - lastSeen.getTime() < AWAY_THRESHOLD
            ? 'user-away'
            : 'user-offline';
          li.className = statusClass;

          const indicator = document.createElement('span');
          indicator.className = 'online-indicator';
          indicator.title = u.online
            ? 'Online'
            : lastSeen
            ? `Last seen ${lastSeen.toLocaleString()}`
            : 'Last seen: unknown';
          li.appendChild(indicator);
          li.appendChild(document.createTextNode(u.username));

          li.onclick = () => selectUser(u.username);
          list.appendChild(li);
        });
      // After rendering users, load unread counts to bold names with unread messages
      loadUnreadCounts();
    });
}

// Fetch unread message counts and bold names with unread messages
function loadUnreadCounts() {
  fetch(`${API_BASE_URL}/api/users/unread`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(counts => {
      unreadCounts = counts;
      // Update every listed user so their name is bolded when unread messages are present
      document.querySelectorAll('#userList li').forEach(li => {
        const user = li.dataset.user;
        const count = counts[user] || 0;
        if (count > 0) {
          li.classList.add('unread');
        } else {
          li.classList.remove('unread');
        }
      });
    });
}

// Notify the server that all messages from the given user have been displayed.
// This keeps unread counters in sync when new messages arrive while a
// conversation is already open.
function markMessagesSeen(user) {
  fetch(`${API_BASE_URL}/api/users/read/${user}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${currentUser.token}` }
  }).then(() => loadUnreadCounts());
}

// Increase the unread counter for a given user and bold their name
function incrementUnread(user) {
  unreadCounts[user] = (unreadCounts[user] || 0) + 1;
  const li = document.querySelector(`#userList li[data-user="${user}"]`);
  if (li) {
    li.classList.add('unread');
  }
}

// Clear unread count when opening a conversation
function clearUnread(user) {
  unreadCounts[user] = 0;
  const li = document.querySelector(`#userList li[data-user="${user}"]`);
  if (li) {
    li.classList.remove('unread');
  }
}

// Update the displayed online status for a single user
function handlePresence(name, online, lastSeen) {
  const item = document.querySelector(`#userList li[data-user="${name}"]`);
  if (item) {
    const indicator = item.querySelector('.online-indicator');
    if (online) {
      item.className = 'user-online';
      if (indicator) indicator.title = 'Online';
    } else {
      const seenDate = lastSeen ? new Date(lastSeen) : null;
      const status =
        seenDate && Date.now() - seenDate.getTime() < AWAY_THRESHOLD
          ? 'user-away'
          : 'user-offline';
      item.className = status;
      if (indicator) {
        indicator.title = seenDate
          ? `Last seen ${seenDate.toLocaleString()}`
          : 'Last seen: unknown';
      }
    }
  }
}

// Select a user to view direct conversation
function selectUser(name) {
  selectedUser = name;
  currentChannel = null; // hide channel context
  clearUnread(name);
  // Load the conversation and inform the server so unread counters update
  loadMessages().finally(() => markMessagesSeen(name));
}

// Verify the user is logged in before showing the dashboard
/**
 * Verify the user is authenticated and set up the navbar.
 * If `initDashboard` is true, messaging channels and the Socket.IO
 * connection are also initialised for the dashboard page.
 */
function checkAuth(initDashboard = false) {
  const token = sessionStorage.getItem('token');
  const username = sessionStorage.getItem('username');
  const role = sessionStorage.getItem('role');
  if (!token || !username) {
    // Not authenticated - return to login page
    window.location.href = 'login.html';
    return;
  }

  const avatarUrl = sessionStorage.getItem('avatarUrl') || getGravatarUrl(username);
  // Store all relevant details for convenience in other functions
  currentUser = { username, token, avatarUrl, role };

  // Populate the navbar avatar if present
  const avatarImg = document.getElementById('navAvatar');
  if (avatarImg) {
    avatarImg.src = avatarUrl;
    avatarImg.alt = `${username} profile`;
  }

  // Show the "Manage Users" menu option only for admins
  const manageUsersLink = document.getElementById('manageUsersLink');
  if (manageUsersLink) {
    if (role === 'admin') {
      manageUsersLink.classList.remove('hidden');
    } else {
      manageUsersLink.classList.add('hidden');
    }
  }

  if (initDashboard) {
    // After setting currentUser, connect to Socket.IO and load channels/messages
    loadSocketIo().then(() => {
      socket = io(API_BASE_URL);
      socket.emit('register', currentUser.username);
      socket.on('messages', msg => appendMessage(msg));
      socket.on('directMessage', dm => {
        // Only show incoming messages if conversation is open
        if (selectedUser === dm.from || selectedUser === dm.to) {
          appendDirectMessage(dm);
          // If we are the recipient and the conversation is visible, notify
          // the server immediately that we've displayed the new message.
          if (dm.to === currentUser.username) {
            markMessagesSeen(dm.from);
          }
        } else if (dm.to === currentUser.username) {
          incrementUnread(dm.from);
        }
      });
      // Refresh unread counts when other tabs mark messages as read
      socket.on('messagesSeen', () => {
        loadUnreadCounts();
      });
      // Update presence indicators in real time
      socket.on('userOnline', data => handlePresence(data.username, true));
      socket.on('userOffline', data => handlePresence(data.username, false, data.lastSeen));
      // Default to messaging view once authenticated
      selectTool('messages');
    });
  }
}

// Clear stored credentials and return to login page
function logout() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('username');
  sessionStorage.removeItem('avatarUrl');
  sessionStorage.removeItem('role');
  if (socket) {
    socket.disconnect();
  }
  window.location.href = 'login.html';
}

// ----------------------- CRM helpers -----------------------

// Clear the contact form inputs
function resetContactForm() {
  document.getElementById('contactId').value = '';
  document.getElementById('contactName').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactCompany').value = '';
  document.getElementById('contactNotes').value = '';
}

// Retrieve all contacts and render them in a table
function loadContacts() {
  fetch(`${API_BASE_URL}/api/crm`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      const table = document.getElementById('contactTable');
      table.innerHTML = '';
      const header = document.createElement('tr');
      header.innerHTML =
        '<th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Notes</th><th></th>';
      table.appendChild(header);
      list.forEach(c => {
        addContactRow(c);
      });
    });
}

// Create and append a table row for a single contact
function addContactRow(c) {
  const table = document.getElementById('contactTable');
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${escapeHtml(c.name)}</td>
    <td>${escapeHtml(c.email)}</td>
    <td>${escapeHtml(c.phone)}</td>
    <td>${escapeHtml(c.company || '')}</td>
    <td>${escapeHtml(c.notes || '')}</td>
    <td>
      <button onclick="editContact('${c._id}')">Edit</button>
      <button onclick="deleteContact('${c._id}')">Delete</button>
    </td>`;
  table.appendChild(row);
}

// Populate the form with an existing contact
function editContact(id) {
  fetch(`${API_BASE_URL}/api/crm/${id}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(c => {
      document.getElementById('contactId').value = c._id;
      document.getElementById('contactName').value = c.name;
      document.getElementById('contactEmail').value = c.email;
      document.getElementById('contactPhone').value = c.phone;
      document.getElementById('contactCompany').value = c.company || '';
      document.getElementById('contactNotes').value = c.notes || '';
    });
}

// Persist a new or existing contact
function saveContact(e) {
  e.preventDefault();
  // Display a subtle status message while processing the request
  const status = document.getElementById('contactStatus');
  status.textContent = 'Saving...';
  const id = document.getElementById('contactId').value;
  const name = document.getElementById('contactName').value;
  const email = document.getElementById('contactEmail').value;
  const phone = document.getElementById('contactPhone').value;
  const company = document.getElementById('contactCompany').value;
  const notes = document.getElementById('contactNotes').value;
  fetch(`${API_BASE_URL}/api/crm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ id, name, email, phone, company, notes })
  })
    .then(r =>
      r.ok
        ? r.json()
        : r.json().then(d => Promise.reject(d.message || 'Failed to save'))
    )
    .then(contact => {
      resetContactForm();
      // If a new contact was created, append the row immediately for feedback
      if (!id) {
        addContactRow(contact);
      } else {
        loadContacts();
      }
      status.textContent = 'Saved';
      setTimeout(() => {
        status.textContent = '';
      }, 2000);
    })
    .catch(err => {
      status.textContent = err;
    });
}

// Remove a contact and refresh the table
function deleteContact(id) {
  fetch(`${API_BASE_URL}/api/crm/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${currentUser.token}` }
  }).then(() => loadContacts());
}

// ----------------------- Project helpers -----------------------

// Clear project form inputs
function resetProjectForm() {
  document.getElementById('projectId').value = '';
  document.getElementById('projectName').value = '';
  document.getElementById('projectOwner').value = '';
  document.getElementById('projectStart').value = '';
  document.getElementById('projectEnd').value = '';
  document.getElementById('projectHours').value = '';
  document.getElementById('projectCost').value = '';
  document.getElementById('projectDesc').value = '';
  document.getElementById('workPackageSection').classList.add('hidden');
  resetWorkPackageForm();
  resetTaskForm();
}

// Retrieve all projects and render them along with a simple Gantt chart
function loadProjects() {
  fetch(`${API_BASE_URL}/api/projects`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      const table = document.getElementById('projectTable');
      table.innerHTML = '';
      const header = document.createElement('tr');
      header.innerHTML = '<th>Name</th><th>Owner</th><th>Status</th><th></th>';
      table.appendChild(header);
      const tasks = [];
      list.forEach(p => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.owner)}</td>
          <td>${escapeHtml(p.status)}</td>
          <td><button onclick="editProject('${p._id}')">Edit</button></td>`;
        table.appendChild(row);
        // Collect tasks for gantt chart
        if (p.workPackages) {
          p.workPackages.forEach(wp => {
            wp.tasks.forEach(t => {
              tasks.push({
                id: t._id,
                name: t.name,
                start: t.start,
                end: t.end
              });
            });
          });
        }
      });

      renderGantt(tasks);
    });
}

// Populate form for editing a project
function editProject(id) {
  fetch(`${API_BASE_URL}/api/projects/${id}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(p => {
      document.getElementById('projectId').value = p._id;
      document.getElementById('projectName').value = p.name;
      document.getElementById('projectOwner').value = p.owner;
      document.getElementById('projectStart').value = p.start ? p.start.substr(0,10) : '';
      document.getElementById('projectEnd').value = p.end ? p.end.substr(0,10) : '';
      document.getElementById('projectHours').value = p.hours || '';
      document.getElementById('projectCost').value = p.cost || '';
      document.getElementById('projectDesc').value = p.description || '';
      loadWorkPackages(p._id);
    });
}

// Persist project details
function saveProject(e) {
  e.preventDefault();
  const id = document.getElementById('projectId').value;
  const name = document.getElementById('projectName').value;
  const owner = document.getElementById('projectOwner').value;
  const start = document.getElementById('projectStart').value;
  const end = document.getElementById('projectEnd').value;
  const hours = document.getElementById('projectHours').value;
  const cost = document.getElementById('projectCost').value;
  const description = document.getElementById('projectDesc').value;
  fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ id, name, owner, start, end, hours, cost, description })
  }).then(() => {
    resetProjectForm();
    loadProjects();
  });
}

// ----------------------- Work package helpers -----------------------

function resetWorkPackageForm() {
  document.getElementById('wpId').value = '';
  document.getElementById('wpName').value = '';
  document.getElementById('wpOwner').value = '';
  document.getElementById('wpStart').value = '';
  document.getElementById('wpEnd').value = '';
  document.getElementById('wpHours').value = '';
  document.getElementById('wpCost').value = '';
}

function resetTaskForm() {
  document.getElementById('taskId').value = '';
  document.getElementById('taskName').value = '';
  document.getElementById('taskOwner').value = '';
  document.getElementById('taskStart').value = '';
  document.getElementById('taskEnd').value = '';
  document.getElementById('taskHours').value = '';
  document.getElementById('taskCost').value = '';
}

function loadWorkPackages(projectId) {
  document.getElementById('workPackageSection').classList.remove('hidden');
  document.getElementById('wpProject').value = projectId;
  document.getElementById('taskProject').value = projectId;
  fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      const table = document.getElementById('workPackageTable');
      table.innerHTML = '';
      const header = document.createElement('tr');
      header.innerHTML = '<th>Name</th><th>Owner</th><th></th>';
      table.appendChild(header);
      list.forEach(wp => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${escapeHtml(wp.name)}</td><td>${escapeHtml(wp.owner || '')}</td><td><button onclick="editWorkPackage('${projectId}','${wp._id}')">Edit</button></td>`;
        table.appendChild(row);
      });
    });
}

function editWorkPackage(projectId, wpId) {
  fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(wp => {
      document.getElementById('wpProject').value = projectId;
      document.getElementById('wpId').value = wp._id;
      document.getElementById('wpName').value = wp.name;
      document.getElementById('wpOwner').value = wp.owner || '';
      document.getElementById('wpStart').value = wp.start ? wp.start.substr(0,10) : '';
      document.getElementById('wpEnd').value = wp.end ? wp.end.substr(0,10) : '';
      document.getElementById('wpHours').value = wp.hours || '';
      document.getElementById('wpCost').value = wp.cost || '';
      document.getElementById('taskWp').value = wp._id;
      loadTasks(projectId, wp._id);
    });
}

function saveWorkPackage(e) {
  e.preventDefault();
  const projectId = document.getElementById('wpProject').value;
  const id = document.getElementById('wpId').value;
  const data = {
    name: document.getElementById('wpName').value,
    owner: document.getElementById('wpOwner').value,
    start: document.getElementById('wpStart').value,
    end: document.getElementById('wpEnd').value,
    hours: document.getElementById('wpHours').value,
    cost: document.getElementById('wpCost').value
  };
  const url = id
    ? `${API_BASE_URL}/api/projects/${projectId}/workpackages/${id}`
    : `${API_BASE_URL}/api/projects/${projectId}/workpackages`;
  const method = id ? 'PATCH' : 'POST';
  fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(data)
  }).then(() => {
    resetWorkPackageForm();
    loadWorkPackages(projectId);
  });
}

function loadTasks(projectId, wpId) {
  document.getElementById('taskWp').value = wpId;
  fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(wp => {
      const table = document.getElementById('taskTable');
      table.innerHTML = '';
      const header = document.createElement('tr');
      header.innerHTML = '<th>Name</th><th>Owner</th><th></th>';
      table.appendChild(header);
      wp.tasks.forEach(t => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.owner || '')}</td><td><button onclick="editTask('${projectId}','${wpId}','${t._id}')">Edit</button></td>`;
        table.appendChild(row);
      });
    });
}

function editTask(projectId, wpId, taskId) {
  fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(t => {
      document.getElementById('taskProject').value = projectId;
      document.getElementById('taskWp').value = wpId;
      document.getElementById('taskId').value = t._id;
      document.getElementById('taskName').value = t.name;
      document.getElementById('taskOwner').value = t.owner || '';
      document.getElementById('taskStart').value = t.start ? t.start.substr(0,10) : '';
      document.getElementById('taskEnd').value = t.end ? t.end.substr(0,10) : '';
      document.getElementById('taskHours').value = t.hours || '';
      document.getElementById('taskCost').value = t.cost || '';
    });
}

function saveTask(e) {
  e.preventDefault();
  const projectId = document.getElementById('taskProject').value;
  const wpId = document.getElementById('taskWp').value;
  const id = document.getElementById('taskId').value;
  const data = {
    name: document.getElementById('taskName').value,
    owner: document.getElementById('taskOwner').value,
    start: document.getElementById('taskStart').value,
    end: document.getElementById('taskEnd').value,
    hours: document.getElementById('taskHours').value,
    cost: document.getElementById('taskCost').value
  };
  const url = id
    ? `${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}/tasks/${id}`
    : `${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}/tasks`;
  const method = id ? 'PATCH' : 'POST';
  fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(data)
  }).then(() => {
    resetTaskForm();
    loadTasks(projectId, wpId);
    loadProjects();
  });
}

// Basic gantt rendering using the frappe-gantt library
function renderGantt(tasks) {
  const area = document.getElementById('gantt');
  area.innerHTML = '';
  if (tasks.length === 0) return;
  // Ensure the library is loaded via CDN
  if (typeof Gantt === 'undefined') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/frappe-gantt/dist/frappe-gantt.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/frappe-gantt/dist/frappe-gantt.min.js';
    script.onload = () => new Gantt(area, tasks);
    document.body.appendChild(script);
  } else {
    new Gantt(area, tasks);
  }
}

// ----------------------- Social helpers -----------------------

// Retrieve all posts for the social feed
function loadPosts() {
  fetch(`${API_BASE_URL}/api/social/posts`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      const posts = document.getElementById('postList');
      posts.innerHTML = '';
      list.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.author.username}: ${p.text}`;
        posts.appendChild(li);
      });
    });
}

// Submit a new social post
function savePost(e) {
  e.preventDefault();
  const text = document.getElementById('postText').value;
  fetch(`${API_BASE_URL}/api/social/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ text })
  }).then(() => {
    document.getElementById('postText').value = '';
    loadPosts();
  });
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
