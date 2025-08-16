/**
 * Mini readme: My Details client logic
 * -----------------------------------
 * Dynamically renders and updates the current user's profile. The script
 * loads shared authentication helpers from app.js, fetches profile data, and
 * exposes modular functions for editing details and uploading a profile photo.
 *
 * Structure:
 *  - loadApp(): injects app.js so utilities like checkAuth are available.
 *  - loadProfile(): retrieves /api/profile/me and displays name, email, avatar.
 *  - renderProfile(): shows read-only fields plus edit and upload controls.
 *  - renderEditForm(): presents editable inputs for career, education and
 *    personal statement.
 *  - saveProfile(): sends updated fields to the server and reports status.
 *  - uploadPhoto(): uploads a new avatar with progress feedback.
 *
 * Security:
 *  - All requests include the bearer token obtained by checkAuth().
 *  - DOM writes use textContent and trusted URLs to avoid XSS.
 */

/** Ensure shared app.js is loaded before using its utilities. */
function loadApp() {
  return new Promise((resolve, reject) => {
    if (window.checkAuth) return resolve();
    const script = document.createElement('script');
    script.src = 'js/app.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load app.js'));
    document.head.appendChild(script);
  });
}

// Bootstrap once DOM is ready
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadApp();
    // Verify authentication and populate navbar avatar
    if (typeof checkAuth === 'function') {
      checkAuth();
      loadProfile();
    } else {
      console.error('checkAuth unavailable');
    }
  } catch (err) {
    console.error('Initialisation failed', err);
  }
});

/** Fetch current user's profile and render it. */
async function loadProfile() {
  const root = document.getElementById('detailsRoot');
  root.textContent = 'Loading profile...';
  try {
    const res = await fetch(`${API_BASE_URL}/api/profile/me`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    });
    if (!res.ok) throw new Error('Profile fetch failed');
    const profile = await res.json();
    // If the user has not created a profile yet the API returns null. Use
    // an empty object so the renderer can display editable placeholders
    // instead of throwing an error.
    renderProfile(profile || {});
  } catch (err) {
    console.error('loadProfile error', err);
    root.textContent = 'Could not load profile.';
  }
}

/** Display read-only profile information and editing/upload controls. */
function renderProfile(profile = {}) {
  const root = document.getElementById('detailsRoot');
  root.innerHTML = '';

  // Avatar element with fallback to gravatar
  const avatar = document.createElement('img');
  avatar.id = 'profileAvatar';
  avatar.className = 'avatar';
  avatar.alt = 'profile photo';

  if (profile.photo) {
    fetch(`${API_BASE_URL}${profile.photo}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    })
      .then(r => (r.ok ? r.blob() : Promise.reject('avatar fetch failed')))
      .then(b => {
        const url = URL.createObjectURL(b);
        avatar.src = url;
        const nav = document.getElementById('navAvatar');
        if (nav) nav.src = url;
        currentUser.avatarUrl = url;
      })
      .catch(err => {
        console.error(err);
        avatar.src = currentUser.avatarUrl;
      });
  } else {
    avatar.src = currentUser.avatarUrl;
  }

  const nameEl = document.createElement('p');
  nameEl.textContent = `Name: ${currentUser.username}`;

  const emailEl = document.createElement('p');
  emailEl.textContent = `Email: ${profile.email || 'Not provided'}`;

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit details';
  editBtn.addEventListener('click', () => renderEditForm(profile));

  // Photo upload controls
  const photoLabel = document.createElement('p');
  photoLabel.textContent = 'Update profile photo:';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload Photo';

  const uploadStatus = document.createElement('span');
  uploadStatus.id = 'photoUploadStatus';

  uploadBtn.addEventListener('click', () =>
    uploadPhoto(fileInput.files[0], uploadStatus, avatar)
  );

  root.append(
    avatar,
    nameEl,
    emailEl,
    editBtn,
    photoLabel,
    fileInput,
    uploadBtn,
    uploadStatus
  );
}

/** Show editable inputs for career, education and statement. */
function renderEditForm(profile) {
  const root = document.getElementById('detailsRoot');
  root.innerHTML = '';

  const career = document.createElement('input');
  career.id = 'careerInput';
  career.placeholder = 'Career history';
  career.value = profile.career || '';

  const education = document.createElement('input');
  education.id = 'educationInput';
  education.placeholder = 'Education';
  education.value = profile.education || '';

  const statement = document.createElement('textarea');
  statement.id = 'statementInput';
  statement.placeholder = 'Personal statement';
  statement.value = profile.statement || '';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';

  const status = document.createElement('span');
  status.id = 'profileSaveStatus';

  saveBtn.addEventListener('click', () =>
    saveProfile(
      {
        career: career.value,
        education: education.value,
        statement: statement.value
      },
      status
    )
  );

  root.append(career, education, statement, saveBtn, status);
}

/** Persist profile changes to the server. */
async function saveProfile(data, statusEl) {
  statusEl.textContent = 'Saving...';
  try {
    const res = await fetch(`${API_BASE_URL}/api/profile/me`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.token}`
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Save failed');
    statusEl.textContent = 'Saved';
    const updated = await res.json();
    renderProfile(updated);
  } catch (err) {
    console.error('saveProfile error', err);
    statusEl.textContent = 'Save failed';
  }
}

/** Upload a new profile photo with progress feedback. */
function uploadPhoto(file, statusEl, avatarEl) {
  if (!file) {
    statusEl.textContent = 'Please choose a photo first.';
    return;
  }

  const formData = new FormData();
  formData.append('photo', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API_BASE_URL}/api/profile/me/photo`);
  xhr.setRequestHeader('Authorization', `Bearer ${currentUser.token}`);

  xhr.upload.onprogress = e => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      statusEl.textContent = `Uploading ${pct}%`;
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      statusEl.textContent = 'Upload complete';
      try {
        const profile = JSON.parse(xhr.responseText);
        if (profile.photo) {
          fetch(`${API_BASE_URL}${profile.photo}`, {
            headers: { Authorization: `Bearer ${currentUser.token}` }
          })
            .then(r => (r.ok ? r.blob() : Promise.reject('avatar fetch failed')))
            .then(b => {
              const url = URL.createObjectURL(b);
              avatarEl.src = url;
              const nav = document.getElementById('navAvatar');
              if (nav) nav.src = url;
              currentUser.avatarUrl = url;
              sessionStorage.setItem('avatarPath', profile.photo);
            })
            .catch(err => console.error(err));
        }
      } catch (err) {
        console.error('Failed to parse upload response', err);
      }
    } else {
      statusEl.textContent = 'Upload failed';
      console.error('uploadPhoto error', xhr.statusText);
    }
  };

  xhr.onerror = () => {
    statusEl.textContent = 'Upload failed';
    console.error('uploadPhoto network error');
  };

  xhr.send(formData);
}
