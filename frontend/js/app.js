/**
 * Dash client logic
 * ------------------
 * Handles login, real-time messaging and business tool helpers for the
 * dashboard pages. Structured as a collection of small functions grouped by
 * feature area (authentication, messaging, CRM, projects, timesheets, leave
 * requests and more).
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
// Cached project list used by timesheet selectors
let projectCache = [];
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
  }

  if (tool === 'timesheets') {
    loadProjects().then(() => {
      loadTimesheets();
      resetTimesheetForm();
    });
  }

  if (tool === 'leave') {
    loadLeaves();
    resetLeaveForm();
    // Only administrators can adjust the status field
    const statusField = document.getElementById('leaveStatus');
    const statusLabel = document.getElementById('leaveStatusLabel');
    if (statusField && statusLabel) {
      if (currentUser.role === 'admin') {
        statusField.classList.remove('hidden');
        statusLabel.classList.remove('hidden');
      } else {
        statusField.classList.add('hidden');
        statusLabel.classList.add('hidden');
      }
    }
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
    .then(async u => {
      // Persist auth details in sessionStorage so other pages can verify
      // login state without leaving tokens sitting in long-term storage.
      sessionStorage.setItem('token', u.token);
      sessionStorage.setItem('username', u.username);
      // Remember the role so pages can conditionally display admin features
      sessionStorage.setItem('role', u.role);
      // Store the numeric user id so features like timesheets can reference it
      sessionStorage.setItem('userId', u.id);
      // Store calculated gravatar URL so it can be reused on the dashboard
      sessionStorage.setItem('avatarUrl', getGravatarUrl(u.username));

      // Preload existing profile photo so navigation avatar is correct on
      // the first page load after login. Any errors are logged but do not
      // block the redirect.
      try {
        const profileRes = await fetch(`${API_BASE_URL}/api/profile/me`, {
          headers: { Authorization: `Bearer ${u.token}` }
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile.photo) {
            sessionStorage.setItem('avatarPath', profile.photo);
          }
        }
      } catch (err) {
        console.error('Failed to preload profile', err);
      }

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
  const dashboardRoot = document.getElementById('tool-messages');
  if (dashboardRoot) {
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

    const timesheetForm = document.getElementById('timesheetForm');
    if (timesheetForm)
      timesheetForm.addEventListener('submit', e => {
        e.preventDefault();
        saveTimesheet(e);
      });

    const sheetProject = document.getElementById('sheetProject');
    if (sheetProject)
      sheetProject.addEventListener('change', e => {
        populateTimesheetWorkPackages(e.target.value);
      });

    const sheetWp = document.getElementById('sheetWp');
    if (sheetWp)
      sheetWp.addEventListener('change', e => {
        populateTimesheetTasks(sheetProject.value, e.target.value);
      });

    const leaveForm = document.getElementById('leaveForm');
    if (leaveForm)
      leaveForm.addEventListener('submit', e => {
        e.preventDefault();
        saveLeave(e);
      });

    const postForm = document.getElementById('postForm');
    if (postForm)
      postForm.addEventListener('submit', e => {
        e.preventDefault();
        savePost(e);
      });
  }

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

  const addProjectBtn = document.getElementById('addProjectButton');
  if (addProjectBtn)
    addProjectBtn.addEventListener('click', () => {
      window.location.href = 'project.html';
    });
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
  const id = sessionStorage.getItem('userId');
  if (!token || !username) {
    // Not authenticated - return to login page
    window.location.href = 'login.html';
    return;
  }

  const avatarPath = sessionStorage.getItem('avatarPath');
  const gravatar = sessionStorage.getItem('avatarUrl') || getGravatarUrl(username);
  // Store all relevant details for convenience in other functions. The
  // avatarUrl field will be updated later if a protected photo exists.
  currentUser = { id, username, token, avatarUrl: gravatar, role };

  // Populate the navbar avatar if present. If a profile photo exists it must
  // be fetched with authorization and converted to a blob URL for display.
  const avatarImg = document.getElementById('navAvatar');
  if (avatarImg) {
    avatarImg.alt = `${username} profile`;
    if (avatarPath) {
      fetch(`${API_BASE_URL}${avatarPath}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => (r.ok ? r.blob() : Promise.reject('Failed to load avatar')))
        .then(b => {
          const url = URL.createObjectURL(b);
          avatarImg.src = url;
          currentUser.avatarUrl = url;
        })
        .catch(err => {
          console.error(err);
          avatarImg.src = gravatar;
        });
    } else {
      avatarImg.src = gravatar;
    }
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
  sessionStorage.removeItem('avatarPath');
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
  document.getElementById('projectBillable').checked = true;
  document.getElementById('workPackageSection').classList.add('hidden');
  resetWorkPackageForm();
  resetTaskForm();
}

// Retrieve all projects and render them along with a simple Gantt chart
function loadProjects() {
  return fetch(`${API_BASE_URL}/api/projects`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      projectCache = list;
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
          <td><a href="project.html?id=${p._id}">Edit</a> <button onclick="deleteProject('${p._id}')">Delete</button></td>`;
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

      if (document.getElementById('gantt')) {
        renderGantt(tasks);
      }
      populateTimesheetProjects();
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
      document.getElementById('projectBillable').checked = p.billable !== false;
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
  const billable = document.getElementById('projectBillable').checked;
  const description = document.getElementById('projectDesc').value;
  fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ id, name, owner, start, end, hours, cost, billable, description })
  }).then(() => {
    resetProjectForm();
    if (document.getElementById('projectTable')) {
      loadProjects();
    }
  });
}

// Remove a project after confirmation
function deleteProject(id) {
  if (!confirm('Delete this project?')) return;
  fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${currentUser.token}` }
  }).then(() => loadProjects());
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
  document.getElementById('taskProject').value = '';
  document.getElementById('taskWp').value = '';
  document.getElementById('taskId').value = '';
  document.getElementById('taskName').value = '';
  document.getElementById('taskOwner').value = '';
  document.getElementById('taskStart').value = '';
  document.getElementById('taskEnd').value = '';
  document.getElementById('taskHours').value = '';
  document.getElementById('taskCost').value = '';
  document.getElementById('taskForm').classList.add('hidden');
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
      const container = document.getElementById('workPackageList');
      container.innerHTML = '';
      list.forEach(wp => {
        const card = document.createElement('div');
        card.className = 'card';
        const header = document.createElement('div');
        header.innerHTML = `
          <strong>${escapeHtml(wp.name)}</strong> ${escapeHtml(wp.owner || '')}
          <button onclick="editWorkPackage('${projectId}','${wp._id}')">Edit</button>
          <button onclick="deleteWorkPackage('${projectId}','${wp._id}')">Delete</button>
          <button onclick="prepareNewTask('${projectId}','${wp._id}')">Add Task</button>`;
        card.appendChild(header);

        const table = document.createElement('table');
        table.className = 'admin-table';
        const tHead = document.createElement('tr');
        tHead.innerHTML = '<th>Task</th><th>Owner</th><th></th>';
        table.appendChild(tHead);
        wp.tasks.forEach(t => {
          const tRow = document.createElement('tr');
          tRow.innerHTML = `
            <td>${escapeHtml(t.name)}</td>
            <td>${escapeHtml(t.owner || '')}</td>
            <td><button onclick="editTask('${projectId}','${wp._id}','${t._id}')">Edit</button>
                <button onclick="deleteTask('${projectId}','${wp._id}','${t._id}')">Delete</button></td>`;
          table.appendChild(tRow);
        });
        card.appendChild(table);
        container.appendChild(card);
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
  });
}

/**
 * Create a work package under the specified project.
 * Returns the fetch() promise so callers can chain actions.
 */
