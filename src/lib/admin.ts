const ADMIN_EMAILS = new Set(['yosseftole@zvialod.com', 'yossitole@gmail.com']);

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && ADMIN_EMAILS.has(email.toLowerCase()));
}
