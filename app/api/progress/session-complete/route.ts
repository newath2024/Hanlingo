import { NextResponse } from "next/server";
import { sessionCompleteSchema } from "@/lib/api-schemas";
import { SESSION_COOKIE_NAME } from "@/lib/auth-routes";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import { clearSessionCookie, touchSessionOnResponse } from "@/lib/server/auth";
import { awardLeaderboardXp } from "@/lib/server/leaderboard";
import { applySessionCompletion } from "@/lib/server/progress";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((entry) => entry.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const response = NextResponse.json({});
  const auth = await touchSessionOnResponse(response, token);

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
    const parsed = sessionCompleteSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid session payload.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const result = await applySessionCompletion(auth.user.id, {
      lessonId: parsed.data.lessonId,
      nodeId: parsed.data.nodeId,
      unitId: parsed.data.unitId,
      score: parsed.data.score,
      totalQuestions: parsed.data.totalQuestions,
      awardedXp: parsed.data.awardedXp,
      completeUnit: parsed.data.completeUnit,
      errorPatternMisses: parsed.data.errorPatternMisses,
      sentenceExposureDeltas: parsed.data.sentenceExposureDeltas,
    });

    await awardLeaderboardXp({
      userId: auth.user.id,
      sourceType: "lesson",
      sourceId: parsed.data.completionId,
      xpDelta: parsed.data.awardedXp,
    });

    return NextResponse.json(
      {
        progress: result.progress,
        nodeCompletedNow: result.nodeCompletedNow,
        unitCompletedNow: result.unitCompletedNow,
      },
      { headers: response.headers },
    );
  } catch (error) {
    return createApiErrorResponse(
      error,
      "Unable to save lesson progress.",
      response.headers,
    );
  }
}
