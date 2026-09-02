import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminRequest } from '../../server/lib/firebase-admin.js';
import { verifyCronAuth } from '../../server/lib/cron-auth.js';
import { sendMail, isSmtpConfigured } from '../../server/lib/mailer.js';
import { renderTestEmail } from '../../server/lib/email-template.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronOk = verifyCronAuth(req) === null;
  if (!cronOk) {
    const admin = await verifyAdminRequest(req);
    if (!admin.ok) {
      return res.status(admin.status).json({ error: admin.error });
    }
  }

  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  if (!to) {
    return res.status(400).json({ error: 'Missing to query parameter' });
  }

  if (!isSmtpConfigured()) {
    return res.status(500).json({ error: 'SMTP is not configured' });
  }

  const appUrl = process.env.APP_URL || 'https://takalot-beige.vercel.app';
  const email = renderTestEmail(appUrl);
  const result = await sendMail({ to, ...email });

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({ ok: true, messageId: result.messageId });
}

export const config = {
  maxDuration: 30,
};
