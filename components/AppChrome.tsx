"use client";

import { usePathname } from "next/navigation";
import LocaleToggle from "@/components/LocaleToggle";
import { useAuth } from "@/hooks/useAuth";

export default function AppChrome() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const isAuthRoute = pathname === "/login" || pathname === "/register";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-end p-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-accent/10 bg-white/90 px-4 py-3 shadow-[0_16px_34px_rgba(47,92,51,0.12)] backdrop-blur-sm">
        <LocaleToggle />
        {!isAuthRoute && !isLoading && user ? (
          <>
            <div className="hidden min-w-[120px] text-right sm:block">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Signed in
              </p>
              <p className="text-sm font-extrabold text-foreground">@{user.username}</p>
            </div>
            <button type="button" onClick={() => void logout()} className="secondary-button py-2">
              Logout
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
