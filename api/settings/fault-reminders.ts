import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb, verifyAdminRequest } from '../_lib/firebase-admin.js';
import {
  getFaultNotificationSettings,
  updateFaultNotificationSettings,
} from '../_lib/fault-notification-settings.js';
import { previewDailyRun } from '../_lib/fault-notifications.js';
import { runDailyFaultReminders, runInstantFaultNotification } from '../_lib/fault-notification-runner.js';
import { json, parseBody } from '../_lib/http.js';
import { normalizeSettings } from '../_lib/notification-types.js';

async function loadFaultsForPreview() {
  const snapshot = await getAdminDb()
    .collection('faults')
    .where('status', 'in', ['open', 'in_progress'])
    .get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await verifyAdminRequest(req);
    if (!admin.ok) {
      return json(res, admin.status, { error: admin.error });
    }

    if (req.method === 'GET') {
      const settings = await getFaultNotificationSettings();
      const faults = await loadFaultsForPreview();
      const preview = previewDailyRun(faults, settings);
      return json(res, 200, { settings, preview });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const current = await getFaultNotificationSettings();
      const next = await updateFaultNotificationSettings(
        normalizeSettings({ ...current, ...body })
      );
      const faults = await loadFaultsForPreview();
      const preview = previewDailyRun(faults, next);
      return json(res, 200, { settings: next, preview });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const dryRun = Boolean(body.dryRun);
      const force = Boolean(body.force);

      if (body.mode === 'instant' && body.faultId) {
        const summary = await runInstantFaultNotification(body.faultId, { dryRun, force });
        return json(res, 200, { ok: true, summary });
      }

      const summary = await runDailyFaultReminders({ dryRun, force });
      return json(res, 200, { ok: true, summary });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API failed:', error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  maxDuration: 60,
};
