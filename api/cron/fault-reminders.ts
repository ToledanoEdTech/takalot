import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyCronAuth } from '../../server/lib/cron-auth.js';
import { runDailyFaultReminders } from '../../server/lib/fault-notification-runner.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authError = verifyCronAuth(req);
  if (authError) {
    return res.status(authError.status).json({ error: authError.error });
  }

  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const force = req.query.force === '1' || req.query.force === 'true';

  try {
    const summary = await runDailyFaultReminders({ dryRun, force });
    return res.status(200).json({ ok: true, summary });
  } catch (error) {
    console.error('Cron fault reminders failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  maxDuration: 60,
};
