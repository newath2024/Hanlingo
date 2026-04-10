"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

function canGoBackSafely() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.history.length > 1) {
    return true;
  }

  if (!document.referrer) {
    return false;
  }

  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  const isHomePage = pathname === "/";
  const shouldConfirmExit =
    pathname.startsWith("/node/") || pathname.startsWith("/lesson/");

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (
      shouldConfirmExit &&
      !window.confirm("Leave this lesson? Your current progress on this screen may be lost.")
    ) {
      return;
    }

    if (canGoBackSafely()) {
      router.back();
      return;
    }

    router.push("/");
  }, [router, shouldConfirmExit]);

  if (isHomePage) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go back"
      className="back-button pointer-events-auto"
    >
      <span aria-hidden="true" className="text-xl leading-none">
        ←
      </span>
    </button>
  );
}
