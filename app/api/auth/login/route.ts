import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import { findUserByEmail } from "@/lib/server/data-store";
import {
  applySessionCookie,
  createUserSession,
  normalizeEmail,
  toAuthUser,
  verifyPassword,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = loginSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid login payload.",
        },
        { status: 400 },
      );
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await findUserByEmail(email);

    if (!user) {
      return NextResponse.json(
        {
          error: "Email or password is incorrect.",
        },
        { status: 401 },
      );
    }

    const passwordMatches = await verifyPassword(parsed.data.password, user.passwordHash);

    if (!passwordMatches) {
      return NextResponse.json(
        {
          error: "Email or password is incorrect.",
        },
        { status: 401 },
      );
    }

    const session = await createUserSession(user.id);
    const response = NextResponse.json({
      user: toAuthUser(user),
    });

    applySessionCookie(response, session);
    return response;
  } catch (error) {
    return createApiErrorResponse(error, "Unable to sign in right now.");
  }
}
