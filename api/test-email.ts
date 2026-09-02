import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminRequest } from './_lib/firebase-admin';
import { verifyCronAuth } from './_lib/cron-auth';
import { sendMail, isSmtpConfigured } from './_lib/mailer';
import { renderTestEmail } from './_lib/email-template';
import { json } from './_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    const cronOk = verifyCronAuth(req) === null;
    if (!cronOk) {
      const admin = await verifyAdminRequest(req);
      if (!admin.ok) {
        return json(res, admin.status, { error: admin.error });
      }
    }

    const toFromQuery = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const toFromBody =
      req.body && typeof req.body === 'object' && 'to' in req.body
        ? String((req.body as { to?: string }).to || '').trim()
        : '';
    const to = toFromQuery || toFromBody;
    if (!to) {
      return json(res, 400, { error: 'Missing to query parameter' });
    }

    if (!isSmtpConfigured()) {
      return json(res, 500, { error: 'SMTP is not configured (SMTP_USER / SMTP_APP_PASSWORD)' });
    }

    const appUrl = process.env.APP_URL || 'https://takalot-beige.vercel.app';
    const email = renderTestEmail(appUrl);
    const result = await sendMail({ to, ...email });

    if (!result.ok) {
      return json(res, 500, { error: result.error });
    }

    return json(res, 200, { ok: true, messageId: result.messageId });
  } catch (error) {
    console.error('Test email failed:', error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  maxDuration: 30,
};
