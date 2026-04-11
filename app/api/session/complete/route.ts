import { NextResponse } from "next/server";
import { adaptiveSessionCompleteSchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import { completeAdaptiveSession } from "@/lib/server/adaptive-learning";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    const json = await request.json();
    const parsed = adaptiveSessionCompleteSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid adaptive session payload.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const result = await completeAdaptiveSession({
      userId: auth.user.id,
      ...parsed.data,
    });

    return NextResponse.json(result, { headers: response.headers });
  } catch (error) {
    return createApiErrorResponse(error, "Unable to complete adaptive session.", response.headers);
  }
}
