import { NextResponse } from "next/server";
import { reviewMutationSchema } from "@/lib/api-schemas";
import { SESSION_COOKIE_NAME } from "@/lib/auth-routes";
import { createApiErrorResponse } from "@/lib/server/api-error-response";
import { clearSessionCookie, touchSessionOnResponse } from "@/lib/server/auth";
import { saveReviewRating } from "@/lib/server/progress";

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
    const parsed = reviewMutationSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid review payload.",
        },
        { status: 400, headers: response.headers },
      );
    }

    const result = await saveReviewRating(auth.user.id, parsed.data);

    return NextResponse.json(
      {
        progress: result.progress,
        review: result.review,
      },
      { headers: response.headers },
    );
  } catch (error) {
    return createApiErrorResponse(
      error,
      "Unable to save review progress.",
      response.headers,
    );
  }
}
