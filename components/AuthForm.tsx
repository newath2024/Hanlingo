"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

type AuthFormMode = "login" | "register";

type AuthFormProps = {
  mode: AuthFormMode;
};

type FieldErrors = Partial<Record<"email" | "username" | "password", string>>;

function validate(mode: AuthFormMode, values: Record<string, string>) {
  const nextErrors: FieldErrors = {};

  if (!values.email.trim()) {
    nextErrors.email = "Email is required.";
  }

  if (mode === "register" && !values.username.trim()) {
    nextErrors.username = "Username is required.";
  }

  if (!values.password) {
    nextErrors.password = "Password is required.";
  } else if (mode === "register" && values.password.length < 8) {
    nextErrors.password = "Password must be at least 8 characters.";
  }

  return nextErrors;
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { login, register, isLoading: authLoading } = useAuth();
  const [values, setValues] = useState({
    email: "",
    username: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const content = useMemo(
    () =>
      mode === "login"
        ? {
            eyebrow: "Hanlingo session",
            title: "Pick up your Korean path where you left it.",
            subtitle:
              "Sign in to sync XP, lesson clears, and review memory to your own account.",
            submitLabel: "Sign In",
            switchLabel: "Need an account?",
            switchHref: "/register",
            switchAction: "Create one",
          }
        : {
            eyebrow: "Create account",
            title: "Start a clean Korean dashboard tied to your own progress.",
            subtitle:
              "Register once, then every lesson clear and spaced review stays on your account.",
            submitLabel: "Create Account",
            switchLabel: "Already have an account?",
            switchHref: "/login",
            switchAction: "Sign in",
          },
    [mode],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(mode, values);

    setFieldErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login({
          email: values.email,
          password: values.password,
        });
      } else {
        await register({
          email: values.email,
          username: values.username,
          password: values.password,
        });
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to continue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const pending = isSubmitting || authLoading;

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="space-y-5">
          <span className="pill bg-accent-warm/70 text-foreground">{content.eyebrow}</span>
          <h1 className="font-display text-5xl leading-tight text-foreground sm:text-6xl">
            {content.title}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">{content.subtitle}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.6rem] bg-white/90 p-4">
            <p className="text-sm font-bold text-muted-foreground">Private progress</p>
            <p className="mt-2 text-base font-extrabold text-foreground">
              XP and lesson clears stay scoped to your account.
            </p>
          </div>
          <div className="rounded-[1.6rem] bg-card-strong/90 p-4">
            <p className="text-sm font-bold text-muted-foreground">No plain text</p>
            <p className="mt-2 text-base font-extrabold text-foreground">
              Passwords are hashed before they ever reach storage.
            </p>
          </div>
          <div className="rounded-[1.6rem] bg-white/90 p-4">
            <p className="text-sm font-bold text-muted-foreground">Ready for growth</p>
            <p className="mt-2 text-base font-extrabold text-foreground">
              Streaks, XP layers, and leaderboard hooks can build on this base.
            </p>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {mode === "login" ? "Sign In" : "Register"}
            </p>
            <h2 className="font-display text-3xl text-foreground">
              {mode === "login" ? "Welcome back." : "Create your account."}
            </h2>
          </div>

          {formError ? <div className="feedback-incorrect">{formError}</div> : null}

          <label className="space-y-2">
            <span className="text-sm font-bold text-muted-foreground">Email</span>
            <input
              type="email"
              value={values.email}
              onChange={(event) =>
                setValues((current) => ({ ...current, email: event.target.value }))
              }
              className="auth-input"
              placeholder="you@example.com"
              autoComplete="email"
            />
            {fieldErrors.email ? <p className="text-sm font-bold text-danger">{fieldErrors.email}</p> : null}
          </label>

          {mode === "register" ? (
            <label className="space-y-2">
              <span className="text-sm font-bold text-muted-foreground">Username</span>
              <input
                type="text"
                value={values.username}
                onChange={(event) =>
                  setValues((current) => ({ ...current, username: event.target.value }))
                }
                className="auth-input"
                placeholder="hanlingo_learner"
                autoComplete="username"
              />
              {fieldErrors.username ? (
                <p className="text-sm font-bold text-danger">{fieldErrors.username}</p>
              ) : null}
            </label>
          ) : null}

          <label className="space-y-2">
            <span className="text-sm font-bold text-muted-foreground">Password</span>
            <input
              type="password"
              value={values.password}
              onChange={(event) =>
                setValues((current) => ({ ...current, password: event.target.value }))
              }
              className="auth-input"
              placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {fieldErrors.password ? (
              <p className="text-sm font-bold text-danger">{fieldErrors.password}</p>
            ) : null}
          </label>

          <button type="submit" disabled={pending} className="primary-button w-full">
            {pending ? "Please wait..." : content.submitLabel}
          </button>

          <p className="text-sm font-bold text-muted-foreground">
            {content.switchLabel}{" "}
            <Link
              href={content.switchHref}
              className="text-accent-strong underline-offset-4 hover:underline"
            >
              {content.switchAction}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
