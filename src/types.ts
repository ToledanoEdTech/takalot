export type {
  EmailRecipient,
  FaultCategory,
  FaultNotificationSettings,
  RunSummary,
} from '../shared/notification-types';

export {
  categoryLabel,
  recipientCategoriesLabel,
  isValidEmail,
} from '../shared/notification-types';

export type FaultStatus = 'open' | 'in_progress' | 'fixed';

export interface Fault {
  id: string;
  title: string;
  description: string;
  location: string;
  reporterName: string;
  status: FaultStatus;
  category?: import('../shared/notification-types').FaultCategory;
  createdAt: import('firebase/firestore').Timestamp;
  updatedAt: import('firebase/firestore').Timestamp;
  createdBy: string;
  hasImage?: boolean;
  imageUrl?: string;
  treatmentNote?: string;
}

export function getFaultCategory(fault: Fault): import('../shared/notification-types').FaultCategory {
  return fault.category ?? 'general';
}

export interface SettingsPreview {
  today: string;
  postDueCount: number;
  preDueCount: number;
  totalItems: number;
  recipientPlans: number;
  wouldSend: number;
  wouldSkip: number;
}

export interface SettingsResponse {
  settings: import('../shared/notification-types').FaultNotificationSettings;
  preview: SettingsPreview;
}

export const ACTIVE_FAULTS_LIMIT = 50;
export const FIXED_FAULTS_PAGE_SIZE = 30;
export const ARCHIVE_DAYS = 90;
