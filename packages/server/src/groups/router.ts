import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth/middleware.js';

const router = Router();
router.use(authMiddleware);

const createGroupSchema = z.object({
  name: z.string().min(1).max(64),
  memberIds: z.array(z.string().uuid()),
});

const inviteSchema = z.object({
  userId: z.string().uuid(),
});

router.get('/', async (req, res) => {
  const groups = await prisma.group.findMany({
    where: {
      members: { some: { userId: req.user!.userId } },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, encPublicKey: true, signPublicKey: true },
          },
        },
      },
    },
  });

  res.json(groups);
});

router.post('/', async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { name, memberIds } = parsed.data;
  const userId = req.user!.userId;

  const allMemberIds = [...new Set([userId, ...memberIds])];

  const group = await prisma.group.create({
    data: {
      name,
      ownerId: userId,
      members: {
        create: allMemberIds.map((id) => ({
          userId: id,
          role: id === userId ? 'owner' : 'member',
        })),
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, encPublicKey: true, signPublicKey: true },
          },
        },
      },
    },
  });

  res.status(201).json(group);
});

router.get('/:id', async (req, res) => {
  const group = await prisma.group.findFirst({
    where: {
      id: req.params.id,
      members: { some: { userId: req.user!.userId } },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, encPublicKey: true, signPublicKey: true },
          },
        },
      },
    },
  });

  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  res.json(group);
});

router.post('/:id/invite', async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const group = await prisma.group.findFirst({
    where: {
      id: req.params.id,
      ownerId: req.user!.userId,
    },
  });

  if (!group) {
    res.status(404).json({ error: 'Group not found or not owner' });
    return;
  }

  const member = await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: parsed.data.userId,
    },
    include: {
      user: {
        select: { id: true, username: true, encPublicKey: true, signPublicKey: true },
      },
    },
  });

  res.status(201).json(member);
});

router.delete('/:id/members/:userId', async (req, res) => {
  const group = await prisma.group.findFirst({
    where: { id: req.params.id, ownerId: req.user!.userId },
  });
  if (!group) {
    res.status(404).json({ error: 'Group not found or not owner' });
    return;
  }

  await prisma.groupMember.delete({
    where: {
      groupId_userId: {
        groupId: req.params.id,
        userId: req.params.userId,
      },
    },
  });

  res.status(204).send();
});

export { router as groupsRouter };
