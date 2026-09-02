export function verifyCronAuth(req) {
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