function addWorkPackage(projectId, data) {
  console.debug('Adding work package', { projectId, data });
  return fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(data)
  });
}

/**
 * Remove a work package from a project.
 */
function removeWorkPackage(projectId, wpId) {
  console.debug('Removing work package', { projectId, wpId });
  return fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${currentUser.token}` }
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
  if (id) {
    fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(data)
    }).then(() => {
      resetWorkPackageForm();
      loadWorkPackages(projectId);
    });
  } else {
    addWorkPackage(projectId, data).then(() => {
      resetWorkPackageForm();
      loadWorkPackages(projectId);
    });
  }
}

// Remove a work package after confirmation
function deleteWorkPackage(projectId, wpId) {
  if (!confirm('Delete this work package?')) return;
  removeWorkPackage(projectId, wpId).then(() => loadWorkPackages(projectId));
}

// Show empty task form for creating a new task under a work package
function prepareNewTask(projectId, wpId) {
  resetTaskForm();
  document.getElementById('taskProject').value = projectId;
  document.getElementById('taskWp').value = wpId;
  document.getElementById('taskForm').classList.remove('hidden');
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
      document.getElementById('taskForm').classList.remove('hidden');
    });
}

/**
 * Add a task to a work package.
 */
function addTask(projectId, wpId, data) {
  console.debug('Adding task', { projectId, wpId, data });
  return fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(data)
  });
}

/**
 * Remove a task from a work package.
 */
function removeTask(projectId, wpId, taskId) {
  console.debug('Removing task', { projectId, wpId, taskId });
  return fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${currentUser.token}` }
  });
}

