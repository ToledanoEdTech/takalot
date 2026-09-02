import {
  buildReminderPlans,
  buildReminderRecipients,
  collectPostDueFaults,
  collectPreDueFaults,
  filterUnsentReminderItems,
  mapFaultToInstantItem,
  shouldSendToRecipient,
  updateDedupMapForPlan,
} from './fault-notifications.js';
import { getFaultNotificationSettings, saveFaultNotificationSettingsAfterRun } from './fault-notification-settings.js';
import { renderFaultNotificationEmail } from './email-template.js';
import { sendMail } from './mailer.js';
import { getAdminDb } from './firebase-admin.js';
import { getIsraelYmd } from './timezone.js';

function emptySummary(dryRun) {
  return { sent: 0, skipped: 0, errors: 0, dryRun, at: new Date().toISOString(), results: [] };
}

async function loadActiveFaults() {
  const snapshot = await getAdminDb().collection('faults').where('status', 'in', ['open', 'in_progress']).get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function loadFaultById(faultId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const snap = await getAdminDb().doc(`faults/${faultId}`).get();
    if (snap.exists) {
      return { id: snap.id, ...snap.data() };
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

function getAppUrl() {
  return process.env.APP_URL || 'https://takalot-beige.vercel.app';
}

async function executePlans(settings, plans, options) {
  const summary = emptySummary(options.dryRun);
  let dedupMap = { ...(settings.lastSentByRecipient ?? {}) };

  for (const plan of plans) {
    const unsent = filterUnsentReminderItems(plan, dedupMap, options.force, options.today);
    const decision = shouldSendToRecipient(unsent, settings, plan.recipient, options.globalEnabled);

    if (!decision.send) {
      summary.skipped += 1;
      summary.results.push({
        recipientId: plan.recipient.id,
        recipientEmail: plan.recipient.email,
        skipped: decision.reason,
        itemCount: unsent.length,
      });
      continue;
    }

    const email = renderFaultNotificationEmail({
      recipientName: plan.recipient.name,
      items: unsent,
      appUrl: getAppUrl(),
    });

    if (options.dryRun) {
      summary.sent += 1;
      summary.results.push({
        recipientId: plan.recipient.id,
        recipientEmail: plan.recipient.email,
        sent: true,
        itemCount: unsent.length,
      });
      continue;
    }

    const result = await sendMail({
      to: plan.recipient.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (result.ok) {
      summary.sent += 1;
      dedupMap = updateDedupMapForPlan(dedupMap, plan, unsent, options.today);
      summary.results.push({
        recipientId: plan.recipient.id,
        recipientEmail: plan.recipient.email,
        sent: true,
        itemCount: unsent.length,
      });
    } else {
      summary.errors += 1;
      summary.results.push({
        recipientId: plan.recipient.id,
        recipientEmail: plan.recipient.email,
        error: result.error,
        itemCount: unsent.length,
      });
    }
  }

  return { summary, dedupMap };
}

export async function runDailyFaultReminders(options = {}) {
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const settings = await getFaultNotificationSettings();

  if (!settings.enabled && !dryRun && !force) {
    return emptySummary(dryRun);
  }

  const today = getIsraelYmd();
  const faults = await loadActiveFaults();

  const postDueItems = settings.postDueEnabled ? collectPostDueFaults(faults, today) : [];
  const preDueItems = settings.preDueReminders.enabled
    ? collectPreDueFaults(faults, today, settings.preDueReminders.daysBefore)
    : [];
  const allItems = [...postDueItems, ...preDueItems];
  const recipients = buildReminderRecipients(settings.recipients);
  const plans = buildReminderPlans(allItems, recipients);

  const { summary, dedupMap } = await executePlans(settings, plans, {
    dryRun,
    force,
    today,
    globalEnabled: settings.enabled,
  });

  if (!dryRun) {
    await saveFaultNotificationSettingsAfterRun(
      settings,
      {
        sent: summary.sent,
        skipped: summary.skipped,
        errors: summary.errors,
        dryRun: false,
        at: summary.at,
      },
      dedupMap
    );
  }

  return summary;
}

export async function runInstantFaultNotification(faultId, options = {}) {
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const settings = await getFaultNotificationSettings();

  if (!settings.enabled || !settings.instantOnCreate) {
    if (!dryRun && !force) return emptySummary(dryRun);
  }

  const fault = options.fault ?? (await loadFaultById(faultId));
  if (!fault) {
    const summary = emptySummary(dryRun);
    summary.errors = 1;
    summary.results.push({
      recipientId: 'system',
      recipientEmail: '',
      error: 'Fault not found',
    });
    return summary;
  }

  const item = mapFaultToInstantItem(fault);
  if (!item) {
    return emptySummary(dryRun);
  }

  const today = getIsraelYmd();
  const recipients = buildReminderRecipients(settings.recipients);
  const plans = buildReminderPlans([item], recipients);

  const { summary, dedupMap } = await executePlans(settings, plans, {
    dryRun,
    force,
    today,
    globalEnabled: settings.enabled && settings.instantOnCreate,
  });

  if (!dryRun && summary.sent > 0) {
    await saveFaultNotificationSettingsAfterRun(settings, settings.lastRunSummary, dedupMap);
  }

  return summary;
}
