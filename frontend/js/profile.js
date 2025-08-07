/**
 * Profile page helpers
 * --------------------
 * Loads and saves the current user's profile details. Tokens are read from
 * sessionStorage for shorter-lived exposure in the browser.
 */
const API_BASE_URL = window.location.origin;

function loadProfile() {
  const token = sessionStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  fetch(`${API_BASE_URL}/api/profile/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(p => {
      if (!p) return;
      document.getElementById('profileCareer').value = p.career || '';
      document.getElementById('profileEducation').value = p.education || '';
      document.getElementById('profileStatement').value = p.statement || '';
      if (p.photo) {
        document.getElementById('profileImage').src = p.photo;
      }
    });
}

function saveProfile(e) {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  fetch(`${API_BASE_URL}/api/profile/me`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      career: document.getElementById('profileCareer').value,
      education: document.getElementById('profileEducation').value,
      statement: document.getElementById('profileStatement').value
    })
  }).then(loadProfile);
}

function uploadPhoto() {
  const token = sessionStorage.getItem('token');
  const file = document.getElementById('profilePhoto').files[0];
  if (!file) return;
  const form = new FormData();
  form.append('photo', file);
  fetch(`${API_BASE_URL}/api/profile/me/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  }).then(loadProfile);
}