// Delete a task from a work package
function deleteTask(projectId, wpId, taskId) {
  if (!confirm('Delete this task?')) return;
  removeTask(projectId, wpId, taskId).then(() => loadWorkPackages(projectId));
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
  if (id) {
    fetch(`${API_BASE_URL}/api/projects/${projectId}/workpackages/${wpId}/tasks/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(data)
    }).then(() => {
      resetTaskForm();
      loadWorkPackages(projectId);
      loadProjects();
    });
  } else {
    addTask(projectId, wpId, data).then(() => {
      resetTaskForm();
      loadWorkPackages(projectId);
      loadProjects();
    });
  }
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

// ----------------------- Timesheet helpers -----------------------

let timesheetCache = [];

// Populate the project dropdown in the timesheet form
function populateTimesheetProjects() {
  const select = document.getElementById('sheetProject');
  if (!select) return;
  select.innerHTML = '<option value="">Select project</option>';
  projectCache.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p._id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

// Populate work packages based on selected project
function populateTimesheetWorkPackages(projectId) {
  const wpSelect = document.getElementById('sheetWp');
  const taskSelect = document.getElementById('sheetTask');
  wpSelect.innerHTML = '';
  taskSelect.innerHTML = '';
  const proj = projectCache.find(p => p._id === projectId);
  if (!proj) return;
  // Update billable checkbox based on project settings
  const billable = document.getElementById('sheetBillable');
  if (billable) billable.checked = proj.billable !== false;
  wpSelect.innerHTML = '<option value="">Select work package</option>';
  proj.workPackages.forEach(wp => {
    const opt = document.createElement('option');
    opt.value = wp._id;
    opt.textContent = wp.name;
    wpSelect.appendChild(opt);
  });
}

// Populate tasks based on selected work package
function populateTimesheetTasks(projectId, wpId) {
  const taskSelect = document.getElementById('sheetTask');
  taskSelect.innerHTML = '';
  const proj = projectCache.find(p => p._id === projectId);
  const wp = proj?.workPackages.find(w => w._id === wpId);
  if (!wp) return;
  taskSelect.innerHTML = '<option value="">Select task</option>';
  wp.tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t._id;
    opt.textContent = t.name;
    taskSelect.appendChild(opt);
  });
}

// Clear timesheet form inputs
function resetTimesheetForm() {
  document.getElementById('sheetId').value = '';
  document.getElementById('sheetDate').value = '';
  document.getElementById('sheetHours').value = '';
  document.getElementById('sheetProject').selectedIndex = 0;
  document.getElementById('sheetWp').innerHTML = '';
  document.getElementById('sheetTask').innerHTML = '';
  document.getElementById('sheetBillable').checked = true;
}

// Fetch all timesheets for the current user and render them
function loadTimesheets() {
  console.debug('Loading timesheets');
  fetch(`${API_BASE_URL}/api/timesheets`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      timesheetCache = list;
      renderTimesheetTable(list);
    });
}

// Render the timesheet table
function renderTimesheetTable(list) {
  const table = document.getElementById('timesheetTable');
  table.innerHTML = '';
  const header = document.createElement('tr');
  header.innerHTML = '<th>Date</th><th>Project</th><th>Task</th><th>Hours</th><th>Billable</th><th></th>';
  table.appendChild(header);
  list.forEach(s => addTimesheetRow(s));
}

// Append a single row to the timesheet table
function addTimesheetRow(s) {
  const table = document.getElementById('timesheetTable');
  const row = document.createElement('tr');
  const dateStr = new Date(s.date).toLocaleDateString();
  const projectId = typeof s.project === 'object' ? s.project._id : s.project;
  const wpId = typeof s.workPackage === 'object' ? s.workPackage._id : s.workPackage;
  const taskId = typeof s.task === 'object' ? s.task._id : s.task;
  const proj = projectCache.find(p => p._id === projectId);
  const wp = proj?.workPackages?.find(w => w._id === wpId);
  const task = wp?.tasks?.find(t => t._id === taskId);
  row.innerHTML = `
    <td>${escapeHtml(dateStr)}</td>
    <td>${escapeHtml(proj ? proj.name : '')}</td>
    <td>${escapeHtml(task ? task.name : '')}</td>
    <td>${escapeHtml(String(s.hours))}</td>
    <td>${s.billable ? 'Yes' : 'No'}</td>
    <td><button onclick="editTimesheet('${s._id}')">Edit</button></td>`;
  table.appendChild(row);
}

// Populate the form for editing an existing timesheet
function editTimesheet(id) {
  const sheet = timesheetCache.find(t => t._id === id);
  if (!sheet) return;
  document.getElementById('sheetId').value = sheet._id;
  document.getElementById('sheetDate').value = sheet.date.substr(0, 10);
  document.getElementById('sheetHours').value = sheet.hours;
  const projectId = typeof sheet.project === 'object' ? sheet.project._id : sheet.project;
  const wpId = typeof sheet.workPackage === 'object' ? sheet.workPackage._id : sheet.workPackage;
  const taskId = typeof sheet.task === 'object' ? sheet.task._id : sheet.task;
  document.getElementById('sheetProject').value = projectId || '';
  populateTimesheetWorkPackages(projectId);
  document.getElementById('sheetWp').value = wpId || '';
  populateTimesheetTasks(projectId, wpId);
  document.getElementById('sheetTask').value = taskId || '';
  document.getElementById('sheetBillable').checked = sheet.billable;
}

// Submit a new or existing timesheet to the server
function saveTimesheet(e) {
  e.preventDefault();
  const status = document.getElementById('timesheetStatus');
  status.textContent = 'Saving...';
  const id = document.getElementById('sheetId').value;
  const date = document.getElementById('sheetDate').value;
  const hours = document.getElementById('sheetHours').value;
  const userId = currentUser.id;
  const project = document.getElementById('sheetProject').value;
  const workPackage = document.getElementById('sheetWp').value || null;
  const task = document.getElementById('sheetTask').value || null;
  const billable = document.getElementById('sheetBillable').checked;
  console.debug('Saving timesheet', { id, date, hours, project, workPackage, task, billable });
  fetch(`${API_BASE_URL}/api/timesheets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ id, userId, project, workPackage, task, date, hours, billable })
  })
    .then(r =>
      r.ok ? r.json() : r.json().then(d => Promise.reject(d.message || 'Failed to save'))
    )
    .then(() => {
      resetTimesheetForm();
      loadTimesheets();
      status.textContent = 'Saved';
      setTimeout(() => (status.textContent = ''), 2000);
    })
    .catch(err => {
      status.textContent = err;
    });
}

