import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runInstantFaultNotification } from '../../server/lib/fault-notification-runner.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as { faultId?: string };
  if (!body.faultId) {
    return res.status(400).json({ error: 'faultId is required' });
  }

  try {
    const summary = await runInstantFaultNotification(body.faultId);
    return res.status(200).json({ ok: true, summary });
  } catch (error) {
    console.error('Instant fault notification failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  maxDuration: 30,
};
