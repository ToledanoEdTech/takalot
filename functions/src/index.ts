import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as nodemailer from 'nodemailer';

initializeApp();

const smtpHost = defineSecret('SMTP_HOST');
const smtpPort = defineSecret('SMTP_PORT');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const emailFrom = defineString('EMAIL_FROM', { default: 'takalot@zvialod.com' });
const appUrl = defineString('APP_URL', { default: 'https://takalot-beige.vercel.app' });

const NOTIFICATION_SETTINGS_PATH = 'settings/notifications';

type FaultCategory = 'general' | 'computer';

interface FaultData {
  title?: string;
  description?: string;
  location?: string;
  reporterName?: string;
  category?: FaultCategory;
  hasImage?: boolean;
  imageUrl?: string;
}

interface EmailRecipient {
  id: string;
  name: string;
  email: string;
  categories: FaultCategory[];
}

interface NotificationSettings {
  enabled: boolean;
  recipients: EmailRecipient[];
}

function categoryLabel(category: FaultCategory): string {
  return category === 'computer' ? 'תקלת מחשבים' : 'תקלה כללית';
}

function buildEmailHtml(fault: FaultData, faultId: string): string {
  const category = fault.category ?? 'general';
  const hasImage = fault.hasImage || !!fault.imageUrl;

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4338ca;">תקלה חדשה דווחה במערכת</h2>
      <p style="color: #64748b; font-size: 14px;">סוג: <strong>${categoryLabel(category)}</strong></p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; background: #f8fafc; font-weight: bold; width: 120px;">נושא</td>
          <td style="padding: 8px; background: #f8fafc;">${fault.title ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">מיקום</td>
          <td style="padding: 8px;">${fault.location ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f8fafc; font-weight: bold;">מדווח</td>
          <td style="padding: 8px; background: #f8fafc;">${fault.reporterName ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">תיאור</td>
          <td style="padding: 8px;">${fault.description || 'ללא תיאור'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f8fafc; font-weight: bold;">תמונה</td>
          <td style="padding: 8px; background: #f8fafc;">${hasImage ? 'יש תמונה מצורפת — צפו באתר' : 'אין'}</td>
        </tr>
      </table>
      <p>
        <a href="${appUrl.value()}" style="display: inline-block; background: #4338ca; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          כניסה למערכת התקלות
        </a>
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">מזהה תקלה: ${faultId}</p>
    </div>
  `;
}

function getRecipientsForCategory(
  settings: NotificationSettings,
  category: FaultCategory
): string[] {
  const emails = settings.recipients
    .filter((r) => Array.isArray(r.categories) && r.categories.includes(category))
    .map((r) => r.email.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(emails)];
}

async function loadNotificationSettings(): Promise<NotificationSettings | null> {
  const snap = await getFirestore().doc(NOTIFICATION_SETTINGS_PATH).get();
  if (!snap.exists) return null;
  return snap.data() as NotificationSettings;
}

export const notifyOnNewFault = onDocumentCreated(
  {
    document: 'faults/{faultId}',
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass],
  },
  async (event) => {
    const fault = event.data?.data() as FaultData | undefined;
    if (!fault) return;

    const settings = await loadNotificationSettings();
    if (!settings?.enabled) {
      console.log('Email notifications disabled — skipping');
      return;
    }

    const faultId = event.params.faultId;
    const category = fault.category ?? 'general';
    const categoryText = categoryLabel(category);

    const recipients = getRecipientsForCategory(settings, category);
    if (recipients.length === 0) {
      console.warn(`No recipients configured for category "${category}" — skipping notification`);
      return;
    }

    const port = parseInt(smtpPort.value(), 10) || 587;
    const transporter = nodemailer.createTransport({
      host: smtpHost.value(),
      port,
      secure: port === 465,
      auth: {
        user: smtpUser.value(),
        pass: smtpPass.value(),
      },
    });

    const subject = `[תקלה חדשה] ${categoryText}: ${fault.title ?? 'ללא כותרת'}`;
    const html = buildEmailHtml(fault, faultId);

    await transporter.sendMail({
      from: `"מערכת תקלות ישיבת צביה" <${emailFrom.value()}>`,
      to: recipients.join(', '),
      subject,
      html,
    });

    console.log(`Notification sent for fault ${faultId} (${category}) to ${recipients.join(', ')}`);
  }
);
