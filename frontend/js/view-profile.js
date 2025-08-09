/**
 * View profile page logic
 * -----------------------
 * Fetches another user's profile based on the `id` query parameter and displays
 * the fields permitted by the profile's visibility settings. Tokens are
 * included if available to access platform or team restricted data.
 */
const API_BASE_URL = window.location.origin;

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function loadProfile() {
  const id = getQueryId();
  if (!id) {
    document.getElementById('profileDetails').innerText = 'No user specified.';
    return;
  }
  const token = sessionStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  fetch(`${API_BASE_URL}/api/profile/${id}`, { headers })
    .then(r => r.json())
    .then(p => {
      const details = document.getElementById('profileDetails');
      if (!p || p.message) {
        details.textContent = 'Profile not available.';
        return;
      }
      if (p.photo) document.getElementById('profileImage').src = p.photo;
      details.textContent = '';
      const addField = (label, value) => {
        const pEl = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = label;
        pEl.appendChild(strong);
        pEl.append(` ${value}`);
        details.appendChild(pEl);
      };
      if (p.career) addField('Career:', p.career);
      if (p.education) addField('Education:', p.education);
      if (p.statement) addField('Statement:', p.statement);
    });
}

document.addEventListener('DOMContentLoaded', loadProfile);
