import { NextResponse } from "next/server";
import { errorReportSchema } from "@/lib/api-schemas";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  touchSessionOnResponse,
} from "@/lib/server/auth";
import { reportUserErrors } from "@/lib/server/errors";

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
    const parsed = errorReportSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid error report payload.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const saved = await reportUserErrors(auth.user.id, parsed.data.events);

    return NextResponse.json(
      {
        saved: saved.records.length,
        fingerprintsSaved: saved.fingerprints.length,
      },
      { headers: response.headers },
    );
  } catch (error) {
    return createApiErrorResponse(error, "Unable to record lesson mistakes.", response.headers);
  }
}
