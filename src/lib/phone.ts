export function normalizeEmailAddress(address: string): string {
  const match = address.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return address.trim().toLowerCase();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeUsPhone(digits: string): string {
  let d = digitsOnly(digits);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
}

export function getPhoneDigitsFromEnv(): string {
  const phoneEmail = process.env.PHONE_EMAIL?.trim();
  if (!phoneEmail) throw new Error("PHONE_EMAIL is not set.");
  const local = phoneEmail.split("@")[0] || "";
  const digits = normalizeUsPhone(local);
  if (digits.length !== 10) {
    throw new Error("PHONE_EMAIL must contain a 10-digit US phone number.");
  }
  return digits;
}

export function getPhoneEmail(): string {
  const phoneEmail = process.env.PHONE_EMAIL?.trim();
  if (!phoneEmail) throw new Error("PHONE_EMAIL is not set.");
  return normalizeEmailAddress(phoneEmail);
}

export const GOOGLE_VOICE_DOMAIN = "txt.voice.google.com";
export const GOOGLE_VOICE_ADDR_RE = /[\w.+-]+@txt\.voice\.google\.com/gi;

export function isGoogleVoiceAddress(address: string): boolean {
  return normalizeEmailAddress(address).endsWith("@" + GOOGLE_VOICE_DOMAIN);
}

export function googleVoiceSenderDigits(address: string): string | null {
  const normalized = normalizeEmailAddress(address);
  if (!isGoogleVoiceAddress(normalized)) return null;
  const local = normalized.split("@")[0] || "";
  const parts = local.split(".");
  if (parts.length < 2) return null;
  const mine = getPhoneDigitsFromEnv();
  for (const part of parts.slice(0, 2)) {
    if (normalizeUsPhone(part) === mine) return part;
  }
  return null;
}

export function isFromMyPhone(address: string): boolean {
  const normalized = normalizeEmailAddress(address);
  if (normalized === getPhoneEmail()) return true;
  const sender = googleVoiceSenderDigits(address);
  if (sender && normalizeUsPhone(sender) === getPhoneDigitsFromEnv()) return true;
  const localDigits = normalizeUsPhone(normalized.split("@")[0] || "");
  return Boolean(localDigits) && localDigits === getPhoneDigitsFromEnv();
}

export function findGoogleVoiceReplyAddress(
  headers: Record<string, string>,
  body: string,
): string | null {
  const headerText = Object.values(headers).join(" ");
  for (const source of [headerText, body]) {
    const matches = source.match(GOOGLE_VOICE_ADDR_RE) || [];
    for (const match of matches) {
      if (googleVoiceSenderDigits(match) !== null) {
        return normalizeEmailAddress(match);
      }
    }
  }
  return null;
}

export function assertAllowedRecipient(toAddress: string): string {
  const normalized = normalizeEmailAddress(toAddress);
  if (normalized === getPhoneEmail()) return normalized;
  const sender = googleVoiceSenderDigits(normalized);
  if (sender && normalizeUsPhone(sender) === getPhoneDigitsFromEnv()) {
    return normalized;
  }
  throw new Error(
    `Refusing to send to ${toAddress}. Only your phone or Google Voice relay is allowed.`,
  );
}
