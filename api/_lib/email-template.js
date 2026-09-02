import { categoryLabel } from './notification-types.js';

const MAX_ITEMS_IN_BODY = 5;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function kindLabel(kind, daysBefore) {
  if (kind === 'instant') return 'תקלה חדשה';
  if (kind === 'post-due') return 'תזכורת — תקלה פתוחה מאתמול';
  return `תזכורת — ${daysBefore} ימים מתקלת הדיווח`;
}

function statusLabel(status) {
  if (status === 'in_progress') return 'בטיפול';
  if (status === 'fixed') return 'טופל';
  return 'פתוח';
}

function renderItemsHtml(items) {
  const visible = items.slice(0, MAX_ITEMS_IN_BODY);
  const remaining = items.length - visible.length;

  const rows = visible
    .map(
      (item) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(item.title)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(categoryLabel(item.category))}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.location)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(statusLabel(item.status))}</td>
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

function renderItemsText(items) {
  const visible = items.slice(0, MAX_ITEMS_IN_BODY);
  const lines = visible.map(
    (item, i) =>
      `${i + 1}. ${item.title} (${categoryLabel(item.category)}) — ${item.location} — ${statusLabel(item.status)}`
  );
  const remaining = items.length - visible.length;
  if (remaining > 0) lines.push(`...ועוד ${remaining} תקלות`);
  return lines.join('\n');
}

export function renderFaultNotificationEmail(input) {
  const primaryKind = input.items[0]?.kind ?? 'instant';
  const kindText = kindLabel(primaryKind, input.items[0]?.daysBefore);
  const count = input.items.length;
  const first = input.items[0];

  const subject =
    primaryKind === 'instant'
      ? `מערכת תקלות | תקלה חדשה: ${first?.title ?? 'דיווח חדש'}`
      : `מערכת תקלות | תזכורת: ${count} תקלות ממתינות לטיפול`;

  const details = input.items
    .slice(0, MAX_ITEMS_IN_BODY)
    .map((item) => {
      const desc = item.description ? `<p style="margin:8px 0 0;color:#334155;">${escapeHtml(item.description)}</p>` : '';
      return `
        <p style="margin:0 0 16px;">
          <strong>${escapeHtml(item.title)}</strong><br/>
          סוג: ${escapeHtml(categoryLabel(item.category))}<br/>
          מיקום: ${escapeHtml(item.location)}<br/>
          מדווח: ${escapeHtml(item.reporterName || '—')}<br/>
          סטטוס: ${escapeHtml(statusLabel(item.status))}
          ${desc}
        </p>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;direction:rtl;text-align:right;">
  <p style="margin:0 0 16px;font-size:18px;font-weight:bold;">מערכת דיווחי תקלות — ישיבת צביה אלישיב</p>
  <p>שלום ${escapeHtml(input.recipientName)},</p>
  <p>${escapeHtml(kindText)}.</p>
  ${details}
  <p>לצפייה במערכת: ${escapeHtml(input.appUrl)}</p>
  <p style="color:#64748b;font-size:13px;">הודעה זו נשלחה אוטומטית ממערכת דיווח התקלות של הישיבה, לא ממערכת הבגרות.</p>
</body>
</html>`;

  const text = [
    'מערכת דיווחי תקלות — ישיבת צביה אלישיב',
    '',
    `שלום ${input.recipientName},`,
    '',
    kindText,
    '',
    renderItemsText(input.items),
    '',
    `לצפייה במערכת: ${input.appUrl}`,
    '',
    'הודעה זו נשלחה אוטומטית ממערכת דיווח התקלות של הישיבה, לא ממערכת הבגרות.',
  ].join('\n');

  return { subject, html, text };
}

export function renderTestEmail(appUrl) {
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
