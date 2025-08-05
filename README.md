# Dash

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

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Running locally

1. Install dependencies and start the server (which now also serves the
   frontend):
   ```bash
   cd backend
   npm install
   # optional: verify database connection
   npm run db:init
   npm run build
   npm start
   ```

### Windows quick start
Run the PowerShell script to install dependencies, initialise the database, build and launch the backend on a chosen port:
```powershell
powershell -ExecutionPolicy Bypass -File .\start-windows.ps1 -port 4000
```
The `-port` argument is optional and defaults to `3000`.

  Browse to `http://localhost:3000` and the web interface should load
  without a separate static file server.
  The frontend now uses `window.location.origin` for API requests so it
  automatically points to the host that served the page. If your backend
  runs on a different host or port, update `API_BASE_URL` in
  `frontend/js/app.js` accordingly.

### Raspberry Pi quick start
The `dash-start-rpi.sh` script sets up and runs the backend on Raspberry Pi or other Linux systems. It installs Node.js 18 if required, installs project dependencies, initialises the database, builds the code and launches the server. If a local MongoDB instance is not detected the script will attempt to start one using Docker for convenience.

All output from the script is recorded in `dash_rpi_start.log` so problems can be reviewed after the fact. When the backend cannot reach MongoDB it now prints the connection URI it attempted so configuration issues are easier to spot.

```bash
chmod +x ./dash-start-rpi.sh
./dash-start-rpi.sh --port 4000        # development mode on port 4000
./dash-start-rpi.sh --port 4000 --prod # production mode on port 4000
```

Omit `--prod` to run in development mode with automatic reloading. The `--port` argument defaults to `3000`.

### Docker

To run the backend via Docker:

```bash
docker build -t dash-backend ./backend
docker run -p 3000:3000 dash-backend
```

The frontend can be hosted separately or served by any static web server.

## Database Setup

The backend now requires access to a MongoDB instance. Copy the provided
`.env.example` to `.env` inside `backend/`. The Raspberry Pi start script will
do this automatically if the file is missing. Update the `DB_URI` value if your
database runs elsewhere. Alternatively you can export the variable in your shell:

```bash
export DB_URI="mongodb://localhost:27017/dash"
```

Running `npm run db:init` will attempt to connect using this value. If the
connection succeeds, the server can be started normally with `npm start`.

The sign-up page will create a new team when a name is provided. Payment is
currently simulated server-side so the flow can be tested without real billing
details. Replace `processPayment` in `backend/src/payments.ts` with an actual
gateway integration when ready.

## Setup

1. Copy `backend/.env.example` to `backend/.env` and edit the `DB_URI` to point
   to your MongoDB instance. Optionally set `JWT_SECRET` for token signing.
2. Install dependencies and build the backend:

   ```bash
   cd backend
   npm install
   npm run build
   npm start
   ```

## Admin Configuration

Administrators can manage runtime settings via the new `/api/admin/config`
endpoints:

- `POST /api/admin/config` &ndash; create or update a configuration value
- `GET /api/admin/config` &ndash; list all stored configuration values

These endpoints require an authenticated user with the `admin` role.

The repository seeds a default administrator account for demo purposes:

- **Username:** `admin`
- **Password:** `Admin12345`

After logging in with this account, an admin dashboard is available at
`/admin.html`. The dashboard lets admins manage configuration values, create
and edit teams including seat counts and view all registered users. It remains
a lightweight interface but now exposes enough controls to administer the
demo data without resorting to API calls.
