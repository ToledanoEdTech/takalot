import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyCronAuth } from '../../server/lib/cron-auth';
import { runDailyFaultReminders } from '../../server/lib/fault-notification-runner';
import { json } from '../../server/lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const authError = verifyCronAuth(req);
  if (authError) {
    return json(res, authError.status, { error: authError.error });
  }

  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const force = req.query.force === '1' || req.query.force === 'true';

  try {
    const summary = await runDailyFaultReminders({ dryRun, force });
    return json(res, 200, { ok: true, summary });
  } catch (error) {
    console.error('Cron fault reminders failed:', error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  maxDuration: 60,
};
