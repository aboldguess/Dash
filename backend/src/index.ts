import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import net from 'net';
import open from 'open';

import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import channelRoutes from './routes/channels';
import crmRoutes from './routes/crm';
import projectRoutes from './routes/projects';
import programRoutes from './routes/programs';
import timesheetRoutes from './routes/timesheets';
import leaveRoutes from './routes/leaves';
import userRoutes from './routes/users';
import teamRoutes from './routes/teams';
import adminRoutes from './routes/admin';
import profileRoutes from './routes/profile';
import socialRoutes from './routes/social';
import { connectDB } from './db';
import { Message } from './models/message';
import { DirectMessage } from './models/directMessage';
import { seedUsers } from './seedUsers';
import { userConnected, userDisconnected } from './presence';

export const app = express();
// The initial port preference comes from the environment or defaults to 3000
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

/**
 * Check if the provided port is currently in use.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const tester = net
      .createServer()
      .once('error', err => {
        resolve((err as NodeJS.ErrnoException).code === 'EADDRINUSE');
      })
      .once('listening', () => {
        tester.close(() => resolve(false));
      })
      .listen(port);
  });
}

/**
 * Find the first available port starting from the provided number.
 */
async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (await isPortInUse(port)) {
    port += 1;
  }
  return port;
}

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
    // Track presence for multi-tab support and broadcast status
    userConnected(username);
    io.emit('userOnline', username);
  });

  // Remove the user from the presence list when they disconnect
  socket.on('disconnect', () => {
    const username = socket.data.username;
    if (username) {
      // Only emit offline when the last tab disconnects
      const stillOnline = userDisconnected(username);
      if (!stillOnline) {
        io.emit('userOffline', username);
      }
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
      // Emit the message to both participants. Using `io.to()` with an array
      // sends to the union of rooms, but chaining `.to()` calls would emit only
      // to sockets that are in **both** rooms. Send separately so each user
      // receives the direct message regardless of whether they share any rooms.
      io.to(from).emit('directMessage', dm);
      io.to(to).emit('directMessage', dm);
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
app.use('/api/teams', teamRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/social', socialRoutes);

// Expose uploaded profile photos as static files
const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

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
if (require.main === module) {
  connectDB()
    .then(async () => {
      // Populate demo accounts before accepting connections
      await seedUsers();

      // Determine the first free port starting from our default
      const port = await findAvailablePort(DEFAULT_PORT);

      // Start the combined HTTP/WebSocket server once the DB is ready
      server.listen(port, async () => {
        console.log(`Server listening on port ${port}`);
        // Open the frontend in the user's default browser
        await open(`http://localhost:${port}`);
      });
    })
    .catch(err => {
      console.error('Failed to connect to database', err);
      process.exit(1);
    });
}
