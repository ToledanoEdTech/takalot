export const FAULT_NOTIFICATION_SETTINGS_DOC = 'settings/fault-notifications';
export const LEGACY_NOTIFICATION_SETTINGS_DOC = 'settings/notifications';

export const DEFAULT_FAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  instantOnCreate: true,
  minThreshold: 1,
  postDueEnabled: false,
  preDueReminders: {
    enabled: false,
    daysBefore: [7, 3, 1],
  },
  recipients: [],
  lastSentByRecipient: {},
};

export function categoryLabel(category) {
  return category === 'computer' ? 'מחשבים' : 'כללית';
}

export function recipientCategoriesLabel(categories) {
  if (categories.length === 2) return 'כל סוגי התקלות';
  if (categories[0] === 'computer') return 'תקלות מחשבים בלבד';
  return 'תקלות כלליות בלבד';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return EMAIL_REGEX.test(email.trim());
}

export function normalizeSettings(input) {
  const base = DEFAULT_FAULT_NOTIFICATION_SETTINGS;
  if (!input) return { ...base };

  return {
    enabled: input.enabled ?? base.enabled,
    instantOnCreate: input.instantOnCreate ?? base.instantOnCreate,
    minThreshold: typeof input.minThreshold === 'number' ? input.minThreshold : base.minThreshold,
    postDueEnabled: input.postDueEnabled ?? base.postDueEnabled,
    preDueReminders: {
      enabled: input.preDueReminders?.enabled ?? base.preDueReminders.enabled,
      daysBefore: Array.isArray(input.preDueReminders?.daysBefore)
        ? input.preDueReminders.daysBefore.filter((n) => Number.isFinite(n) && n > 0)
        : base.preDueReminders.daysBefore,
    },
    recipients: Array.isArray(input.recipients) ? input.recipients : base.recipients,
    lastRunAt: input.lastRunAt,
    lastRunSummary: input.lastRunSummary,
    lastSentByRecipient: input.lastSentByRecipient ?? {},
  };
}
