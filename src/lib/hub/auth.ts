import type { HubMemberCategory, HubOrganizationPosition, HubRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { HUB_ROLE_PERMISSIONS, type HubPermission } from "@/lib/hub/permissions";

export const HUB_SESSION_COOKIE = "atlas_hub_session";
export const HUB_ACCOUNT_SESSION_COOKIE = "atlas_hub_account_session";
export const LEGACY_HUB_SESSION_COOKIE = "economik_session";
const SALT_ROUNDS = 12;
const DEFAULT_MAX_AGE_SECONDS = 86_400;

export class HubAccessError extends Error {
  constructor(message: string, readonly status: 401 | 403 = 401) {
    super(message);
    this.name = "HubAccessError";
  }
}

export type HubSessionPayload = {
  accountId?: string;
  accountSessionVersion?: number;
  memberId: string;
  organizationId: string;
  organizationSlug: string;
  email: string;
  role: HubRole;
  directorateId?: string | null;
  mustChangePassword: boolean;
  sessionVersion: number;
  iat: number;
  exp: number;
};

type LegacyHubSessionPayload = Omit<HubSessionPayload, "organizationId" | "organizationSlug"> & {
  organizationId?: string;
  organizationSlug?: string;
  workspaceId?: string;
};

type HubSessionCookieVerification = {
  payload: HubSessionPayload;
  acceptedWithLegacySecret: boolean;
  hasLegacyPayloadShape: boolean;
};

export type HubOrganizationContext = HubSessionPayload & {
  accountId: string;
  organization: {
    id: string;
    name: string;
    hubName: string;
    slug: string;
    logoUrl: string | null;
    timezone: string;
    locale: string;
    currency: string;
    isActive: boolean;
  };
  member: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    lastLoginAt: Date | null;
    directorateName: string | null;
    organizationPosition: HubOrganizationPosition;
    memberCategory: HubMemberCategory;
  };
  permissions: readonly HubPermission[];
};

type NewHubSession = Omit<HubSessionPayload, "iat" | "exp" | "accountId"> & { accountId: string };

export type HubAccountSessionPayload = {
  accountId: string;
  sessionVersion: number;
  mustChangePassword: boolean;
  iat: number;
  exp: number;
};

export function isHubSessionStateValid(
  signed: Pick<HubSessionPayload, "accountId" | "accountSessionVersion" | "organizationId" | "sessionVersion">,
  member: { accountId?: string | null; organizationId: string; sessionVersion: number; status: string; organization: { isActive: boolean }; account?: { status: string; sessionVersion: number } | null } | null,
) {
  return Boolean(member
    && member.status === "ACTIVE"
    && member.organization.isActive
    && member.organizationId === signed.organizationId
    && member.sessionVersion === signed.sessionVersion
    && (!signed.accountId || (member.accountId === signed.accountId
      && member.account?.status === "ACTIVE"
      && member.account.sessionVersion === signed.accountSessionVersion)));
}

