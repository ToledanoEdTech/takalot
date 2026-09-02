export function getIsraelYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

export function addDaysToYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function timestampToIsraelYmd(value: unknown): string | null {
  if (!value) return null;

  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'object' && value !== null) {
    const maybe = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof maybe.toDate === 'function') {
      date = maybe.toDate();
    } else {
      const seconds = maybe.seconds ?? maybe._seconds;
      if (typeof seconds === 'number') date = new Date(seconds * 1000);
    }
  } else if (typeof value === 'string') {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  return getIsraelYmd(date);
}

export function isActiveFaultStatus(status: string): boolean {
  return status === 'open' || status === 'in_progress';
}
