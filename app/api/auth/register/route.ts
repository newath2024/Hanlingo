import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import { createUser } from "@/lib/server/data-store";
import {
  applySessionCookie,
  createUserSession,
  hashPassword,
  normalizeEmail,
  normalizeUsername,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = registerSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid registration payload.",
        },
        { status: 400 },
      );
    }

    const email = normalizeEmail(parsed.data.email);
    const username = normalizeUsername(parsed.data.username);
    const passwordHash = await hashPassword(parsed.data.password);

    const user = await createUser({
      email,
      username,
      passwordHash,
    });

    const session = await createUserSession(user.id);
    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
      },
      { status: 201 },
    );

    applySessionCookie(response, session);
    return response;
  } catch (error) {
    return createApiErrorResponse(error, "Unable to create account right now.");
  }
}
