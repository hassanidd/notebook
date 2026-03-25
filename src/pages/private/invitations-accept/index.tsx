import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { backendApi, getApiErrorMessage } from "@/core/api";

type AcceptState = "working" | "done" | "error";

export default function AcceptInvitationPage() {
  const [state, setState] = useState<AcceptState>("working");
  const [message, setMessage] = useState("Accepting invitation...");
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = params.get("token");
      if (!token) {
        if (!cancelled) {
          setState("error");
          setMessage("Missing invitation token.");
        }
        return;
      }

      try {
        await backendApi.acceptInvitationByToken(token);
        if (!cancelled) {
          setState("done");
          setMessage("Invitation accepted. Redirecting...");
          setTimeout(() => {
            navigate("/", { replace: true });
          }, 900);
        }
      } catch (error) {
        if (!cancelled) {
          setState("error");
          setMessage(getApiErrorMessage(error, "Failed to accept invitation."));
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [navigate, params]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.2),transparent_45%),linear-gradient(180deg,#f8fafc,#ecfeff)] p-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white/85 p-8 text-center shadow-sm backdrop-blur">
        <p
          className={`text-sm font-semibold tracking-[0.2em] uppercase ${
            state === "error" ? "text-rose-700" : "text-emerald-700"
          }`}
        >
          Project Invitation
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          {state === "working" && "Please wait"}
          {state === "done" && "Success"}
          {state === "error" && "Something went wrong"}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
        {state === "error" && (
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Back to workspace
          </button>
        )}
      </section>
    </main>
  );
}
