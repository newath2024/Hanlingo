"use client";

import type { ReactNode } from "react";
import AuthProvider from "@/components/providers/AuthProvider";
import UserProgressProvider from "@/components/providers/UserProgressProvider";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <UserProgressProvider>{children}</UserProgressProvider>
    </AuthProvider>
  );
}
