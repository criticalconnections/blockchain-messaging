import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth/middleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/search', async (req, res) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters' });
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      username: { contains: q, mode: 'insensitive' },
      id: { not: req.user!.userId },
    },
    select: {
      id: true,
      username: true,
      encPublicKey: true,
      signPublicKey: true,
    },
    take: 20,
  });

  res.json(users);
});

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      username: true,
      encPublicKey: true,
      signPublicKey: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

export { router as usersRouter };
