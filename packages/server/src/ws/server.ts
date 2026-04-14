import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { blockchainClient } from '../blockchain.js';
import { prisma } from '../db.js';
import * as rooms from './rooms.js';
import type { AuthPayload } from '../auth/middleware.js';
import type { BlockchainEvent, Block, Transaction } from '@bm/blockchain';

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  username: string;
  socketId: string;
  alive: boolean;
}

const clients = new Map<string, AuthenticatedSocket>();

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    let payload: AuthPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    const socket = ws as AuthenticatedSocket;
    socket.userId = payload.userId;
    socket.username = payload.username;
    socket.socketId = uuidv4();
    socket.alive = true;

    clients.set(socket.userId, socket);
    await rooms.setUserSocket(socket.userId, socket.socketId);

    socket.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleClientMessage(socket, msg);
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('pong', () => {
      socket.alive = true;
    });

    socket.on('close', async () => {
      clients.delete(socket.userId);
      await rooms.removeUserSocket(socket.userId);
      await rooms.leaveAllRooms(socket.userId);
    });

    send(socket, { type: 'CONNECTED', data: { socketId: socket.socketId } });
  });

  // Heartbeat
  setInterval(() => {
    for (const [userId, socket] of clients) {
      if (!socket.alive) {
        socket.terminate();
        clients.delete(userId);
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, 30000);

  // Subscribe to blockchain events
  blockchainClient.subscribeToEvents(async (event: BlockchainEvent) => {
    if (event.type === 'BLOCK_CONFIRMED') {
      const block = (event.data as { block: Block }).block;
      for (const tx of block.transactions) {
        await routeTransaction(tx);
      }
    }

    if (event.type === 'MESSAGE_PRUNED') {
      const { transactionId, recipient } = event.data as {
        transactionId: string;
        recipient?: string;
      };
      if (recipient) {
        await broadcastToConversation(recipient, {
          type: 'MESSAGE_PRUNED',
          data: { transactionId },
        });
      }
    }
  });
}

async function handleClientMessage(
  socket: AuthenticatedSocket,
  msg: { type: string; data: unknown }
): Promise<void> {
  switch (msg.type) {
    case 'SUBSCRIBE': {
      const { conversationId } = msg.data as { conversationId: string };
      await rooms.joinRoom(socket.userId, conversationId);
      break;
    }
    case 'UNSUBSCRIBE': {
      const { conversationId } = msg.data as { conversationId: string };
      await rooms.leaveRoom(socket.userId, conversationId);
      break;
    }
  }
}

async function routeTransaction(tx: Transaction): Promise<void> {
  if (!tx.recipient) return;

  const message = {
    type: 'NEW_MESSAGE',
    data: { transaction: tx },
  };

  // Direct message: send to recipient and sender
  if (tx.type === 'MESSAGE') {
    sendToUser(tx.recipient, message);
    if (tx.sender !== tx.recipient) {
      sendToUser(tx.sender, message);
    }

    // Also check if this is a group/channel conversation
    await broadcastToConversation(tx.recipient, message);
  }

  if (tx.type === 'GROUP_INVITE') {
    sendToUser(tx.recipient, message);
  }
}

async function broadcastToConversation(
  conversationId: string,
  message: unknown
): Promise<void> {
  const members = await rooms.getRoomMembers(conversationId);
  for (const userId of members) {
    sendToUser(userId, message);
  }
}

function sendToUser(userId: string, message: unknown): void {
  const socket = clients.get(userId);
  if (socket && socket.readyState === WebSocket.OPEN) {
    send(socket, message);
  }
}

function send(socket: WebSocket, data: unknown): void {
  socket.send(JSON.stringify(data));
}
