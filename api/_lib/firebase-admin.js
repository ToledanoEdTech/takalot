import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ADMIN_EMAILS = new Set(['yosseftole@zvialod.com', 'yossitole@gmail.com']);

let app;

function parseServiceAccount(raw) {
  const trimmed = raw.trim().replace(/^\uFEFF/, '');
  const candidates = [trimmed];

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    candidates.push(trimmed.slice(1, -1));
  }

  try {
    candidates.push(Buffer.from(trimmed, 'base64').toString('utf8'));
  } catch {
    // not base64
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.private_key) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
        return parsed;
      }
    } catch {
      // try next
    }
  }

  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON');
}

function initFirebaseAdmin() {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  }

  app = initializeApp({
    credential: cert(parseServiceAccount(json)),
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

export function isAdminEmail(email) {
  return Boolean(email && ADMIN_EMAILS.has(String(email).toLowerCase()));
}

export async function verifyAdminRequest(req) {
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
    return { ok: true, email: decoded.email, uid: decoded.uid };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid authorization token';
    return { ok: false, status: 401, error: message };
  }
}
