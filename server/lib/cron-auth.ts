import type { VercelRequest } from '@vercel/node';

export function verifyCronAuth(req: VercelRequest): { status: number; error: string } | null {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  if (!secret && isProd) {
    return { status: 500, error: 'CRON_SECRET is not configured' };
  }

  if (!secret) return null;

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    return { status: 401, error: 'Unauthorized' };
  }

  return null;
}

export function hasCronOrAdminBypass(req: VercelRequest): boolean {
  if (!verifyCronAuth(req)) return true;
  return false;
}
