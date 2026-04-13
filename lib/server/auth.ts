import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { SESSION_COOKIE_NAME } from "@/lib/auth-routes";
import {
  createSession as createSessionRecord,
  deleteSessionById,
  deleteSessionsByTokenHash,
  getSessionByTokenHash,
  type UserRecord,
  updateSessionExpiry,
} from "@/lib/server/data-store";
import { isDeveloperEmail } from "@/lib/developer-access";
import { getServerEnv } from "@/lib/server/env";
import type { AuthUser } from "@/types/auth";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 7;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionExpiryDate() {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

export function toAuthUser(
  user: Pick<UserRecord, "id" | "email" | "username" | "currentLeague">,
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    currentLeague: user.currentLeague,
    isDeveloper: isDeveloperEmail(user.email),
  };
}

function getCookieSecureFlag() {
  const env = getServerEnv();
  return env.SESSION_COOKIE_SECURE === "true";
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createUserSession(userId: string) {
  const env = getServerEnv();
  const token = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
  const expiresAt = sessionExpiryDate();

  await createSessionRecord({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return {
    token: `${token}.${signature}`,
    rawToken: token,
    expiresAt,
  };
}

export async function deleteSessionByRawToken(rawToken: string) {
  await deleteSessionsByTokenHash(hashSessionToken(rawToken));
}

export function applySessionCookie(
  response: NextResponse,
  session: { token: string; expiresAt: Date },
) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    sameSite: "lax",
    secure: getCookieSecureFlag(),
    path: "/",
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: getCookieSecureFlag(),
    path: "/",
    expires: new Date(0),
  });
}

function splitSignedToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  const [rawToken, signature] = token.split(".");

  if (!rawToken || !signature) {
    return null;
  }

  return {
    rawToken,
    signature,
  };
}

function isSignedTokenValid(token: string | undefined | null) {
  const env = getServerEnv();
  const signedToken = splitSignedToken(token);

  if (!signedToken) {
    return null;
  }

  const expectedSignature = createHmac("sha256", env.SESSION_SECRET)
    .update(signedToken.rawToken)
    .digest("hex");

  if (signedToken.signature !== expectedSignature) {
    return null;
  }

  return signedToken;
}

type SessionValidationResult = {
  user: AuthUser | null;
  shouldClearCookie: boolean;
  shouldRefreshCookie: boolean;
  session: { token: string; expiresAt: Date } | null;
};

export async function validateSessionToken(
  token: string | undefined | null,
): Promise<SessionValidationResult> {
  const signedToken = isSignedTokenValid(token);

  if (!signedToken) {
    return {
      user: null,
      shouldClearCookie: Boolean(token),
      shouldRefreshCookie: false,
      session: null,
    };
  }

  const session = await getSessionByTokenHash(hashSessionToken(signedToken.rawToken));

  if (!session) {
    return {
      user: null,
      shouldClearCookie: true,
      shouldRefreshCookie: false,
      session: null,
    };
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await deleteSessionById(session.id);

    return {
      user: null,
      shouldClearCookie: true,
      shouldRefreshCookie: false,
      session: null,
    };
  }

  const shouldRefreshCookie =
    session.expiresAt.getTime() - Date.now() <= SESSION_REFRESH_THRESHOLD_MS;

  if (!shouldRefreshCookie) {
    return {
      user: toAuthUser(session.user),
      shouldClearCookie: false,
      shouldRefreshCookie: false,
      session: {
        token: `${signedToken.rawToken}.${signedToken.signature}`,
        expiresAt: session.expiresAt,
      },
    };
  }

  const expiresAt = sessionExpiryDate();

  await updateSessionExpiry(session.id, expiresAt);

  return {
    user: toAuthUser(session.user),
    shouldClearCookie: false,
    shouldRefreshCookie: true,
    session: {
      token: `${signedToken.rawToken}.${signedToken.signature}`,
      expiresAt,
    },
  };
}

export async function getCurrentUserFromCookies(cookieStore: Pick<ReadonlyRequestCookies, "get">) {
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const result = await validateSessionToken(token);
  return result.user;
}

export async function touchSessionOnResponse(
  response: NextResponse,
  token: string | undefined,
) {
  const sessionResult = await validateSessionToken(token);

  if (sessionResult.shouldClearCookie) {
    clearSessionCookie(response);
  }

  if (sessionResult.shouldRefreshCookie && sessionResult.session) {
    applySessionCookie(response, sessionResult.session);
  }

  return sessionResult;
}

export function getRawSessionToken(token: string | undefined | null) {
  return splitSignedToken(token)?.rawToken ?? null;
}

export function getSessionTokenFromRequest(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .find((entry) => entry.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
}
