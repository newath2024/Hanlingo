import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-routes";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import { clearSessionCookie, touchSessionOnResponse } from "@/lib/server/auth";
import { getUserProgress } from "@/lib/server/progress";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
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

    const progress = await getUserProgress(auth.user.id);

    return NextResponse.json(
      {
        user: auth.user,
        progress,
      },
      { headers: response.headers },
    );
  } catch (error) {
    return createApiErrorResponse(error, "Unable to load your progress.");
  }
}
