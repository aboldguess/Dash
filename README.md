# Dash

## Overview
Dash is an example enterprise web platform demonstrating several features:

- Instant messaging with multiple channels, presence indicators and message editing
- Basic CRM with contact management, company/notes fields and project/program tracking
- Full project management with work packages and tasks
- Timesheets and leave requests
- Team management with seat limits and email invitations
- Simple sign-up flow that creates teams with dummy payment processing
- Role-based authentication with admin, team admin and user levels
- Browser-based UI designed to be responsive and mobile friendly with a consistent card layout
- Dockerised backend for easy deployment

## Prerequisites
Dash requires Node.js 18+, npm, Docker and access to a MongoDB database.

### Install Node.js
#### Windows
1. Install [nvm for Windows](https://github.com/coreybutler/nvm-windows) or download the LTS installer from [nodejs.org](https://nodejs.org/).
2. Use nvm to install Node.js 18:
   ```powershell
   nvm install 18
   nvm use 18
   ```
3. Verify installation:
   ```powershell
   node -v
   npm -v
   ```

#### Linux/Raspberry Pi
1. Install nvm and Node.js 18:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install 18
   ```
2. Confirm with:
   ```bash
   node -v
   npm -v
   ```

### Install Docker
#### Windows
1. Install Docker Desktop from <https://www.docker.com/products/docker-desktop/> or via `winget`:
   ```powershell
   winget install Docker.DockerDesktop
   ```
2. Start Docker Desktop and ensure it works:
   ```powershell
   docker --version
   ```

#### Linux/Raspberry Pi
1. Run the convenience script:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```
2. Log out and back in, then verify:
   ```bash
   docker --version
   ```

### Install MongoDB
#### Windows
1. Install MongoDB Community Server from <https://www.mongodb.com/try/download/community> or with `winget`:
   ```powershell
   winget install MongoDB.MongoDBServer
   ```
2. Start the MongoDB service and check:
   ```powershell
   mongod --version
   ```

#### Linux/Raspberry Pi
1. On Debian/Ubuntu systems:
   ```bash
   sudo apt update
   sudo apt install -y mongodb
   sudo systemctl enable --now mongodb
   ```
   If packages are unavailable or you prefer Docker:
   ```bash
   docker run -d --name mongo -p 27017:27017 -v mongo-data:/data/db mongo:6
   ```
2. Verify with:
   ```bash
   mongod --version   # or: docker ps
   ```

## Project Setup
1. Clone this repository.
2. Copy `backend/.env.example` to `backend/.env` and set `DB_URI` to your MongoDB connection string. Optionally set `JWT_SECRET` for token signing.
3. Install dependencies from the repository root (this installs the backend automatically):
   ```bash
   npm install
   ```
   You can still install directly in the backend directory if preferred:
   ```bash
   cd backend
   npm install
   ```

## Running the App

### Quick Start Scripts
#### Windows
Run the PowerShell script to install dependencies, initialise the database, attempt to launch a local MongoDB instance via Docker, build and start the backend:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-windows.ps1 -port 4000
```

Options:

- `-port` — port to run the server (default `3000`)
- `-prod` — run in production mode
- `-dbUri` — specify an external MongoDB URI

All output is logged to `dash_windows_start.log`.

#### Raspberry Pi / Linux
The `dash-start-rpi.sh` script installs Node.js 18 if required, installs dependencies, initialises the database, builds the code and launches the server. It also tries to start MongoDB in Docker if no local instance is detected.

```bash
chmod +x ./dash-start-rpi.sh
./dash-start-rpi.sh --port 4000        # development mode
./dash-start-rpi.sh --port 4000 --prod # production mode
```

Logs are written to `dash_rpi_start.log`.

### Manual Run
1. Ensure `DB_URI` is set (either in `backend/.env` or exported in the shell).
2. Initialise the database:
   ```bash
   cd backend
   npm run db:init
   ```
3. Build and start the server:
   ```bash
   npm run build
   npm start
   ```

Browse to `http://localhost:3000`. The frontend uses `window.location.origin` for API requests, so it points to the host that served the page. If your backend runs elsewhere, update `API_BASE_URL` in `frontend/js/app.js`.

### Docker Container
To build and run the backend in Docker:

```bash
docker build -t dash-backend ./backend
docker run -p 3000:3000 -e DB_URI=mongodb://localhost:27017/dash dash-backend
```

Serve the frontend with any static web server.

## Admin Configuration
Administrators can manage runtime settings via the `/api/admin/config` endpoints:

- `POST /api/admin/config` – create or update a configuration value
- `GET /api/admin/config` – list all stored configuration values

A default administrator account is seeded for demo purposes:

- **Username:** `admin`
- **Password:** `Admin12345`

After logging in, visit `/admin.html` to access the dashboard for managing configuration values, teams and users.

## Troubleshooting
- If a start script fails, review `dash_windows_start.log` or `dash_rpi_start.log` for details.
- When the backend cannot reach MongoDB it prints the connection URI it attempted, making configuration issues easier to spot.
