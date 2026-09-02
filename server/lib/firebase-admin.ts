import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { VercelRequest } from '@vercel/node';

const ADMIN_EMAILS = new Set(['yosseftole@zvialod.com', 'yossitole@gmail.com']);

let app: App | undefined;

function initFirebaseAdmin(): App {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  }

  const serviceAccount = JSON.parse(json);
  app = initializeApp({
    credential: cert(serviceAccount),
  });
  return app;
}

export function getAdminDb() {
  initFirebaseAdmin();
  return getFirestore();
}

export function getAdminAuth() {
  initFirebaseAdmin();
  return getAuth();
}

export function isAdminEmail(email: string | undefined | null): boolean {
  return Boolean(email && ADMIN_EMAILS.has(email.toLowerCase()));
}

export async function verifyAdminRequest(
  req: VercelRequest
): Promise<{ ok: true; email: string; uid: string } | { ok: false; status: number; error: string }> {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (secret && authHeader === `Bearer ${secret}`) {
    return { ok: true, email: 'cron@system', uid: 'cron' };
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing authorization token' };
  }

  try {
    const token = authHeader.slice('Bearer '.length);
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!isAdminEmail(decoded.email)) {
      return { ok: false, status: 403, error: 'Admin access required' };
    }
    return { ok: true, email: decoded.email!, uid: decoded.uid };
  } catch {
    return { ok: false, status: 401, error: 'Invalid authorization token' };
  }
}
