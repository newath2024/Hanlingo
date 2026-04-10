import { NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import { clearSessionCookie, deleteSessionByRawToken, getRawSessionToken } from "@/lib/server/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-routes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .find((entry) => entry.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.split("=")[1];
    const rawToken = getRawSessionToken(token);

    if (rawToken) {
      await deleteSessionByRawToken(rawToken);
    }

    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    const response = createApiErrorResponse(error, "Unable to sign out right now.");
    clearSessionCookie(response);
    return response;
  }
}
