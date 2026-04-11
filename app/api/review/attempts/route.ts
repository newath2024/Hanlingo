import { NextResponse } from "next/server";
import { attemptBatchSchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import { recordUserQuestionAttempts } from "@/lib/server/error-heatmap";

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
    const parsed = attemptBatchSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid lesson attempt payload.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const saved = await recordUserQuestionAttempts(
      auth.user.id,
      parsed.data.events.map((event) => ({
        ...event,
        sourceContext: "lesson",
      })),
    );

    return NextResponse.json(
      {
        saved: saved.length,
      },
      { headers: response.headers },
    );
  } catch (error) {
    return createApiErrorResponse(error, "Unable to record lesson attempts.", response.headers);
  }
}
