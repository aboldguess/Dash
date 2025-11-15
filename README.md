# Dash

Dash is a full-stack enterprise demo platform showcasing secure messaging, CRM, project tracking, and workforce management in a single responsive web experience. The backend is an Express + TypeScript API backed by MongoDB, while the frontend is a static site served by any modern web server.

---

## 0. Prerequisites (do this once per machine)

| Requirement | Windows guidance | Linux / Raspberry Pi guidance |
| --- | --- | --- |
| **Git** | Install with [Git for Windows](https://git-scm.com/download/win) or `winget install Git.Git`. | Install via your package manager, e.g. `sudo apt install git`. |
| **Node.js 18+ & npm** | Use [nvm for Windows](https://github.com/coreybutler/nvm-windows) so each project has an isolated runtime:<br>`nvm install 20.11.1`<br>`nvm use 20.11.1` | Install [nvm](https://github.com/nvm-sh/nvm):<br>`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash`<br>`source ~/.nvm/nvm.sh`<br>`nvm install 20.11.1` |
| **MongoDB 6+** | Install [MongoDB Community Server](https://www.mongodb.com/try/download/community) or use Docker Desktop (`docker run -d --name mongo -p 27017:27017 mongo:6`). | Install packages (`sudo apt install mongodb`) **or** run the same Docker command as Windows. |
| **Docker (optional)** | Recommended for running MongoDB quickly: `winget install Docker.DockerDesktop`. | Install using the convenience script:<br>`curl -fsSL https://get.docker.com -o get-docker.sh`<br>`sudo sh get-docker.sh`<br>`sudo usermod -aG docker $USER` |

> ℹ️ Treat nvm as your "virtual environment" for Node projects: activate your Node version with `nvm use 20.11.1` before working on Dash.

After installation, verify versions:

- Windows PowerShell:
  ```powershell
  node -v
  npm -v
  mongod --version
  ```
- Linux / Raspberry Pi:
  ```bash
  node -v
  npm -v
  mongod --version
  ```

If `mongod` is reported as "not recognized" (Windows) or "command not found"
(*nix), install MongoDB Community Server from
https://www.mongodb.com/try/download/community or use your package manager
(`sudo apt install mongodb` on Debian/Ubuntu). Alternatively, start a container
with `docker run -d --name mongo -p 27017:27017 mongo:6` to provision a local
database instantly.

---

## 1. One-time project setup

1. **Clone the repository.**
   - Windows PowerShell:
     ```powershell
     git clone https://github.com/your-org/Dash.git
     cd Dash
     ```
   - Linux / Raspberry Pi:
     ```bash
     git clone https://github.com/your-org/Dash.git
     cd Dash
     ```

2. **Prepare configuration and install dependencies using the unified helper script.** This creates `backend/.env`, generates a secure `JWT_SECRET`, installs Node packages, and optionally updates your MongoDB URI.
   - Windows PowerShell:
     ```powershell
     node scripts/manage-dash.mjs setup --db-uri "mongodb://localhost:27017/dash"
     ```
   - Linux / Raspberry Pi:
     ```bash
     node scripts/manage-dash.mjs setup --db-uri "mongodb://localhost:27017/dash"
     ```

   > Working inside `backend/`? Run the same command without changing folders:
   > `node scripts/manage-dash.mjs ...`. A proxy script forwards to the root
   > helper automatically.

   Advanced flags:
   - `--skip-install` if you have already run `npm install`.
   - `--init-db` to execute `npm run db:init` immediately after dependencies install (MongoDB must be running).

The script logs every action to `./logs/manage-dash.log`, making debugging straightforward if something fails.

---

## 2. Launching the platform (repeat whenever you want to run Dash)

> Ensure your MongoDB instance is running before starting the app. For Docker users: `docker start mongo`.

### Development mode (auto-reload, verbose logging)

- Windows PowerShell:
  ```powershell
  node scripts/manage-dash.mjs start --mode dev --port 3000
  ```
- Linux / Raspberry Pi:
  ```bash
  node scripts/manage-dash.mjs start --mode dev --port 3000
  ```

The API listens on the requested port (defaults to `3000` if omitted) and reloads automatically when backend TypeScript files change.

### Production simulation (build + run compiled JavaScript)

- Windows PowerShell:
  ```powershell
  node scripts/manage-dash.mjs start --mode prod --port 4000
  ```
- Linux / Raspberry Pi:
  ```bash
  node scripts/manage-dash.mjs start --mode prod --port 4000
  ```

This command performs a TypeScript build before launching the compiled server with `NODE_ENV=production`.

### Optional: seed demo data after launch

If you want to seed demo data (requires MongoDB online), append `--init-db`:

```bash
node scripts/manage-dash.mjs start --mode dev --init-db
```

> The helper script respects environment variables. For example, setting `CORS_ORIGIN="https://dash.example.com"` before running ensures the API only accepts requests from that host.

---

## 3. Serving the frontend

The frontend files under `frontend/` are static. During development you can open `frontend/index.html` directly or serve them with any static server (e.g. `npx serve frontend`). In production deployments place the files behind a CDN or web server of your choice (NGINX, S3 + CloudFront, etc.). The frontend automatically targets the origin it was loaded from, so host the API and static files on the same domain or configure `API_BASE_URL` in `frontend/js/app.js`.

---

## 4. Helpful npm scripts

| Command | What it does |
| --- | --- |
| `npm run dash:setup` | Shortcut for `node scripts/manage-dash.mjs setup`. |
| `npm run dash:start` | Shortcut for `node scripts/manage-dash.mjs start`. |
| `npm run dev --prefix backend` | Runs the backend in watch mode without the helper script. |
| `npm run build --prefix backend` | Compiles TypeScript to `backend/dist`. |
| `npm run db:init --prefix backend` | Seeds MongoDB with demo data (ensure the database is reachable). |
| `npm test --prefix backend` | Executes Jest tests. |

---

## 5. Default admin account

For demo access the backend seeds an administrator profile:

- **Username:** `admin`
- **Password:** `Admin12345`

After signing in, navigate to `/admin.html` to manage configuration, teams, and users.

---

## 6. Troubleshooting & diagnostics

- Review `./logs/manage-dash.log` for a timestamped history of every setup/start action.
- If the helper script reports `Command failed`, scroll up in the terminal for the failing step and re-run with `--skip-install` to avoid repeating earlier success.
- Connection errors will echo the MongoDB URI Dash attempted. Confirm the URI in `backend/.env` and verify MongoDB is running.
- Rate limiting is configurable through `GENERAL_RATE_LIMIT_*` and `AUTH_RATE_LIMIT_*` variables in `backend/.env`. Restart the server after changes.
- Press `Ctrl+C` to stop the running server. On Windows, you might need to press it twice to fully terminate nodemon.

---

## 7. Architecture quick reference

- **Backend:** `backend/src/index.ts` exposes the Express server, Socket.IO integration, and security middleware.
- **Frontend:** static HTML/CSS/JS in `frontend/` communicates with the backend via REST and WebSocket endpoints.
- **Scripts:** `scripts/manage-dash.mjs` centralises setup/start automation for all platforms.

For deeper code documentation, consult the inline comments at the top of each source file; every file contains a mini README explaining its purpose and layout.
