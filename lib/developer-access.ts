const developerEmails = [
  // Add developer emails here to unlock the full lesson path.
  "insidethebox4080@gmail.com",
] as const;

function normalizeDeveloperEmail(email: string) {
  return email.trim().toLowerCase();
}

const developerEmailSet = new Set(
  developerEmails.map((email) => normalizeDeveloperEmail(email)),
);

export const DEVELOPER_EMAILS = developerEmails;

export function isDeveloperEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return developerEmailSet.has(normalizeDeveloperEmail(email));
}

export function hasDeveloperOverride(email: string | null | undefined) {
  return isDeveloperEmail(email);
}
