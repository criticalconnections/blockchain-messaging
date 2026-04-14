import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth/middleware.js';
import { blockchainClient } from '../blockchain.js';

const router = Router();
router.use(authMiddleware);

router.get('/search', async (req, res) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters' });
    return;
  }

  // Search local database
  const localUsers = await prisma.user.findMany({
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

  // Search blockchain directory (users from other peers)
  let networkUsers: Array<{
    id: string;
    username: string;
    encPublicKey: string;
    signPublicKey: string;
  }> = [];

  try {
    const dirResults = await blockchainClient.searchDirectory(q);
    networkUsers = dirResults
      .filter((entry) => {
        // Exclude users already in local results
        return !localUsers.some((u) => u.signPublicKey === entry.signPublicKey);
      })
      .map((entry) => ({
        id: entry.signPublicKey,
        username: entry.username,
        encPublicKey: entry.encPublicKey,
        signPublicKey: entry.signPublicKey,
      }));
  } catch {
    // blockchain directory unavailable, return local results only
  }

  res.json([...localUsers, ...networkUsers]);
});

router.get('/:id', async (req, res) => {
  // Try local database first
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      username: true,
      encPublicKey: true,
      signPublicKey: true,
    },
  });

  if (user) {
    res.json(user);
    return;
  }

  // Try blockchain directory (id might be a signPublicKey from another peer)
  try {
    const entry = await blockchainClient.searchDirectory(req.params.id);
    if (entry.length > 0) {
      res.json({
        id: entry[0].signPublicKey,
        username: entry[0].username,
        encPublicKey: entry[0].encPublicKey,
        signPublicKey: entry[0].signPublicKey,
      });
      return;
    }
  } catch {
    // fallthrough
  }

  res.status(404).json({ error: 'User not found' });
});

export { router as usersRouter };
