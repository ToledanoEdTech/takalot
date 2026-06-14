import { Timestamp } from 'firebase/firestore';

export type FaultStatus = 'open' | 'in_progress' | 'fixed';

export interface Fault {
  id: string;
  title: string;
  description: string;
  location: string;
  reporterName: string;
  status: FaultStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  hasImage?: boolean;
  /** @deprecated Legacy inline images — use fault_images collection */
  imageUrl?: string;
  treatmentNote?: string;
}

export const ACTIVE_FAULTS_LIMIT = 50;
export const FIXED_FAULTS_PAGE_SIZE = 30;
export const ARCHIVE_DAYS = 90;
