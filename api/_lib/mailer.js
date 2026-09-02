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

  return { user, pass, from: from || user };
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
      from: {
        name: 'מערכת תקלות ישיבת צביה',
        address: user,
      },
      replyTo: from || user,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      envelope: {
        from: user,
        to: [input.to],
      },
    });

    const accepted = (info.accepted || []).map((entry) => (typeof entry === 'string' ? entry : entry.address));
    console.log(
      'SMTP send',
      JSON.stringify({
        to: input.to,
        accepted,
        rejected: info.rejected,
        response: info.response,
        messageId: info.messageId,
      })
    );

    if (accepted.length === 0) {
      return {
        ok: false,
        error: `Gmail did not accept the recipient (${info.response || 'no SMTP response'})`,
      };
    }

    return { ok: true, messageId: info.messageId, accepted };
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