function sessionMaxAgeSeconds() {
  const configured = Number(process.env.SESSION_MAX_AGE_SECONDS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_AGE_SECONDS;
}

function shouldUseSecureCookies() {
  return process.env.NODE_ENV === "production";
}

type HubSecretEnvironment = {
  ATLAS_HUB_AUTH_SECRET?: string;
  ECONOMIK_AUTH_SECRET?: string;
  AUTH_SECRET?: string;
  NODE_ENV?: string;
};

function assertSecretStrength(secret: string | undefined, variableName: string, production: boolean) {
  if (secret && production && secret.length < 32) {
    throw new Error(`${variableName} precisa ter pelo menos 32 caracteres em produção.`);
  }
}

export function resolveHubSessionSecrets(environment: HubSecretEnvironment = process.env) {
  const production = environment.NODE_ENV === "production";
  assertSecretStrength(environment.ATLAS_HUB_AUTH_SECRET, "ATLAS_HUB_AUTH_SECRET", production);
  assertSecretStrength(environment.ECONOMIK_AUTH_SECRET, "ECONOMIK_AUTH_SECRET", production);
  assertSecretStrength(environment.AUTH_SECRET, "AUTH_SECRET", production);

  const canonical = environment.ATLAS_HUB_AUTH_SECRET
    || environment.ECONOMIK_AUTH_SECRET
    || environment.AUTH_SECRET
    || (!production ? "hub-local-only-secret-change-before-production" : undefined);
  if (!canonical || canonical.length < 32) {
    throw new Error("ATLAS_HUB_AUTH_SECRET precisa ter pelo menos 32 caracteres em produção.");
  }

  const legacy = Array.from(new Set([
    environment.ECONOMIK_AUTH_SECRET,
    environment.AUTH_SECRET,
    environment.ATLAS_HUB_AUTH_SECRET,
    canonical,
    ...(!production ? ["economik-local-only-secret-change-before-production"] : []),
  ].filter((secret): secret is string => Boolean(secret))));
  return { canonical, legacy };
}

function signature(encodedPayload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export async function hashHubPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyHubPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function encodeHubSession(payload: HubSessionPayload, secret = resolveHubSessionSecrets().canonical) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

function decodeSignedHubSession(token: string, secret: string, nowSeconds: number, requireLegacyShape: boolean): HubSessionPayload | null {
  try {
    const [encodedPayload, suppliedSignature, extra] = token.split(".");
    if (!encodedPayload || !suppliedSignature || extra) return null;
    const supplied = Buffer.from(suppliedSignature, "base64url");
    const expected = Buffer.from(signature(encodedPayload, secret), "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    const legacyPayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LegacyHubSessionPayload;
    const hasLegacyShape = typeof legacyPayload.workspaceId === "string"
      || !legacyPayload.organizationId
      || !legacyPayload.organizationSlug;
    if (requireLegacyShape && !hasLegacyShape) return null;
    const organizationId = legacyPayload.organizationId || legacyPayload.workspaceId;
    if (!organizationId || !legacyPayload.memberId) return null;
    const payload: HubSessionPayload = {
      ...legacyPayload,
      organizationId,
      organizationSlug: legacyPayload.organizationSlug || "",
    };
    delete (payload as HubSessionPayload & { workspaceId?: string }).workspaceId;
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > nowSeconds || payload.exp <= nowSeconds) return null;
    if (!Number.isInteger(payload.sessionVersion) || payload.sessionVersion < 1) return null;
    return payload;
  } catch {
    return null;
  }
}

export function decodeHubSession(token: string, secret = resolveHubSessionSecrets().canonical, nowSeconds = Math.floor(Date.now() / 1000)): HubSessionPayload | null {
  return decodeSignedHubSession(token, secret, nowSeconds, false);
}

export function decodeLegacyHubSession(token: string, secrets = resolveHubSessionSecrets().legacy, nowSeconds = Math.floor(Date.now() / 1000)) {
  for (const secret of secrets) {
    const payload = decodeSignedHubSession(token, secret, nowSeconds, true);
    if (payload) return payload;
  }
  return null;
}

export function verifyHubSessionCookie(
  token: string,
  cookieName: typeof HUB_SESSION_COOKIE | typeof LEGACY_HUB_SESSION_COOKIE,
  secrets = resolveHubSessionSecrets(),
  nowSeconds = Math.floor(Date.now() / 1000),
): HubSessionCookieVerification | null {
  if (cookieName === HUB_SESSION_COOKIE) {
    const canonical = decodeHubSession(token, secrets.canonical, nowSeconds);
    if (canonical) return { payload: canonical, acceptedWithLegacySecret: false, hasLegacyPayloadShape: hasLegacyHubSessionPayloadShape(token) };
  }
  const legacySecrets = cookieName === HUB_SESSION_COOKIE
    ? secrets.legacy.filter((secret) => secret !== secrets.canonical)
    : secrets.legacy;
  const legacy = decodeLegacyHubSession(token, legacySecrets, nowSeconds);
  return legacy ? { payload: legacy, acceptedWithLegacySecret: true, hasLegacyPayloadShape: true } : null;
}

function hasLegacyHubSessionPayloadShape(token: string) {
  try {
    const encodedPayload = token.split(".")[0];
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LegacyHubSessionPayload;
    return typeof payload.workspaceId === "string" || !payload.organizationId || !payload.organizationSlug;
  } catch {
    return false;
  }
}

export async function createHubSession(payload: NewHubSession) {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = sessionMaxAgeSeconds();
  const token = encodeHubSession({ ...payload, iat: now, exp: now + maxAge });
  const cookieStore = await cookies();
  cookieStore.set(HUB_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge,
    expires: new Date((now + maxAge) * 1000),
  });
}

export async function createHubAccountSession(payload: Omit<HubAccountSessionPayload, "iat" | "exp">) {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = sessionMaxAgeSeconds();
  const fullPayload = { ...payload, iat: now, exp: now + maxAge };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const token = `${encodedPayload}.${signature(encodedPayload, resolveHubSessionSecrets().canonical)}`;
  const cookieStore = await cookies();
  cookieStore.set(HUB_ACCOUNT_SESSION_COOKIE, token, {
    httpOnly: true, secure: shouldUseSecureCookies(), sameSite: "lax", path: "/", maxAge,
    expires: new Date((now + maxAge) * 1000),
  });
}

export async function getHubAccountSession(): Promise<HubAccountSessionPayload | null> {
  const token = (await cookies()).get(HUB_ACCOUNT_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const [encodedPayload, suppliedSignature, extra] = token.split(".");
    if (!encodedPayload || !suppliedSignature || extra) return null;
    const supplied = Buffer.from(suppliedSignature, "base64url");
    const expected = Buffer.from(signature(encodedPayload, resolveHubSessionSecrets().canonical), "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as HubAccountSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.accountId || !Number.isInteger(payload.sessionVersion) || payload.iat > now || payload.exp <= now) return null;
    const account = await prisma.hubAccount.findUnique({ where: { id: payload.accountId }, select: { status: true, sessionVersion: true, mustChangePassword: true } });
    if (!account || account.status !== "ACTIVE" || account.sessionVersion !== payload.sessionVersion) return null;
    return { ...payload, mustChangePassword: account.mustChangePassword };
  } catch {
    return null;
  }
}

export async function destroyHubAccountSession() {
  const cookieStore = await cookies();
  cookieStore.set(HUB_ACCOUNT_SESSION_COOKIE, "", {
    httpOnly: true, secure: shouldUseSecureCookies(), sameSite: "lax", path: "/", expires: new Date(0), maxAge: 0,
  });
}

type HubCookieStore = Awaited<ReturnType<typeof cookies>>;

export function migrateLegacyHubSessionCookies(cookieStore: Pick<HubCookieStore, "set">, payload: HubSessionPayload, nowSeconds = Math.floor(Date.now() / 1000)) {
  const maxAge = Math.max(0, payload.exp - nowSeconds);
  if (!maxAge) return;
  cookieStore.set(HUB_SESSION_COOKIE, encodeHubSession(payload), {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge,
    expires: new Date(payload.exp * 1000),
  });
  cookieStore.set(LEGACY_HUB_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function getHubOrganizationContext(options: { migrateLegacyCookie?: boolean } = {}): Promise<HubOrganizationContext | null> {
  const cookieStore = await cookies();
  const canonicalToken = cookieStore.get(HUB_SESSION_COOKIE)?.value;
  const legacyToken = canonicalToken ? undefined : cookieStore.get(LEGACY_HUB_SESSION_COOKIE)?.value;
  const verification = canonicalToken
    ? verifyHubSessionCookie(canonicalToken, HUB_SESSION_COOKIE)
    : legacyToken ? verifyHubSessionCookie(legacyToken, LEGACY_HUB_SESSION_COOKIE) : null;
  if (!verification) return null;
  const signed = verification.payload;

  const member = await prisma.hubMember.findUnique({
    where: { id: signed.memberId },
    select: {
      email: true,
      role: true,
      status: true,
      organizationId: true,
      directorateId: true,
      mustChangePassword: true,
      sessionVersion: true,
      accountId: true,
      account: { select: { status: true, sessionVersion: true, mustChangePassword: true } },
      name: true,
      avatarUrl: true,
      lastLoginAt: true,
      organizationPosition: true,
      memberCategory: true,
      directorate: { select: { name: true } },
      organization: {
        select: {
          id: true,
          name: true,
          hubName: true,
          slug: true,
          logoUrl: true,
          timezone: true,
          locale: true,
          currency: true,
          isActive: true,
        },
      },
    },
  });

  if (!member?.accountId || !member.account || !isHubSessionStateValid(signed, member)) return null;

  const payload: HubSessionPayload = {
    ...signed,
    accountId: member.accountId,
    accountSessionVersion: member.account.sessionVersion,
    organizationSlug: member.organization.slug,
    email: member.email,
    role: member.role,
    directorateId: member.directorateId,
    mustChangePassword: member.account.mustChangePassword,
  };
  if (options.migrateLegacyCookie && (verification.acceptedWithLegacySecret || verification.hasLegacyPayloadShape)) {
    migrateLegacyHubSessionCookies(cookieStore, payload);
  }
  return {
    ...payload,
    accountId: member.accountId,
    organization: member.organization,
    member: {
      id: signed.memberId,
      name: member.name,
      email: member.email,
      avatarUrl: member.avatarUrl,
      lastLoginAt: member.lastLoginAt,
      directorateName: member.directorate?.name || null,
      organizationPosition: member.organizationPosition,
      memberCategory: member.memberCategory,
    },
    permissions: HUB_ROLE_PERMISSIONS[member.role],
  };
}

export async function getHubSession(): Promise<HubSessionPayload | null> {
  const context = await getHubOrganizationContext();
  if (!context) return null;
  return {
    accountId: context.accountId,
    accountSessionVersion: context.accountSessionVersion,
    memberId: context.memberId,
    organizationId: context.organizationId,
    organizationSlug: context.organizationSlug,
    email: context.email,
    role: context.role,
    directorateId: context.directorateId,
    mustChangePassword: context.mustChangePassword,
    sessionVersion: context.sessionVersion,
    iat: context.iat,
    exp: context.exp,
  };
}

export async function destroyHubSession() {
  const cookieStore = await cookies();
  cookieStore.set(HUB_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  cookieStore.set(LEGACY_HUB_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  cookieStore.set(HUB_ACCOUNT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function requireHubMember(options: { allowPasswordChangeRequired?: boolean } = {}) {
  const session = await getHubOrganizationContext({ migrateLegacyCookie: true });
  if (!session) throw new HubAccessError("Não autenticado.", 401);
  if (session.mustChangePassword && !options.allowPasswordChangeRequired) {
    throw new HubAccessError("Altere sua senha antes de continuar.", 403);
  }
  return session;
}

export async function requireHubPermission(permission: HubPermission) {
  const session = await requireHubMember();
  if (!session.permissions.includes(permission)) throw new HubAccessError("Acesso negado.", 403);
  return session;
}

export function isHubAdminRole(role: string | null | undefined) {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "FINANCE";
}

export async function requireHubAdmin() {
  return requireHubPermission("admin:access");
}
