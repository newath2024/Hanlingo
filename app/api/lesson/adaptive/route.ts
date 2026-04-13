import { NextResponse } from "next/server";
import { adaptiveLessonQuerySchema } from "@/lib/api-schemas";
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
    const parsed = adaptiveLessonQuerySchema.safeParse({
      mode: searchParams.get("mode") ?? undefined,
      targetUnitId: searchParams.get("targetUnitId") ?? undefined,
      targetLessonId: searchParams.get("targetLessonId") ?? undefined,
      sessionSize: searchParams.get("sessionSize") ?? undefined,
      seed: searchParams.get("seed") ?? undefined,
      debug: searchParams.get("debug") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid adaptive lesson query.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const result = await generateAdaptiveSession({
      userId: auth.user.id,
      developerOverride: auth.user.isDeveloper,
      mode: parsed.data.mode,
      targetUnitId: parsed.data.targetUnitId,
      targetLessonId: parsed.data.targetLessonId,
      sessionSize: parsed.data.sessionSize,
      seed: parsed.data.seed,
      debug: parsed.data.debug === "1" || parsed.data.debug === "true",
    });

    return NextResponse.json(result, { headers: response.headers });
  } catch (error) {
    return createApiErrorResponse(error, "Unable to generate adaptive lesson.", response.headers);
  }
}
