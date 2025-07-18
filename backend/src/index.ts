import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';

import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import crmRoutes from './routes/crm';
import projectRoutes from './routes/projects';
import programRoutes from './routes/programs';
import timesheetRoutes from './routes/timesheets';
import leaveRoutes from './routes/leaves';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware configuration
app.use(cors());
app.use(bodyParser.json());

// Route bindings for various features
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/leaves', leaveRoutes);

// Serve static frontend files. The path is resolved relative to the compiled
// JavaScript location so it works when running from the 'dist' directory.
const frontendDir = path.resolve(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));

// Health check endpoint for the API
app.get('/api', (_, res) => {
  res.send('Dash API is running');
});

// All remaining requests should be served the frontend's index.html so that
// direct navigation to routes works without returning a 404.
// Use a generic handler so all unmatched routes return the same HTML file.
app.use((_, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
