// Base URL for API requests. By default the frontend assumes the backend
// is reachable from the same host/port it was served from. Using
// `window.location.origin` ensures requests are made to whichever server
// delivered the page, allowing the UI to work when accessed remotely.
// If your backend runs on a different host or port, replace this value
// with the appropriate URL (e.g. 'http://192.168.1.5:3000').
const API_BASE_URL = window.location.origin;

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
      // Remember the role so pages can conditionally display admin features
      localStorage.setItem('role', u.role);
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
  const teamName = document.getElementById('signupTeamName').value;
  // Number of seats/licenses for the new team. Defaults to 1 if not provided.
  const seats = parseInt(document.getElementById('signupSeats').value, 10) || 1;
  const token = document.getElementById('signupToken').value;

  // Send the collected details to the signup endpoint. When a team name is
  // supplied the backend will create the team and process a dummy payment
  // before completing registration.
  fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, teamName, token, seats })
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
// chain additional actions.
function loadMessages() {
  const list = document.getElementById('messageList');
  list.innerHTML = '';

  if (selectedUser) {
    // Load direct messages with the selected user
    return fetch(`${API_BASE_URL}/api/users/conversation/${selectedUser}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    })
      .then(r => r.json())
      .then(msgs => {
        msgs.forEach(appendDirectMessage);
        // Reload unread counts as messages have been marked seen
        loadUnreadCounts();
      });
  } else if (currentChannel) {
    // Retrieve the latest chat messages for the active channel
    return fetch(`${API_BASE_URL}/api/messages/channel/${currentChannel}`)
      .then(r => r.json())
      .then(msgs => msgs.forEach(appendMessage));
  }

  return Promise.resolve();
}

// Helper to add a single message element to the chat log
function appendMessage(m) {
  const list = document.getElementById('messageList');
  const div = document.createElement('div');
  div.innerHTML = `<strong>${m.user}:</strong> ${m.text}`;
  list.appendChild(div);
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

function appendDirectMessage(m) {
  const list = document.getElementById('messageList');
  const div = document.createElement('div');
  // Convert message timestamp to a relative description like "5 minutes ago"
  const time = formatRelativeTime(m.createdAt);
  div.className = 'message';

  // Render sender avatar, name and message text. Read receipts are omitted.
  div.innerHTML = `
    <img class="avatar" src="${getGravatarUrl(m.from)}" alt="avatar">
    <span class="user">${m.from}:</span>
    <span class="text">${m.text}</span>
    <span class="time">${time}</span>`;
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
        // Each user entry consists of an online indicator and the username.
        // Unread message counts will be shown by bolding the name instead of badges.
        li.innerHTML = `<span class="online-indicator"></span>${u.username}`;
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
  // Load the conversation and inform the server so unread counters update
  loadMessages().finally(() => markMessagesSeen(name));
}

// Verify the user is logged in before showing the dashboard
function checkAuth() {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  const role = localStorage.getItem('role');
  if (!token || !username) {
    // Not authenticated - return to login page
    window.location.href = 'login.html';
    return;
  }

  const avatarUrl = localStorage.getItem('avatarUrl') || getGravatarUrl(username);
  // Store all relevant details for convenience in other functions
  currentUser = { username, token, avatarUrl, role };

  // Display the admin navigation link only when the logged in user is an admin
  const adminLink = document.getElementById('adminLink');
  if (adminLink) {
    if (role === 'admin') {
      adminLink.classList.remove('hidden');
    } else {
      adminLink.classList.add('hidden');
    }
  }

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
  localStorage.removeItem('role');
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
    <td>${c.name}</td>
    <td>${c.email}</td>
    <td>${c.phone}</td>
    <td>${c.company || ''}</td>
    <td>${c.notes || ''}</td>
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
          <td>${p.name}</td>
          <td>${p.owner}</td>
          <td>${p.status}</td>
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
        row.innerHTML = `<td>${wp.name}</td><td>${wp.owner || ''}</td><td><button onclick="editWorkPackage('${projectId}','${wp._id}')">Edit</button></td>`;
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
        row.innerHTML = `<td>${t.name}</td><td>${t.owner || ''}</td><td><button onclick="editTask('${projectId}','${wpId}','${t._id}')">Edit</button></td>`;
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
