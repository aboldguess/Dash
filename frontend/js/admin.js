/**
 * Admin dashboard helpers
 * -----------------------
 * Provides UI logic for managing configuration, teams and users. The file is
 * structured into small functions grouped by feature area so it can be easily
 * navigated. Authentication and base API configuration are shared via app.js.
 *
 * Security notes:
 *  - escapeHtml() is used to sanitize any user supplied content before it is
 *    inserted into the DOM, protecting against XSS.
 */

// Cached list of teams so multiple panels can reference the same data
let teamsCache = [];

/** Escape HTML special characters to mitigate XSS when using innerHTML. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function initAdmin() {
  // Verify the user is logged in and has the correct role
  checkAuth();
  if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  // Initial data fetches
  loadConfig();
  loadTeams();
  loadAllUsers();
}

/** Show the requested admin section and hide the others. */
function selectAdminSection(id) {
  document.querySelectorAll('.admin-section').forEach(sec => sec.classList.add('hidden'));
  const active = document.getElementById(id);
  if (active) active.classList.remove('hidden');
}

/** Retrieve configuration items from the backend and display them. */
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

/** Create or update a configuration value. */
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
  }).then(() => {
    document.getElementById('configKey').value = '';
    document.getElementById('configValue').value = '';
    loadConfig();
  });
}

/** Fetch all teams and update the teams table and user creation form. */
function loadTeams() {
  fetch(`${API_BASE_URL}/api/teams`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(list => {
      teamsCache = list;
      renderTeamTable();
      populateTeamSelect();
    });
}

/** Fill the team select element used when creating users. */
function populateTeamSelect() {
  const select = document.getElementById('newUserTeam');
  select.innerHTML = '';
  teamsCache.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t._id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });
}

/** Render the team table with a manage button for each row. */
function renderTeamTable() {
  const table = document.getElementById('teamTable');
  table.innerHTML = '';
  const header = document.createElement('tr');
  header.innerHTML = '<th>Name</th><th>Domains</th><th>Seats</th><th></th>';
  table.appendChild(header);
  teamsCache.forEach(t => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
      <td>${t.domains.map(escapeHtml).join(', ')}</td>
      <td>${escapeHtml(t.seats)}</td>
      <td><button onclick="showTeamDetails('${t._id}')">Manage</button></td>`;
    table.appendChild(row);
  });
}

/** Create a new team from form values. */
function createTeam(e) {
  e.preventDefault();
  const name = document.getElementById('teamName').value;
  const domains = document.getElementById('teamDomains').value
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);
  const seats = parseInt(document.getElementById('teamSeats').value || '0', 10);
  fetch(`${API_BASE_URL}/api/teams`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ name, domains, seats })
  }).then(() => {
    document.getElementById('teamName').value = '';
    document.getElementById('teamDomains').value = '';
    document.getElementById('teamSeats').value = '5';
    loadTeams();
  });
}

/** Show editable details for a team including member list. */
function showTeamDetails(id) {
  const team = teamsCache.find(t => t._id === id);
  if (!team) return;
  fetch(`${API_BASE_URL}/api/teams/${id}/members`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(members => {
      const container = document.getElementById('teamDetails');
      container.classList.remove('hidden');
      container.innerHTML = `
        <h3>${escapeHtml(team.name)}</h3>
        <label>Seats <input id="editSeats" type="number" value="${escapeHtml(team.seats)}"></label>
        <button onclick="saveTeam('${id}')">Save</button>
        <h4>Members</h4>
        <ul>${members.map(m => `<li>${escapeHtml(m.username)} (${escapeHtml(m.role)})</li>`).join('')}</ul>`;
    });
}

/** Persist updated seat count for the given team. */
function saveTeam(id) {
  const seats = parseInt(document.getElementById('editSeats').value || '0', 10);
  fetch(`${API_BASE_URL}/api/teams/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ seats })
  }).then(() => loadTeams());
}

/** Create a new user via the signup endpoint and refresh lists. */
function createUser(e) {
  e.preventDefault();
  const username = document.getElementById('newUsername').value;
  const password = document.getElementById('newPassword').value;
  const teamId = document.getElementById('newUserTeam').value;
  fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, teamId })
  }).then(() => {
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    loadTeams();
    loadAllUsers();
  });
}

/** Load members from all teams and render them grouped by team. */
function loadAllUsers() {
  const list = document.getElementById('userList');
  list.innerHTML = '';
  const promises = teamsCache.map(t =>
    fetch(`${API_BASE_URL}/api/teams/${t._id}/members`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    }).then(r => r.json().then(m => ({ team: t.name, members: m })))
  );
  Promise.all(promises).then(all => {
    all.forEach(entry => {
      const div = document.createElement('div');
      div.innerHTML = `<h3>${escapeHtml(entry.team)}</h3><ul>${entry.members
        .map(m => `<li>${escapeHtml(m.username)} (${escapeHtml(m.role)})</li>`)
        .join('')}</ul>`;
      list.appendChild(div);
    });
  });
}

