import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runInstantFaultNotification } from '../_lib/fault-notification-runner.js';
import { json, parseBody } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const body = parseBody(req);
  if (!body.faultId) {
    return json(res, 400, { error: 'faultId is required' });
  }

  try {
    const summary = await runInstantFaultNotification(body.faultId, { fault: body.fault });
    return json(res, 200, { ok: true, summary });
  } catch (error) {
    console.error('Instant fault notification failed:', error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  maxDuration: 30,
};
