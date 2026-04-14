import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth/middleware.js';

const router = Router();
router.use(authMiddleware);

const createChannelSchema = z.object({
  name: z.string().min(1).max(64),
  channelPublicKey: z.string().optional(),
});

router.get('/', async (req, res) => {
  const channels = await prisma.channel.findMany({
    where: {
      subscribers: { some: { userId: req.user!.userId } },
    },
    include: {
      owner: {
        select: { id: true, username: true },
      },
      _count: { select: { subscribers: true } },
    },
  });

  res.json(channels);
});

router.post('/', async (req, res) => {
  const parsed = createChannelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { name, channelPublicKey } = parsed.data;
  const userId = req.user!.userId;

  const channel = await prisma.channel.create({
    data: {
      name,
      ownerId: userId,
      channelPublicKey,
      subscribers: {
        create: { userId },
      },
    },
  });

  res.status(201).json(channel);
});

router.post('/:id/subscribe', async (req, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
  });

  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  await prisma.channelSubscriber.upsert({
    where: {
      channelId_userId: {
        channelId: channel.id,
        userId: req.user!.userId,
      },
    },
    create: { channelId: channel.id, userId: req.user!.userId },
    update: {},
  });

  res.json({ subscribed: true });
});

router.delete('/:id/subscribe', async (req, res) => {
  await prisma.channelSubscriber.deleteMany({
    where: {
      channelId: req.params.id,
      userId: req.user!.userId,
    },
  });

  res.status(204).send();
});

router.get('/discover', async (req, res) => {
  const channels = await prisma.channel.findMany({
    include: {
      owner: { select: { id: true, username: true } },
      _count: { select: { subscribers: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json(channels);
});

export { router as channelsRouter };