// ----------------------- Leave helpers -----------------------

let leaveCache = [];

// Clear leave form inputs
function resetLeaveForm() {
  document.getElementById('leaveId').value = '';
  document.getElementById('leaveStart').value = '';
  document.getElementById('leaveEnd').value = '';
  const statusField = document.getElementById('leaveStatus');
  if (statusField) statusField.value = 'pending';
}

// Fetch leave records for the current user; admins see all
function loadLeaves() {
  console.debug('Loading leaves');
  fetch(`${API_BASE_URL}/api/leaves`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      leaveCache = list;
      renderLeaveTable(list);
    });
}

// Render the leave request table
function renderLeaveTable(list) {
  const table = document.getElementById('leaveTable');
  table.innerHTML = '';
  const header = document.createElement('tr');
  header.innerHTML =
    currentUser.role === 'admin'
      ? '<th>Start</th><th>End</th><th>Status</th><th></th>'
      : '<th>Start</th><th>End</th><th>Status</th>';
  table.appendChild(header);
  list.forEach(l => addLeaveRow(l));
}

// Append a single leave row
function addLeaveRow(l) {
  const table = document.getElementById('leaveTable');
  const row = document.createElement('tr');
  const startStr = new Date(l.startDate).toLocaleDateString();
  const endStr = new Date(l.endDate).toLocaleDateString();
  const actions =
    currentUser.role === 'admin'
      ? `<button onclick="updateLeaveStatus('${l._id}','approved')">Approve</button>` +
        `<button onclick="updateLeaveStatus('${l._id}','rejected')">Reject</button>` +
        `<button onclick="editLeave('${l._id}')">Edit</button>`
      : `<button onclick="editLeave('${l._id}')">Edit</button>`;
  row.innerHTML =
    currentUser.role === 'admin'
      ? `<td>${escapeHtml(startStr)}</td><td>${escapeHtml(endStr)}</td><td>${escapeHtml(l.status)}</td><td>${actions}</td>`
      : `<td>${escapeHtml(startStr)}</td><td>${escapeHtml(endStr)}</td><td>${escapeHtml(l.status)}</td>`;
  table.appendChild(row);
}

