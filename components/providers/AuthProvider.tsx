"use client";

import {
  createContext,
  useEffect,
  useCallback,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthPage, isProtectedPath } from "@/lib/auth-routes";
import type { AuthUser } from "@/types/auth";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<AuthUser>;
  register: (input: { email: string; username: string; password: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    if (response.status === 401) {
      setUser(null);
      return null;
    }

    const json = await readJson<{ user: AuthUser }>(response);
    setUser(json.user);
    return json.user;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const nextUser = await refresh();

        if (cancelled) {
          return;
        }

        if (!nextUser && isProtectedPath(pathname)) {
          startTransition(() => {
            router.replace("/login");
          });
        }

        if (nextUser && isAuthPage(pathname)) {
          startTransition(() => {
            router.replace("/");
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, refresh, router]);

  async function login(input: { email: string; password: string }) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
    const json = await readJson<{ user: AuthUser }>(response);
    setUser(json.user);
    return json.user;
  }

  async function register(input: {
    email: string;
    username: string;
    password: string;
  }) {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
    const json = await readJson<{ user: AuthUser }>(response);
    setUser(json.user);
    return json.user;
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setUser(null);
    startTransition(() => {
      router.replace("/login");
    });
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
