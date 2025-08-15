# KeeperOfTime Integration

Mini readme: documents how the `KeeperOfTime/` submodule should host reusable profile assets and how existing Dash resources relate.

## Shared assets
- **Styles:** `frontend/css/style.css` defines the avatar button and profile dropdown layout used across pages.
- **Utilities:** `frontend/js/app.js` provides helpers such as `toggleProfileMenu` and authentication checks (`checkAuth`).

## Using the submodule
The `KeeperOfTime/` directory is tracked as a Git submodule. Run:
```bash
git submodule update --init
```
to populate it with the shared library. Any shared components or styles can then be added there, allowing pages like `frontend/my-details.html` to reuse them via relative imports instead of duplicating code.

## Reusable elements
Contributors should reference the above assets when building profile-related features to ensure consistent styling and behaviour. Document any new utilities directly within the submodule so future projects can import them easily.
