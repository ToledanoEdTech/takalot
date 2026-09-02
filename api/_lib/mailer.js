import nodemailer from 'nodemailer';

const FROM_NAME = 'מערכת תקלות ישיבת צביה';
const FROM_ADDRESS = 'takalot@zvialod.com';

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
  const configuredFrom = process.env.MAIL_FROM?.trim();
  const fromAddress =
    configuredFrom && /takalot/i.test(configuredFrom) ? configuredFrom : FROM_ADDRESS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_APP_PASSWORD must be configured');
  }

  return { user, pass, fromAddress };
}

export async function sendMail(input) {
  try {
    const { user, pass, fromAddress } = getSmtpConfig();
    const transport = getCreateTransport()({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user, pass },
    });

    const info = await transport.sendMail({
      from: {
        name: FROM_NAME,
        address: fromAddress,
      },
      replyTo: fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    const accepted = (info.accepted || []).map((entry) => (typeof entry === 'string' ? entry : entry.address));
    console.log(
      'SMTP send',
      JSON.stringify({
        to: input.to,
        from: fromAddress,
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
