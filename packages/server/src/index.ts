import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { config } from './config.js';
import { authRouter } from './auth/router.js';
import { usersRouter } from './users/router.js';
import { contactsRouter } from './contacts/router.js';
import { groupsRouter } from './groups/router.js';
import { channelsRouter } from './channels/router.js';
import { messagesRouter } from './messages/router.js';
import { setupWebSocket } from './ws/server.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const server = http.createServer(app);
setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`API server running on port ${config.port}`);
  console.log(`WebSocket available at ws://localhost:${config.port}/ws`);
});
