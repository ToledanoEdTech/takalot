import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ADMIN_EMAILS = new Set(['yosseftole@zvialod.com', 'yossitole@gmail.com']);

let app;

function unwrapQuotes(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function stripCodeFence(value) {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function repairPrivateKeyNewlines(value) {
  return value.replace(/"private_key"\s*:\s*"([\s\S]*?)"\s*(,|\})/, (_match, key, ending) => {
    const escaped = String(key)
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"');
    return `"private_key": "${escaped}"${ending}`;
  });
}

function normalizeServiceAccount(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const privateKey = parsed.private_key;
  const clientEmail = parsed.client_email;
  if (!privateKey || !clientEmail) return null;
  return {
    ...parsed,
    private_key: String(privateKey).replace(/\\n/g, '\n'),
  };
}

function parseJsonCandidate(candidate) {
  const attempts = [candidate, repairPrivateKeyNewlines(candidate)];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      const normalized = normalizeServiceAccount(parsed) || normalizeServiceAccount(JSON.parse(parsed));
      if (normalized) return normalized;
    } catch {
      // try next
    }
  }
  return null;
}

function parseServiceAccountFromJsonEnv(raw) {
  const trimmed = unwrapQuotes(stripCodeFence(raw.trim().replace(/^\uFEFF/, '')));
  const candidates = [trimmed];

  try {
    candidates.push(Buffer.from(trimmed, 'base64').toString('utf8'));
  } catch {
    // not base64
  }

  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed) return parsed;
  }

  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON');
}

function parseServiceAccountFromSplitEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  return {
    type: 'service_account',
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, '\n'),
  };
}

function initFirebaseAdmin() {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentials = json
    ? parseServiceAccountFromJsonEnv(json)
    : parseServiceAccountFromSplitEnv();

  if (!credentials) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  }

  app = initializeApp({
    credential: cert(credentials),
  });
  return app;
}

function isAdminConfigError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /FIREBASE_SERVICE_ACCOUNT|not configured|invalid JSON|Failed to parse private key|PEM|Credential implementation/i.test(
    message
  );
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
    return {
      ok: false,
      status: isAdminConfigError(error) ? 500 : 401,
      error: message,
    };
  }
}
