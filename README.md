# Dash

Dash is an example enterprise web platform demonstrating several features:

- Instant messaging with multiple channels and message editing
- Basic CRM and project/program management
- Timesheets and leave requests
- Role-based authentication with admin, team admin and user levels
- Browser-based UI designed to be responsive and mobile friendly
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
   Browse to `http://localhost:3000` and the web interface should load
   without a separate static file server.
   The JavaScript code assumes the API is available on `http://localhost:3000`.
   If your backend runs elsewhere, update `API_BASE_URL` in
   `frontend/js/app.js` accordingly so requests reach the correct server.

### Docker

To run the backend via Docker:

```bash
docker build -t dash-backend ./backend
docker run -p 3000:3000 dash-backend
```

The frontend can be hosted separately or served by any static web server.

## Database Setup

The backend now requires access to a MongoDB instance. Copy the provided
`.env.example` to `.env` inside `backend/` and update the `DB_URI` value if your
database runs elsewhere. Alternatively you can export the variable in your
shell:

```bash
export DB_URI="mongodb://localhost:27017/dash"
```

Running `npm run db:init` will attempt to connect using this value. If the
connection succeeds, the server can be started normally with `npm start`.
