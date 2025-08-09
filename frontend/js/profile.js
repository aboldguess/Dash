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
      // Set visibility radio buttons based on stored preferences
      const setVis = (name, value) => {
        const radio = document.querySelector(`input[name="${name}"][value="${value || 'platform'}"]`);
        if (radio) radio.checked = true;
      };
      setVis('careerVisibility', p.careerVisibility);
      setVis('educationVisibility', p.educationVisibility);
      setVis('statementVisibility', p.statementVisibility);
      setVis('photoVisibility', p.photoVisibility);
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
      statement: document.getElementById('profileStatement').value,
      careerVisibility: document.querySelector('input[name="careerVisibility"]:checked').value,
      educationVisibility: document.querySelector('input[name="educationVisibility"]:checked').value,
      statementVisibility: document.querySelector('input[name="statementVisibility"]:checked').value,
      photoVisibility: document.querySelector('input[name="photoVisibility"]:checked').value
    })
  }).then(loadProfile);
}

function uploadPhoto() {
  const token = sessionStorage.getItem('token');
  const file = document.getElementById('profilePhoto').files[0];
  if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    form.append('visibility', document.querySelector('input[name="photoVisibility"]:checked').value);
  fetch(`${API_BASE_URL}/api/profile/me/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  }).then(loadProfile);
}

// Initialise profile page once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  const form = document.getElementById('profileForm');
  if (form) form.addEventListener('submit', saveProfile);
  const uploadBtn = document.getElementById('uploadPhotoBtn');
  if (uploadBtn) uploadBtn.addEventListener('click', uploadPhoto);
});
