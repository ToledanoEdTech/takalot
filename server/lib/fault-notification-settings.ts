import {
  DEFAULT_FAULT_NOTIFICATION_SETTINGS,
  FAULT_NOTIFICATION_SETTINGS_DOC,
  LEGACY_NOTIFICATION_SETTINGS_DOC,
  normalizeSettings,
  type FaultNotificationSettings,
} from '../../shared/notification-types.js';
import { getAdminDb } from './firebase-admin.js';

export async function getFaultNotificationSettings(): Promise<FaultNotificationSettings> {
  const db = getAdminDb();
  const snap = await db.doc(FAULT_NOTIFICATION_SETTINGS_DOC).get();

  if (snap.exists) {
    return normalizeSettings(snap.data() as Partial<FaultNotificationSettings>);
  }

  const legacy = await db.doc(LEGACY_NOTIFICATION_SETTINGS_DOC).get();
  if (legacy.exists) {
    const data = legacy.data() as Partial<FaultNotificationSettings> & {
      recipients?: FaultNotificationSettings['recipients'];
    };
    return normalizeSettings({
      ...DEFAULT_FAULT_NOTIFICATION_SETTINGS,
      enabled: data.enabled ?? true,
      recipients: data.recipients ?? [],
    });
  }

  return { ...DEFAULT_FAULT_NOTIFICATION_SETTINGS };
}

export async function updateFaultNotificationSettings(
  patch: Partial<FaultNotificationSettings>
): Promise<FaultNotificationSettings> {
  const current = await getFaultNotificationSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await getAdminDb().doc(FAULT_NOTIFICATION_SETTINGS_DOC).set(next, { merge: false });
  return next;
}

export async function saveFaultNotificationSettingsAfterRun(
  settings: FaultNotificationSettings,
  summary: FaultNotificationSettings['lastRunSummary'],
  dedupMap: Record<string, string>
): Promise<void> {
  const next: FaultNotificationSettings = {
    ...settings,
    lastRunAt: new Date().toISOString(),
    lastRunSummary: summary,
    lastSentByRecipient: dedupMap,
  };
  await getAdminDb().doc(FAULT_NOTIFICATION_SETTINGS_DOC).set(next, { merge: false });
}
