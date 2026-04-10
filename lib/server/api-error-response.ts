import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { DuplicateUserError } from "@/lib/server/data-store";

function isMissingTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function isConnectionError(error: unknown) {
  return error instanceof Prisma.PrismaClientInitializationError;
}

export function createApiErrorResponse(
  error: unknown,
  fallbackMessage: string,
  headers?: HeadersInit,
) {
  console.error("[api-error]", error);

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      {
        error: "Email or username is already in use.",
      },
      { status: 409, headers },
    );
  }

  if (error instanceof DuplicateUserError) {
    return NextResponse.json(
      {
        error: "Email or username is already in use.",
      },
      { status: 409, headers },
    );
  }

  if (isConnectionError(error)) {
    return NextResponse.json(
      {
        error:
          "Database is unavailable. Start Postgres and run `npm run prisma:migrate:deploy`, then try again.",
      },
      { status: 503, headers },
    );
  }

  if (isMissingTableError(error)) {
    return NextResponse.json(
      {
        error:
          "Database schema is missing. Run `npm run prisma:migrate:deploy`, then try again.",
      },
      { status: 503, headers },
    );
  }

  return NextResponse.json(
    {
      error: fallbackMessage,
    },
    { status: 500, headers },
  );
}
