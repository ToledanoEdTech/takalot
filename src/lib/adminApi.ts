import type { User } from 'firebase/auth';
import type { FaultNotificationSettings, RunSummary, SettingsResponse } from '../types';

async function authHeaders(user: User): Promise<HeadersInit> {
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('שרת ה-API לא זמין (הריצו npx vercel dev או פרסו ל-Vercel)');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchFaultReminderSettings(user: User): Promise<SettingsResponse> {
  const res = await fetch('/api/settings/fault-reminders', {
    headers: await authHeaders(user),
  });
  return parseJson<SettingsResponse>(res);
}

export async function patchFaultReminderSettings(
  user: User,
  patch: Partial<FaultNotificationSettings>
): Promise<SettingsResponse> {
  const res = await fetch('/api/settings/fault-reminders', {
    method: 'PATCH',
    headers: await authHeaders(user),
    body: JSON.stringify(patch),
  });
  return parseJson<SettingsResponse>(res);
}

export async function runFaultRemindersManual(
  user: User,
  options: { dryRun?: boolean; force?: boolean } = {}
): Promise<{ ok: boolean; summary: RunSummary }> {
  const res = await fetch('/api/settings/fault-reminders', {
    method: 'POST',
    headers: await authHeaders(user),
    body: JSON.stringify(options),
  });
  return parseJson(res);
}

export async function sendTestEmail(user: User, to: string): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch(`/api/test-email?to=${encodeURIComponent(to)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await parseJson(res);
}

export async function notifyFaultCreated(faultId: string): Promise<void> {
  try {
    await fetch('/api/notifications/fault-created', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faultId }),
    });
  } catch (error) {
    console.warn('Fault notification request failed:', error);
  }
}

export function createRecipientId(): string {
  return crypto.randomUUID();
}
