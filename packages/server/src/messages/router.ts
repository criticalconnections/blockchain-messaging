import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth/middleware.js';
import { blockchainClient } from '../blockchain.js';
import type { Transaction } from '@bm/blockchain';

const router = Router();
router.use(authMiddleware);

const sendMessageSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['MESSAGE', 'KEY_PUBLISH', 'GROUP_CREATE', 'GROUP_INVITE', 'CHANNEL_CREATE', 'CHANNEL_POST']),
  sender: z.string(),
  recipient: z.string().optional(),
  payload: z.string(),
  timestamp: z.number(),
  ttl: z.number().optional(),
  signature: z.string(),
});

router.post('/', async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const tx = parsed.data as Transaction;

  try {
    const result = await blockchainClient.submitTransaction(tx);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const before = req.query.before ? parseInt(req.query.before as string) : undefined;

  try {
    const txs = await blockchainClient.getTransactionsByParticipant(
      conversationId,
      limit,
      before
    );
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/tx/:txId', async (req, res) => {
  try {
    const tx = await blockchainClient.getTransaction(req.params.txId);
    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export { router as messagesRouter };
