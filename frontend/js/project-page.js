/**
 * Mini readme: Project page initialiser
 * ------------------------------------
 * Reads the `id` query parameter to load an existing project for editing
 * using helper functions from app.js. When no `id` is supplied the project
 * form is reset to create a new project. This file attaches no event
 * listeners itself; app.js handles form submissions and API requests.
 */

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) {
    editProject(id);
  } else {
    resetProjectForm();
  }
});
