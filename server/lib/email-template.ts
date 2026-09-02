import type { ReminderFaultItem, ReminderKind } from '../../shared/notification-types.js';
import { categoryLabel } from '../../shared/notification-types.js';

const MAX_ITEMS_IN_BODY = 5;

function kindLabel(kind: ReminderKind, daysBefore?: number): string {
  if (kind === 'instant') return 'תקלה חדשה';
  if (kind === 'post-due') return 'תזכורת — תקלה פתוחה מאתמול';
  return `תזכורת — ${daysBefore} ימים מתקלת הדיווח`;
}

function statusLabel(status: string): string {
  if (status === 'in_progress') return 'בטיפול';
  if (status === 'fixed') return 'טופל';
  return 'פתוח';
}

function renderItemsHtml(items: ReminderFaultItem[]): string {
  const visible = items.slice(0, MAX_ITEMS_IN_BODY);
  const remaining = items.length - visible.length;

  const rows = visible
    .map(
      (item) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${item.title}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${categoryLabel(item.category)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${item.location}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${statusLabel(item.status)}</td>
      </tr>`
    )
    .join('');

  const more =
    remaining > 0
      ? `<p style="color:#64748b;font-size:14px;margin-top:12px;">ועוד ${remaining} תקלות...</p>`
      : '';

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
      <thead>
        <tr style="background:#f8fafc;text-align:right;">
          <th style="padding:10px;">נושא</th>
          <th style="padding:10px;">סוג</th>
          <th style="padding:10px;">מיקום</th>
          <th style="padding:10px;">סטטוס</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${more}
  `;
}

function renderItemsText(items: ReminderFaultItem[]): string {
  const visible = items.slice(0, MAX_ITEMS_IN_BODY);
  const lines = visible.map(
    (item, i) =>
      `${i + 1}. ${item.title} (${categoryLabel(item.category)}) — ${item.location} — ${statusLabel(item.status)}`
  );
  const remaining = items.length - visible.length;
  if (remaining > 0) lines.push(`...ועוד ${remaining} תקלות`);
  return lines.join('\n');
}

export function renderFaultNotificationEmail(input: {
  recipientName: string;
  items: ReminderFaultItem[];
  appUrl: string;
}) {
  const primaryKind = input.items[0]?.kind ?? 'instant';
  const kindText = kindLabel(primaryKind, input.items[0]?.daysBefore);
  const count = input.items.length;

  const subject =
    primaryKind === 'instant'
      ? `[תקלה חדשה] ${input.items[0]?.title ?? 'דיווח חדש'}`
      : `[תזכורת תקלות] ${count} תקלות ממתינות לטיפול`;

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
      <h2 style="color:#4338ca;margin-bottom:8px;">${kindText}</h2>
      <p style="color:#475569;">שלום ${input.recipientName},</p>
      <p style="color:#475569;">${count === 1 ? 'יש תקלה אחת' : `יש ${count} תקלות`} שדורשות את תשומת לבך:</p>
      ${renderItemsHtml(input.items)}
      <p style="margin-top:24px;">
        <a href="${input.appUrl}" style="display:inline-block;background:#4338ca;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          כניסה למערכת התקלות
        </a>
      </p>
    </div>
  `;

  const text = [
    kindText,
    `שלום ${input.recipientName},`,
    count === 1 ? 'יש תקלה אחת שדורשת את תשומת לבך:' : `יש ${count} תקלות שדורשות את תשומת לבך:`,
    renderItemsText(input.items),
    `לכניסה למערכת: ${input.appUrl}`,
  ].join('\n\n');

  return { subject, html, text };
}

export function renderTestEmail(appUrl: string) {
  return renderFaultNotificationEmail({
    recipientName: 'מנהל המערכת',
    items: [
      {
        faultId: 'test',
        title: 'מייל בדיקה — מערכת התקלות',
        location: 'בניין ראשי',
        reporterName: 'בדיקה',
        description: 'זהו מייל בדיקה.',
        category: 'general',
        status: 'open',
        createdAtYmd: new Date().toISOString().slice(0, 10),
        kind: 'instant',
      },
    ],
    appUrl,
  });
}
