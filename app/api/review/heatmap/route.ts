import { NextResponse } from "next/server";
import { heatmapQuerySchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import { getUserErrorHeatmap } from "@/lib/server/error-heatmap";

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
    const parsed = heatmapQuerySchema.safeParse({
      scope: searchParams.get("scope") ?? undefined,
      unitId: searchParams.get("unitId") ?? undefined,
      lessonId: searchParams.get("lessonId") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid heatmap query.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const { lessonId, limit, scope, unitId } = parsed.data;
    const result = await getUserErrorHeatmap(auth.user.id, {
      scope,
      unitId,
      lessonId,
      limit,
    });

    return NextResponse.json(result, { headers: response.headers });
  } catch (error) {
    return createApiErrorResponse(error, "Unable to load error heatmap.", response.headers);
  }
}