// Populate the form for editing an existing leave request
function editLeave(id) {
  const l = leaveCache.find(t => t._id === id);
  if (!l) return;
  document.getElementById('leaveId').value = l._id;
  document.getElementById('leaveStart').value = l.startDate.substr(0, 10);
  document.getElementById('leaveEnd').value = l.endDate.substr(0, 10);
  const statusField = document.getElementById('leaveStatus');
  if (statusField) statusField.value = l.status;
}

// Submit a new or existing leave request to the server
function saveLeave(e) {
  e.preventDefault();
  const status = document.getElementById('leaveStatusMsg');
  status.textContent = 'Saving...';
  const id = document.getElementById('leaveId').value;
  const startDate = document.getElementById('leaveStart').value;
  const endDate = document.getElementById('leaveEnd').value;
  const statusVal = document.getElementById('leaveStatus').value;
  const userId = currentUser.id;
  const data = { id, userId, startDate, endDate };
  if (currentUser.role === 'admin') data.status = statusVal;
  console.debug('Saving leave', data);
  fetch(`${API_BASE_URL}/api/leaves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify(data)
  })
    .then(r =>
      r.ok ? r.json() : r.json().then(d => Promise.reject(d.message || 'Failed to save'))
    )
    .then(() => {
      resetLeaveForm();
      loadLeaves();
      status.textContent = 'Saved';
      setTimeout(() => (status.textContent = ''), 2000);
    })
    .catch(err => {
      status.textContent = err;
    });
}

// Update leave status (admin only)
function updateLeaveStatus(id, status) {
  console.debug('Updating leave status', { id, status });
  fetch(`${API_BASE_URL}/api/leaves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ id, userId: currentUser.id, status })
  }).then(() => loadLeaves());
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
