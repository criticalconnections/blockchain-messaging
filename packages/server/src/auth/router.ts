import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';

const router = Router();
const JWT_EXPIRY = '7d' as const satisfies string;
const signOpts: SignOptions = { expiresIn: JWT_EXPIRY };

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  encPublicKey: z.string(),
  signPublicKey: z.string(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { username, password, encPublicKey, signPublicKey } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, passwordHash, encPublicKey, signPublicKey },
  });

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    config.jwtSecret,
    signOpts
  );

  res.status(201).json({
    token,
    user: {
      id: user.id,
      username: user.username,
      encPublicKey: user.encPublicKey,
      signPublicKey: user.signPublicKey,
    },
  });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    config.jwtSecret,
    signOpts
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      encPublicKey: user.encPublicKey,
      signPublicKey: user.signPublicKey,
    },
  });
});

export { router as authRouter };
