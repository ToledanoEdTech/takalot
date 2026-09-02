import nodemailer from 'nodemailer';

function getCreateTransport() {
  const fn = nodemailer.createTransport ?? nodemailer.default?.createTransport;
  if (!fn) {
    throw new Error('nodemailer.createTransport is unavailable');
  }
  return fn;
}

function getSmtpConfig() {
  const user = process.env.SMTP_USER?.trim();
  const pass = (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const from = (process.env.MAIL_FROM || user || '').trim();

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_APP_PASSWORD must be configured');
  }

  return { user, pass, from };
}

export async function sendMail(input) {
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

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_USER && (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS));
}
