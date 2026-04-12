import { NextResponse } from "next/server";
import { shellSidebarSummaryQuerySchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import { getShellSidebarSummary } from "@/lib/server/sidebar-summary";

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
    const parsed = shellSidebarSummaryQuerySchema.safeParse({
      timeZone: searchParams.get("timeZone") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid sidebar summary query.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const result = await getShellSidebarSummary(auth.user.id, parsed.data.timeZone);
    return NextResponse.json(result, { headers: response.headers });
  } catch (error) {
    return createApiErrorResponse(error, "Unable to load sidebar summary.", response.headers);
  }
}
