import { addDaysToYmd, getIsraelYmd, isActiveFaultStatus, timestampToIsraelYmd } from './timezone.js';

export function buildDedupKey(recipientId, faultId, kind, daysBefore) {
  if (kind === 'pre-due' && daysBefore) {
    return `${recipientId}::${faultId}::pre-${daysBefore}`;
  }
  if (kind === 'post-due') {
    return `${recipientId}::${faultId}::post-due`;
  }
  return `${recipientId}::${faultId}::instant`;
}

export function buildReminderRecipients(recipients) {
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

export function collectPostDueFaults(faults, today) {
  const targetCreatedDate = addDaysToYmd(today, -1);
  const items = [];

  for (const fault of faults) {
    if (!fault.status || !isActiveFaultStatus(fault.status)) continue;
    const createdAtYmd = timestampToIsraelYmd(fault.createdAt);
    if (!createdAtYmd || createdAtYmd !== targetCreatedDate) continue;
    items.push(mapFaultToReminderItem(fault, createdAtYmd, 'post-due'));
  }

  return items;
}

export function collectPreDueFaults(faults, today, daysBeforeList) {
  const items = [];

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

export function mapFaultToInstantItem(fault) {
  const createdAtYmd = timestampToIsraelYmd(fault.createdAt) ?? getIsraelYmd();
  return mapFaultToReminderItem(fault, createdAtYmd, 'instant');
}

function mapFaultToReminderItem(fault, createdAtYmd, kind, daysBefore) {
  return {
    faultId: fault.id,
    title: fault.title ?? 'ללא כותרת',
    location: fault.location ?? '—',
    reporterName: fault.reporterName ?? '—',
    description: fault.description ?? '',
    category: fault.category ?? 'general',
    status: fault.status ?? 'open',
    createdAtYmd,
    kind,
    daysBefore,
  };
}

export function buildReminderPlans(items, recipients) {
  const plans = [];

  for (const recipient of recipients) {
    const matched = items.filter((item) => recipient.categories.includes(item.category));
    if (matched.length === 0) continue;
    plans.push({ recipient, items: matched });
  }

  return plans;
}

export function filterUnsentReminderItems(plan, lastSentByRecipient, force, today) {
  if (force) return plan.items;
  const map = lastSentByRecipient ?? {};
  return plan.items.filter((item) => {
    const key = buildDedupKey(plan.recipient.id, item.faultId, item.kind, item.daysBefore);
    return map[key] !== today;
  });
}

export function shouldSendToRecipient(unsentItems, settings, recipient, globalEnabled) {
  if (!globalEnabled) return { send: false, reason: 'inactive' };
  if (recipient.reminderOptOut) return { send: false, reason: 'opt_out' };
  if (!recipient.email) return { send: false, reason: 'no_email' };
  if (unsentItems.length === 0) return { send: false, reason: 'already_sent' };
  if (unsentItems.length < settings.minThreshold) {
    return { send: false, reason: 'below_threshold' };
  }
  return { send: true };
}

export function updateDedupMapForPlan(dedupMap, plan, items, today) {
  const next = { ...dedupMap };
  for (const item of items) {
    const key = buildDedupKey(plan.recipient.id, item.faultId, item.kind, item.daysBefore);
    next[key] = today;
  }
  return next;
}

export function previewDailyRun(faults, settings, today = getIsraelYmd()) {
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
