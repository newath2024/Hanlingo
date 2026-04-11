import { NextResponse } from "next/server";
import { practiceQuerySchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import { generateAdaptiveSession } from "@/lib/server/adaptive-learning";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const response = NextResponse.json({});
  const auth = await touchSessionOnResponse(response, getSessionTokenFromRequest(request));

  if (!auth.user) {
    clearSessionCookie(response);
    return NextResponse.json(
      {
        error: "Unauthorized.",
      },
      { status: 401, headers: response.headers },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = practiceQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? 10,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid practice query.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const session = await generateAdaptiveSession({
      userId: auth.user.id,
      mode: "balanced_progress",
      sessionSize: parsed.data.limit,
    });

    return NextResponse.json(
      {
        items: session.items,
      },
      { headers: response.headers },
    );
  } catch (error) {
    return createApiErrorResponse(error, "Unable to generate mixed practice.", response.headers);
  }
}
