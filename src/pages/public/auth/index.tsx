import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Bot, Eye, EyeOff, Sparkles } from "lucide-react";

import { backendApi } from "@/core/api";
import { useGlobalStore } from "@/core/global-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthMode = "signin" | "signup";
type LocationState = { from?: string };

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

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
    if (next && next.startsWith("/")) return next;
    const state = location.state as LocationState | null;
    return state?.from ?? "/";
  }, [location.state, searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function verifySession() {
      if (!backendApi.isAuthenticated()) { if (!cancelled) setCheckingSession(false); return; }
      try {
        const me = await backendApi.getMe();
        if (!cancelled) { setUser(me); navigate(redirectPath, { replace: true }); }
      } catch {
        backendApi.signOut();
        if (!cancelled) setCheckingSession(false);
      }
    }
    void verifySession();
    return () => { cancelled = true; };
  }, [navigate, redirectPath, setUser]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await backendApi.signIn({ email: signinEmail.trim(), password: signinPassword });
      const me = await backendApi.getMe();
      setUser(me);
      toast.success("Welcome back!");
      navigate(redirectPath, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    } finally { setLoading(false); }
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await backendApi.signUp({ first_name: signupFirstName.trim(), last_name: signupLastName.trim(), email: signupEmail.trim(), password: signupPassword });
      const me = await backendApi.getMe();
      setUser(me);
      toast.success("Account created!");
      navigate(redirectPath, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create account.");
    } finally { setLoading(false); }
  }

  if (checkingSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          Checking session...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between bg-[linear-gradient(160deg,#0f172a_0%,#1e1b4b_60%,#0f172a_100%)] border-r border-gray-800 p-10">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-900/50">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">FMate</span>
          </div>

          <div className="space-y-6">
            <h1 className="text-3xl font-bold leading-tight text-white">
              Build project memory.<br />
              <span className="text-indigo-400">Chat with your docs.</span>
            </h1>
            <p className="text-gray-400 leading-relaxed">
              Manage projects, run AI-powered conversations, and keep context centralized across your entire workspace.
            </p>
          </div>

          <div className="mt-10 space-y-4">
            {[
              { title: "Project memory", desc: "Keep context across all your conversations" },
              { title: "AI chat", desc: "Ask anything about your documents and files" },
              { title: "Team collaboration", desc: "Share projects and work together in real time" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/30">
            <Bot className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="text-xs text-gray-500">Powered by FastAPI · <span className="text-gray-400">/api</span></p>
        </div>
      </div>

      {/* Right panel – form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-gray-950">
        {/* Mobile brand */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-semibold text-white">FMate</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {mode === "signin" ? "Sign in to your workspace" : "Get started for free"}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="mb-6 flex rounded-xl bg-gray-900 border border-gray-800 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === "signin" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === "signup" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
            >
              Sign up
            </button>
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Email</label>
                <Input
                  id="signin-email"
                  type="email"
                  value={signinEmail}
                  onChange={(e) => setSigninEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="rounded-xl border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Password</label>
                <div className="relative">
                  <Input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    value={signinPassword}
                    onChange={(e) => setSigninPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="rounded-xl border-gray-700 bg-gray-900 pr-10 text-gray-100 placeholder:text-gray-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">First name</label>
                  <Input
                    value={signupFirstName}
                    onChange={(e) => setSignupFirstName(e.target.value)}
                    placeholder="Sara"
                    required
                    className="rounded-xl border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Last name</label>
                  <Input
                    value={signupLastName}
                    onChange={(e) => setSignupLastName(e.target.value)}
                    placeholder="Lee"
                    required
                    className="rounded-xl border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Email</label>
                <Input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="rounded-xl border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                    className="rounded-xl border-gray-700 bg-gray-900 pr-10 text-gray-100 placeholder:text-gray-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-gray-600">
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
