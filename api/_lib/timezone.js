export function getIsraelYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

export function addDaysToYmd(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function timestampToIsraelYmd(value) {
  if (!value) return null;

  let date = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      date = value.toDate();
    } else {
      const seconds = value.seconds ?? value._seconds;
      if (typeof seconds === 'number') date = new Date(seconds * 1000);
    }
  } else if (typeof value === 'string') {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  return getIsraelYmd(date);
}

export function isActiveFaultStatus(status) {
  return status === 'open' || status === 'in_progress';
}
