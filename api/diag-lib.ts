import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyCronAuth } from './_lib/cron-auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const auth = verifyCronAuth(req);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({
    ok: true,
    lib: 'cron-auth-loaded',
    authStatus: auth?.status ?? 'skipped-or-ok',
  });
}
