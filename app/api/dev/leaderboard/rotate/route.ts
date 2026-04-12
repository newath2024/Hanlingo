import { NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import {
  finalizeLeaderboardWeek,
  getCurrentLeaderboardWeek,
} from "@/lib/server/leaderboard";

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

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "This route is available in development only.",
      },
      { status: 403, headers: response.headers },
    );
  }

  try {
    const currentWeek = await getCurrentLeaderboardWeek();
    const nextWeek = await finalizeLeaderboardWeek(currentWeek.id, {
      now: currentWeek.endsAt,
    });

    return NextResponse.json(
      {
        rotated: true,
        closedWeekId: currentWeek.id,
        nextWeek: {
          id: nextWeek.id,
          key: nextWeek.key,
          startsAt: nextWeek.startsAt.toISOString(),
          endsAt: nextWeek.endsAt.toISOString(),
          status: nextWeek.status,
        },
      },
      { headers: response.headers },
    );
  } catch (error) {
    return createApiErrorResponse(error, "Unable to rotate leaderboard week.", response.headers);
  }
}
