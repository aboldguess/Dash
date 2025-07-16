# Dash

Dash is an example enterprise web platform demonstrating several features:

- Instant messaging
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

1. Install dependencies for the backend:
   ```bash
   cd backend
   npm install
   npm run build
   npm start
   ```
2. Serve the frontend using any static file server:
   ```bash
   # If you run this from the repository root use the path to the
   # `frontend` folder. When inside the `frontend` directory, simply run
   # `npx serve` or `npx serve .` so the correct directory is served.
   npx serve frontend
   ```
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
