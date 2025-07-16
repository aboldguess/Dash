import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

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

// Health check endpoint
app.get('/', (_, res) => {
  res.send('Dash API is running');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
