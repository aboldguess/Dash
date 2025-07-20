import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';

import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import channelRoutes from './routes/channels';
import crmRoutes from './routes/crm';
import projectRoutes from './routes/projects';
import programRoutes from './routes/programs';
import timesheetRoutes from './routes/timesheets';
import leaveRoutes from './routes/leaves';
import userRoutes from './routes/users';
import { connectDB } from './db';
import { Message } from './models/message';
import { DirectMessage } from './models/directMessage';
import { seedUsers } from './seedUsers';
import { onlineUsers } from './presence';

const app = express();
const PORT = process.env.PORT || 3000;

// Create the HTTP server separately so Socket.IO can share it
const server = http.createServer(app);

// Attach Socket.IO to the HTTP server with permissive CORS for demos
const io = new Server(server, {
  cors: { origin: '*' }
});
// Make the Socket.IO instance accessible to route handlers via app.get('io')
app.set('io', io);

// Listen for new WebSocket connections
io.on('connection', socket => {
  console.log('Client connected');

  // Clients join rooms representing channels so messages can be scoped
  socket.on('join', channel => {
    socket.join(channel);
  });

  // Register a user-specific room for direct messages and track presence
  socket.on('register', username => {
    // Store the username on the socket for cleanup later
    socket.data.username = username;
    socket.join(username);
    // Remember this user is currently online
    onlineUsers.add(username);
    // Notify all clients that a user has come online
    io.emit('userOnline', username);
  });

  // Remove the user from the presence list when they disconnect
  socket.on('disconnect', () => {
    const username = socket.data.username;
    if (username) {
      onlineUsers.delete(username);
      io.emit('userOffline', username);
    }
  });

  // Handle incoming chat messages scoped to a channel
  socket.on('messages', async data => {
    const { user, text, channel } = data;

    try {
      // Persist the message then broadcast it only to the channel members
      const msg = new Message({ user, text, channel });
      await msg.save();
      // Emit only to clients in the same channel
      io.to(channel).emit('messages', msg);
    } catch (err) {
      console.error('Failed to process message', err);
    }
  });

  // Handle direct messages between individual users
  socket.on('directMessage', async data => {
    const { from, to, text } = data;

    try {
      const dm = new DirectMessage({ from, to, text });
      await dm.save();
      // Emit the message to both participants
      io.to(from).to(to).emit('directMessage', dm);
    } catch (err) {
      console.error('Failed to process direct message', err);
    }
  });
});

// Middleware configuration
app.use(cors());
app.use(bodyParser.json());

// Route bindings for various features
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/users', userRoutes);

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

// Connect to MongoDB then start the HTTP server
connectDB()
  .then(async () => {
    // Populate demo accounts before accepting connections
    await seedUsers();

    // Start the combined HTTP/WebSocket server once the DB is ready
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to database', err);
    process.exit(1);
  });
