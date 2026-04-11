import { NextResponse } from "next/server";
import { analyticsOverviewQuerySchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import { getAnalyticsOverview } from "@/lib/server/analytics-overview";

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
    const parsed = analyticsOverviewQuerySchema.safeParse({
      timeZone: searchParams.get("timeZone") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid analytics query.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const result = await getAnalyticsOverview(auth.user.id, parsed.data.timeZone);
    return NextResponse.json(result, { headers: response.headers });
  } catch (error) {
    return createApiErrorResponse(error, "Unable to load analytics overview.", response.headers);
  }
}
