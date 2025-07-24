/**
 * Minimal social features allowing users to follow each other and
 * publish short text updates. This script relies on helpers in app.js
 * for authentication and API base URL configuration.
 */

let following = []; // usernames the current user follows

function initSocial() {
  // Ensure the user is logged in and populate the admin link
  checkAuth();
  loadSocialUsers();
  loadPosts();
}

/** Fetch all users and the current follow list to render the sidebar. */
function loadSocialUsers() {
  Promise.all([
    fetch(`${API_BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/social/follows`, {
      headers: { Authorization: `Bearer ${currentUser.token}` }
    }).then(r => r.json())
  ]).then(([users, follows]) => {
    following = follows;
    const list = document.getElementById('followList');
    list.innerHTML = '';
    users.forEach(u => {
      if (u.username === currentUser.username) return; // skip self
      const li = document.createElement('li');
      const btn = document.createElement('button');
      const isFollowing = following.includes(u.username);
      btn.textContent = isFollowing ? 'Unfollow' : 'Follow';
      btn.onclick = () => toggleFollow(u.username, isFollowing);
      li.textContent = u.username + ' ';
      li.appendChild(btn);
      list.appendChild(li);
    });
  });
}

/** Follow or unfollow the given user then refresh the sidebar. */
function toggleFollow(user, currentlyFollowing) {
  const method = currentlyFollowing ? 'DELETE' : 'POST';
  fetch(`${API_BASE_URL}/api/social/follow/${user}`, {
    method,
    headers: { Authorization: `Bearer ${currentUser.token}` }
  }).then(() => loadSocialUsers());
}

/** Retrieve all posts and display them newest first. */
function loadPosts() {
  fetch(`${API_BASE_URL}/api/social/posts`, {
    headers: { Authorization: `Bearer ${currentUser.token}` }
  })
    .then(r => r.json())
    .then(posts => {
      const feed = document.getElementById('postFeed');
      feed.innerHTML = '';
      posts.forEach(p => {
        const div = document.createElement('div');
        div.className = 'post';
        const time = new Date(p.createdAt).toLocaleString();
        div.innerHTML = `<strong>${p.author}</strong> <span class="time">${time}</span><p>${p.content}</p>`;
        feed.appendChild(div);
      });
    });
}

/** Submit a new post then reload the feed. */
function createPost(e) {
  e.preventDefault();
  const content = document.getElementById('postContent').value;
  if (!content) return;
  fetch(`${API_BASE_URL}/api/social/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser.token}`
    },
    body: JSON.stringify({ content })
  }).then(() => {
    document.getElementById('postContent').value = '';
    loadPosts();
  });
}
