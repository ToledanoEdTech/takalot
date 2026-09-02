import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminRequest } from '../../server/lib/firebase-admin.js';
import {
  getFaultNotificationSettings,
  updateFaultNotificationSettings,
} from '../../server/lib/fault-notification-settings.js';
import { previewDailyRun } from '../../server/lib/fault-notifications.js';
import { runDailyFaultReminders, runInstantFaultNotification } from '../../server/lib/fault-notification-runner.js';
import { getAdminDb } from '../../server/lib/firebase-admin.js';
import { normalizeSettings, type FaultNotificationSettings } from '../../shared/notification-types.js';

async function loadFaultsForPreview() {
  const snapshot = await getAdminDb()
    .collection('faults')
    .where('status', 'in', ['open', 'in_progress'])
    .get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await verifyAdminRequest(req);
  if (!admin.ok) {
    return res.status(admin.status).json({ error: admin.error });
  }

  try {
    if (req.method === 'GET') {
      const settings = await getFaultNotificationSettings();
      const faults = await loadFaultsForPreview();
      const preview = previewDailyRun(faults, settings);
      return res.status(200).json({ settings, preview });
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as Partial<FaultNotificationSettings>;
      const current = await getFaultNotificationSettings();
      const next = await updateFaultNotificationSettings(
        normalizeSettings({ ...current, ...body })
      );
      const faults = await loadFaultsForPreview();
      const preview = previewDailyRun(faults, next);
      return res.status(200).json({ settings: next, preview });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        dryRun?: boolean;
        force?: boolean;
        mode?: 'daily' | 'instant';
        faultId?: string;
      };
      const dryRun = Boolean(body.dryRun);
      const force = Boolean(body.force);

      if (body.mode === 'instant' && body.faultId) {
        const summary = await runInstantFaultNotification(body.faultId, { dryRun, force });
        return res.status(200).json({ ok: true, summary });
      }

      const summary = await runDailyFaultReminders({ dryRun, force });
      return res.status(200).json({ ok: true, summary });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  maxDuration: 60,
};
