import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { backendApi } from "@/core/api";
import { useGlobalStore } from "@/core/global-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthMode = "signin" | "signup";

type LocationState = {
  from?: string;
};

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const setUser = useGlobalStore((state) => state.setUser);

  const redirectPath = useMemo(() => {
    const next = searchParams.get("next");
    if (next && next.startsWith("/")) {
      return next;
    }
    const state = location.state as LocationState | null;
    return state?.from ?? "/";
  }, [location.state, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      if (!backendApi.isAuthenticated()) {
        if (!cancelled) {
          setCheckingSession(false);
        }
        return;
      }

      try {
        const me = await backendApi.getMe();
        if (!cancelled) {
          setUser(me);
          navigate(redirectPath, { replace: true });
        }
      } catch {
        backendApi.signOut();
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    void verifySession();

    return () => {
      cancelled = true;
    };
  }, [navigate, redirectPath, setUser]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await backendApi.signIn({
        email: signinEmail.trim(),
        password: signinPassword,
      });

      const me = await backendApi.getMe();
      setUser(me);
      toast.success("Signed in");
      navigate(redirectPath, { replace: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sign in.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await backendApi.signUp({
        first_name: signupFirstName.trim(),
        last_name: signupLastName.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
      });

      const me = await backendApi.getMe();
      setUser(me);
      toast.success("Account created");
      navigate(redirectPath, { replace: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create account.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.24),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.26),transparent_38%),linear-gradient(180deg,#f8fafc,#eef2ff)]">
        <div className="rounded-xl border border-slate-200 bg-white/85 px-6 py-4 text-sm text-slate-700 backdrop-blur">
          Checking your session...
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.24),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.26),transparent_38%),linear-gradient(180deg,#f8fafc,#eef2ff)] p-6">
      <div className="pointer-events-none absolute -left-24 top-16 h-80 w-80 animate-pulse rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-16 h-80 w-80 animate-pulse rounded-full bg-orange-300/35 blur-3xl" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_1fr]">
        <aside className="hidden border-r border-slate-200/70 bg-[linear-gradient(145deg,#064e3b,#0f766e_55%,#14532d)] p-10 text-emerald-50 md:flex md:flex-col md:justify-between">
          <div className="space-y-4">
            <p className="inline-flex rounded-full border border-emerald-200/30 px-3 py-1 text-xs tracking-[0.2em] uppercase">
              FMate
            </p>
            <h1 className="text-4xl leading-tight font-semibold">
              Build project memory and chat with your docs.
            </h1>
            <p className="max-w-md text-sm leading-6 text-emerald-100/90">
              Sign in to manage projects, run AI conversations, and keep context
              centralized across your workspace.
            </p>
          </div>
          <div className="text-xs tracking-wide text-emerald-100/70">
            Backed by FastAPI at <span className="font-medium">/api</span>
          </div>
        </aside>

        <div className="p-8 sm:p-10">
          <div className="mb-7 inline-flex rounded-lg border border-slate-300 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign Up
            </button>
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="signin-email">
                  Email
                </label>
                <Input
                  id="signin-email"
                  type="email"
                  value={signinEmail}
                  onChange={(event) => setSigninEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="signin-password">
                  Password
                </label>
                <Input
                  id="signin-password"
                  type="password"
                  value={signinPassword}
                  onChange={(event) => setSigninPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button type="submit" className="mt-4 w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="signup-first-name">
                    First Name
                  </label>
                  <Input
                    id="signup-first-name"
                    value={signupFirstName}
                    onChange={(event) => setSignupFirstName(event.target.value)}
                    placeholder="Sara"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="signup-last-name">
                    Last Name
                  </label>
                  <Input
                    id="signup-last-name"
                    value={signupLastName}
                    onChange={(event) => setSignupLastName(event.target.value)}
                    placeholder="Lee"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="signup-email">
                  Email
                </label>
                <Input
                  id="signup-email"
                  type="email"
                  value={signupEmail}
                  onChange={(event) => setSignupEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="signup-password">
                  Password
                </label>
                <Input
                  id="signup-password"
                  type="password"
                  value={signupPassword}
                  onChange={(event) => setSignupPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </div>

              <Button type="submit" className="mt-4 w-full" disabled={loading}>
                {loading ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
