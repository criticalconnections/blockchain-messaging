import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth/middleware.js';

const router = Router();
router.use(authMiddleware);

const addContactSchema = z.object({
  contactId: z.string().uuid(),
  alias: z.string().max(64).optional(),
});

router.get('/', async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { userId: req.user!.userId },
    include: {
      contact: {
        select: {
          id: true,
          username: true,
          encPublicKey: true,
          signPublicKey: true,
        },
      },
    },
  });

  res.json(contacts);
});

router.post('/', async (req, res) => {
  const parsed = addContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { contactId, alias } = parsed.data;
  const userId = req.user!.userId;

  if (contactId === userId) {
    res.status(400).json({ error: 'Cannot add yourself as a contact' });
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: contactId } });
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const existing = await prisma.contact.findUnique({
    where: { userId_contactId: { userId, contactId } },
  });
  if (existing) {
    res.status(409).json({ error: 'Contact already exists' });
    return;
  }

  const contact = await prisma.contact.create({
    data: { userId, contactId, alias },
    include: {
      contact: {
        select: { id: true, username: true, encPublicKey: true, signPublicKey: true },
      },
    },
  });

  res.status(201).json(contact);
});

router.delete('/:contactId', async (req, res) => {
  await prisma.contact.deleteMany({
    where: {
      userId: req.user!.userId,
      contactId: req.params.contactId,
    },
  });
  res.status(204).send();
});

export { router as contactsRouter };
