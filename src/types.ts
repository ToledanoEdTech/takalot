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
  imageUrl?: string;
  treatmentNote?: string;
}
