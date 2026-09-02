import type { FaultNotificationSettings, RunSummary } from '../../shared/notification-types';
import {
  buildReminderPlans,
  buildReminderRecipients,
  collectPostDueFaults,
  collectPreDueFaults,
  filterUnsentReminderItems,
  mapFaultToInstantItem,
  shouldSendToRecipient,
  updateDedupMapForPlan,
  type FaultRecord,
} from './fault-notifications';
import { getFaultNotificationSettings, saveFaultNotificationSettingsAfterRun } from './fault-notification-settings';
import { renderFaultNotificationEmail } from './email-template';
import { sendMail } from './mailer';
import { getAdminDb } from './firebase-admin';
import { getIsraelYmd } from './timezone';

function emptySummary(dryRun: boolean): RunSummary {
  return { sent: 0, skipped: 0, errors: 0, dryRun, at: new Date().toISOString(), results: [] };
}

async function loadActiveFaults(): Promise<FaultRecord[]> {
  const snapshot = await getAdminDb().collection('faults').where('status', 'in', ['open', 'in_progress']).get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as FaultRecord));
}

async function loadFaultById(faultId: string): Promise<FaultRecord | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const snap = await getAdminDb().doc(`faults/${faultId}`).get();
    if (snap.exists) {
      return { id: snap.id, ...snap.data() } as FaultRecord;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

function getAppUrl(): string {
  return process.env.APP_URL || 'https://takalot-beige.vercel.app';
}

async function executePlans(
  settings: FaultNotificationSettings,
  plans: ReturnType<typeof buildReminderPlans>,
  options: { dryRun: boolean; force: boolean; today: string; globalEnabled: boolean }
): Promise<{ summary: RunSummary; dedupMap: Record<string, string> }> {
  const summary = emptySummary(options.dryRun);
  let dedupMap = { ...(settings.lastSentByRecipient ?? {}) };

  for (const plan of plans) {
    const unsent = filterUnsentReminderItems(
      plan,
      dedupMap,
      options.force,
      options.today
    );
    const decision = shouldSendToRecipient(
      unsent,
      settings,
      plan.recipient,
      options.globalEnabled
    );

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

export async function runDailyFaultReminders(options: {
  dryRun?: boolean;
  force?: boolean;
} = {}): Promise<RunSummary> {
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

export async function runInstantFaultNotification(
  faultId: string,
  options: { dryRun?: boolean; force?: boolean; fault?: FaultRecord } = {}
): Promise<RunSummary> {
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
    await saveFaultNotificationSettingsAfterRun(
      settings,
      settings.lastRunSummary,
      dedupMap
    );
  }

  return summary;
}
