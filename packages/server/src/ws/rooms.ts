import { redis } from '../redis.js';

export async function joinRoom(userId: string, conversationId: string): Promise<void> {
  await redis.sadd(`room:${conversationId}`, userId);
  await redis.sadd(`user-rooms:${userId}`, conversationId);
}

export async function leaveRoom(userId: string, conversationId: string): Promise<void> {
  await redis.srem(`room:${conversationId}`, userId);
  await redis.srem(`user-rooms:${userId}`, conversationId);
}

export async function leaveAllRooms(userId: string): Promise<void> {
  const rooms = await redis.smembers(`user-rooms:${userId}`);
  for (const room of rooms) {
    await redis.srem(`room:${room}`, userId);
  }
  await redis.del(`user-rooms:${userId}`);
}

export async function getRoomMembers(conversationId: string): Promise<string[]> {
  return redis.smembers(`room:${conversationId}`);
}

export async function setUserSocket(userId: string, socketId: string): Promise<void> {
  await redis.set(`socket:${userId}`, socketId, 'EX', 86400);
}

export async function getUserSocket(userId: string): Promise<string | null> {
  return redis.get(`socket:${userId}`);
}

export async function removeUserSocket(userId: string): Promise<void> {
  await redis.del(`socket:${userId}`);
}
