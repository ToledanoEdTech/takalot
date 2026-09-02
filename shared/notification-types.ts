export type FaultCategory = 'general' | 'computer';
export type FaultStatus = 'open' | 'in_progress' | 'fixed';
export type ReminderKind = 'instant' | 'post-due' | 'pre-due';

export interface EmailRecipient {
  id: string;
  name: string;
  email: string;
  categories: FaultCategory[];
  reminderOptOut?: boolean;
}

export interface FaultNotificationSettings {
  enabled: boolean;
  instantOnCreate: boolean;
  minThreshold: number;
  postDueEnabled: boolean;
  preDueReminders: {
    enabled: boolean;
    daysBefore: number[];
  };
  recipients: EmailRecipient[];
  lastRunAt?: string;
  lastRunSummary?: {
    sent: number;
    skipped: number;
    errors: number;
    dryRun?: boolean;
    at?: string;
  };
  lastSentByRecipient?: Record<string, string>;
}

export const FAULT_NOTIFICATION_SETTINGS_DOC = 'settings/fault-notifications';
export const LEGACY_NOTIFICATION_SETTINGS_DOC = 'settings/notifications';

export const DEFAULT_FAULT_NOTIFICATION_SETTINGS: FaultNotificationSettings = {
  enabled: true,
  instantOnCreate: true,
  minThreshold: 1,
  postDueEnabled: true,
  preDueReminders: {
    enabled: false,
    daysBefore: [7, 3, 1],
  },
  recipients: [],
  lastSentByRecipient: {},
};

export interface ReminderFaultItem {
  faultId: string;
  title: string;
  location: string;
  reporterName: string;
  description: string;
  category: FaultCategory;
  status: FaultStatus;
  createdAtYmd: string;
  kind: ReminderKind;
  daysBefore?: number;
}

export interface ReminderRecipient {
  id: string;
  name: string;
  email: string;
  categories: FaultCategory[];
  reminderOptOut?: boolean;
}

export interface ReminderPlan {
  recipient: ReminderRecipient;
  items: ReminderFaultItem[];
}

export type SkipReason =
  | 'inactive'
  | 'opt_out'
  | 'no_email'
  | 'below_threshold'
  | 'no_items'
  | 'already_sent';

export interface SendDecision {
  send: boolean;
  reason?: SkipReason;
}

export interface RunResultEntry {
  recipientId: string;
  recipientEmail: string;
  sent?: boolean;
  skipped?: SkipReason;
  error?: string;
  itemCount?: number;
}

export interface RunSummary {
  sent: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  at: string;
  results: RunResultEntry[];
}

export function categoryLabel(category: FaultCategory): string {
  return category === 'computer' ? 'מחשבים' : 'כללית';
}

export function recipientCategoriesLabel(categories: FaultCategory[]): string {
  if (categories.length === 2) return 'כל סוגי התקלות';
  if (categories[0] === 'computer') return 'תקלות מחשבים בלבד';
  return 'תקלות כלליות בלבד';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function normalizeSettings(
  input: Partial<FaultNotificationSettings> | null | undefined
): FaultNotificationSettings {
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
