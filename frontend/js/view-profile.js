/**
 * View profile page logic
 * -----------------------
 * Fetches a user's profile based on the `id` query parameter and displays the
 * fields permitted by the profile's visibility settings. If `id` is omitted or
 * set to `me` the current user's details are shown. Tokens are included if
 * available to access platform or team restricted data.
*/
const API_BASE_URL = window.location.origin;

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function loadProfile() {
  const id = getQueryId() || 'me';
  const token = sessionStorage.getItem('token');
  const details = document.getElementById('profileDetails');
  if (id === 'me' && !token) {
    details.textContent = 'No user specified.';
    return;
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const url = id === 'me' ? `${API_BASE_URL}/api/profile/me` : `${API_BASE_URL}/api/profile/${id}`;
  fetch(url, { headers })
    .then(r => r.json())
    .then(p => {
      if (!p || p.message) {
        details.textContent = 'Profile not available.';
        return;
      }
      details.textContent = '';
      if (p.photo) {
        fetch(`${API_BASE_URL}${p.photo}`, { headers })
          .then(r => (r.ok ? r.blob() : Promise.reject('Failed to load photo')))
          .then(b => {
            document.getElementById('profileImage').src = URL.createObjectURL(b);
          })
          .catch(err => console.error(err));
      }
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
