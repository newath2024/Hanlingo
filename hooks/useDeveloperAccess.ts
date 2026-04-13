"use client";

import { useAuth } from "@/hooks/useAuth";
import { isDeveloperEmail } from "@/lib/developer-access";

export function useDeveloperAccess() {
  const { user } = useAuth();

  return user?.isDeveloper ?? isDeveloperEmail(user?.email);
}
