import {
  DEFAULT_FAULT_NOTIFICATION_SETTINGS,
  FAULT_NOTIFICATION_SETTINGS_DOC,
  LEGACY_NOTIFICATION_SETTINGS_DOC,
  normalizeSettings,
} from './notification-types.js';
import { getAdminDb } from './firebase-admin.js';
import { omitUndefined } from './http.js';

export async function getFaultNotificationSettings() {
  const db = getAdminDb();
  const snap = await db.doc(FAULT_NOTIFICATION_SETTINGS_DOC).get();

  if (snap.exists) {
    return normalizeSettings(snap.data());
  }

  const legacy = await db.doc(LEGACY_NOTIFICATION_SETTINGS_DOC).get();
  if (legacy.exists) {
    const data = legacy.data();
    return normalizeSettings({
      ...DEFAULT_FAULT_NOTIFICATION_SETTINGS,
      enabled: data.enabled ?? true,
      recipients: data.recipients ?? [],
    });
  }

  return { ...DEFAULT_FAULT_NOTIFICATION_SETTINGS };
}

export async function updateFaultNotificationSettings(patch) {
  const current = await getFaultNotificationSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await getAdminDb().doc(FAULT_NOTIFICATION_SETTINGS_DOC).set(omitUndefined(next), { merge: false });
  return next;
}

export async function saveFaultNotificationSettingsAfterRun(settings, summary, dedupMap) {
  const next = {
    ...settings,
    lastRunAt: new Date().toISOString(),
    lastRunSummary: summary,
    lastSentByRecipient: dedupMap,
  };
  await getAdminDb().doc(FAULT_NOTIFICATION_SETTINGS_DOC).set(omitUndefined(next), { merge: false });
}
