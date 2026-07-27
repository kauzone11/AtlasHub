import crypto from "node:crypto";

export const HUB_INVITATION_TOKEN_BYTES = 32;

export function generateHubInvitationToken() {
  return crypto.randomBytes(HUB_INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashHubInvitationToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationTokenHashesMatch(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function hubInvitationTtlHours() {
  const configured = Number(process.env.HUB_INVITATION_TTL_HOURS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 24 * 30 ? configured : 72;
}

export function hubInvitationExpiresAt(now = new Date()) {
  return new Date(now.getTime() + hubInvitationTtlHours() * 60 * 60 * 1000);
}
