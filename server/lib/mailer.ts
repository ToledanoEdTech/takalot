import nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendMailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

function getCreateTransport() {
  const mod = nodemailer as unknown as {
    createTransport?: typeof nodemailer.createTransport;
    default?: { createTransport: typeof nodemailer.createTransport };
  };
  const fn = mod.createTransport ?? mod.default?.createTransport;
  if (!fn) {
    throw new Error('nodemailer.createTransport is unavailable');
  }
  return fn;
}

function getSmtpConfig() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_APP_PASSWORD must be configured');
  }

  return { user, pass, from: from! };
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  try {
    const { user, pass, from } = getSmtpConfig();
    const transport = getCreateTransport()({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user, pass },
    });

    const info = await transport.sendMail({
      from: `"מערכת תקלות ישיבת צביה" <${from}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS));
}
