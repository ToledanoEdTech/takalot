import type { EmailRecipient } from '../types';

export const HOUSE_FATHER_RECIPIENT_ID = 'role-house-father';
export const COMPUTER_TECH_RECIPIENT_ID = 'role-computer-tech';

export interface RoleContact {
  name: string;
  email: string;
}

export function emptyRoleContact(): RoleContact {
  return { name: '', email: '' };
}

export function splitRecipientsByRole(recipients: EmailRecipient[]) {
  let houseFather = recipients.find((r) => r.id === HOUSE_FATHER_RECIPIENT_ID);
  let computerTech = recipients.find((r) => r.id === COMPUTER_TECH_RECIPIENT_ID);
  const usedIds = new Set<string>();

  if (houseFather) {
    usedIds.add(houseFather.id);
  } else {
    const legacy = recipients.find(
      (r) => r.categories.length === 1 && r.categories[0] === 'general'
    );
    if (legacy) {
      houseFather = legacy;
      usedIds.add(legacy.id);
    }
  }

  if (computerTech) {
    usedIds.add(computerTech.id);
  } else {
    const legacy = recipients.find(
      (r) =>
        r.categories.length === 1 &&
        r.categories[0] === 'computer' &&
        !usedIds.has(r.id)
    );
    if (legacy) {
      computerTech = legacy;
      usedIds.add(legacy.id);
    }
  }

  const extraRecipients = recipients.filter((r) => !usedIds.has(r.id));

  return {
    houseFatherContact: houseFather
      ? { name: houseFather.name, email: houseFather.email }
      : emptyRoleContact(),
    computerTechContact: computerTech
      ? { name: computerTech.name, email: computerTech.email }
      : emptyRoleContact(),
    extraRecipients,
  };
}

export function buildRecipientsFromRoles(
  houseFather: RoleContact,
  computerTech: RoleContact,
  extraRecipients: EmailRecipient[]
): EmailRecipient[] {
  const recipients: EmailRecipient[] = [];

  if (houseFather.email.trim()) {
    recipients.push({
      id: HOUSE_FATHER_RECIPIENT_ID,
      name: houseFather.name.trim() || 'אב הבית',
      email: houseFather.email.trim().toLowerCase(),
      categories: ['general'],
    });
  }

  if (computerTech.email.trim()) {
    recipients.push({
      id: COMPUTER_TECH_RECIPIENT_ID,
      name: computerTech.name.trim() || 'איש מחשבים',
      email: computerTech.email.trim().toLowerCase(),
      categories: ['computer'],
    });
  }

  for (const extra of extraRecipients) {
    if (
      extra.id === HOUSE_FATHER_RECIPIENT_ID ||
      extra.id === COMPUTER_TECH_RECIPIENT_ID
    ) {
      continue;
    }
    recipients.push(extra);
  }

  return recipients;
}
