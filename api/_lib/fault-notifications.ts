import type {
  EmailRecipient,
  FaultCategory,
  ReminderFaultItem,
  ReminderPlan,
  ReminderRecipient,
  ReminderKind,
  SendDecision,
  SkipReason,
} from './notification-types';
import { addDaysToYmd, getIsraelYmd, isActiveFaultStatus, timestampToIsraelYmd } from './timezone';

export interface FaultRecord {
  id: string;
  title?: string;
  description?: string;
  location?: string;
  reporterName?: string;
  status?: string;
  category?: FaultCategory;
  createdAt?: unknown;
}

export function buildDedupKey(
  recipientId: string,
  faultId: string,
  kind: ReminderKind,
  daysBefore?: number
): string {
  if (kind === 'pre-due' && daysBefore) {
    return `${recipientId}::${faultId}::pre-${daysBefore}`;
  }
  if (kind === 'post-due') {
    return `${recipientId}::${faultId}::post-due`;
  }
  return `${recipientId}::${faultId}::instant`;
}

export function buildReminderRecipients(recipients: EmailRecipient[]): ReminderRecipient[] {
  return recipients
    .filter((r) => r.email?.trim())
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email.trim().toLowerCase(),
      categories: r.categories,
      reminderOptOut: r.reminderOptOut ?? false,
    }));
}

export function collectPostDueFaults(faults: FaultRecord[], today: string): ReminderFaultItem[] {
  const targetCreatedDate = addDaysToYmd(today, -1);
  const items: ReminderFaultItem[] = [];

  for (const fault of faults) {
    if (!fault.status || !isActiveFaultStatus(fault.status)) continue;
    const createdAtYmd = timestampToIsraelYmd(fault.createdAt);
    if (!createdAtYmd || createdAtYmd !== targetCreatedDate) continue;

    items.push(mapFaultToReminderItem(fault, createdAtYmd, 'post-due'));
  }

  return items;
}

export function collectPreDueFaults(
  faults: FaultRecord[],
  today: string,
  daysBeforeList: number[]
): ReminderFaultItem[] {
  const items: ReminderFaultItem[] = [];

  for (const fault of faults) {
    if (!fault.status || !isActiveFaultStatus(fault.status)) continue;
    const createdAtYmd = timestampToIsraelYmd(fault.createdAt);
    if (!createdAtYmd) continue;

    for (const daysBefore of daysBeforeList) {
      const dueDate = addDaysToYmd(createdAtYmd, daysBefore);
      if (dueDate !== today) continue;
      items.push(mapFaultToReminderItem(fault, createdAtYmd, 'pre-due', daysBefore));
    }
  }

  return items;
}

export function mapFaultToInstantItem(fault: FaultRecord): ReminderFaultItem | null {
  const createdAtYmd = timestampToIsraelYmd(fault.createdAt) ?? getIsraelYmd();
  return mapFaultToReminderItem(fault, createdAtYmd, 'instant');
}

function mapFaultToReminderItem(
  fault: FaultRecord,
  createdAtYmd: string,
  kind: ReminderKind,
  daysBefore?: number
): ReminderFaultItem {
  return {
    faultId: fault.id,
    title: fault.title ?? 'ללא כותרת',
    location: fault.location ?? '—',
    reporterName: fault.reporterName ?? '—',
    description: fault.description ?? '',
    category: fault.category ?? 'general',
    status: (fault.status as ReminderFaultItem['status']) ?? 'open',
    createdAtYmd,
    kind,
    daysBefore,
  };
}

export function buildReminderPlans(
  items: ReminderFaultItem[],
  recipients: ReminderRecipient[]
): ReminderPlan[] {
  const plans: ReminderPlan[] = [];

  for (const recipient of recipients) {
    const matched = items.filter((item) => recipient.categories.includes(item.category));
    if (matched.length === 0) continue;
    plans.push({ recipient, items: matched });
  }

  return plans;
}

export function filterUnsentReminderItems(
  plan: ReminderPlan,
  lastSentByRecipient: Record<string, string> | undefined,
  force: boolean,
  today: string
): ReminderFaultItem[] {
  if (force) return plan.items;

  const map = lastSentByRecipient ?? {};
  return plan.items.filter((item) => {
    const key = buildDedupKey(plan.recipient.id, item.faultId, item.kind, item.daysBefore);
    return map[key] !== today;
  });
}

export function shouldSendToRecipient(
  unsentItems: ReminderFaultItem[],
  settings: { minThreshold: number },
  recipient: ReminderRecipient,
  globalEnabled: boolean
): SendDecision {
  if (!globalEnabled) return { send: false, reason: 'inactive' };
  if (recipient.reminderOptOut) return { send: false, reason: 'opt_out' };
  if (!recipient.email) return { send: false, reason: 'no_email' };
  if (unsentItems.length === 0) return { send: false, reason: 'already_sent' };
  if (unsentItems.length < settings.minThreshold) {
    return { send: false, reason: 'below_threshold' };
  }
  return { send: true };
}

export function updateDedupMapForPlan(
  dedupMap: Record<string, string>,
  plan: ReminderPlan,
  items: ReminderFaultItem[],
  today: string
): Record<string, string> {
  const next = { ...dedupMap };
  for (const item of items) {
    const key = buildDedupKey(plan.recipient.id, item.faultId, item.kind, item.daysBefore);
    next[key] = today;
  }
  return next;
}

export function previewDailyRun(
  faults: FaultRecord[],
  settings: {
    enabled: boolean;
    postDueEnabled: boolean;
    preDueReminders: { enabled: boolean; daysBefore: number[] };
    minThreshold: number;
    recipients: EmailRecipient[];
  },
  today = getIsraelYmd()
) {
  const postDueItems = settings.postDueEnabled ? collectPostDueFaults(faults, today) : [];
  const preDueItems = settings.preDueReminders.enabled
    ? collectPreDueFaults(faults, today, settings.preDueReminders.daysBefore)
    : [];
  const allItems = [...postDueItems, ...preDueItems];
  const recipients = buildReminderRecipients(settings.recipients);
  const plans = buildReminderPlans(allItems, recipients);

  let wouldSend = 0;
  let wouldSkip = 0;

  for (const plan of plans) {
    const unsent = filterUnsentReminderItems(plan, {}, false, today);
    const decision = shouldSendToRecipient(unsent, settings, plan.recipient, settings.enabled);
    if (decision.send) wouldSend += 1;
    else wouldSkip += 1;
  }

  return {
    today,
    postDueCount: postDueItems.length,
    preDueCount: preDueItems.length,
    totalItems: allItems.length,
    recipientPlans: plans.length,
    wouldSend,
    wouldSkip,
  };
}
