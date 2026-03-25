import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";

import { backendApi } from "@/core/api";
import { useGlobalStore } from "@/core/global-store";

type BootStatus = "checking" | "ready";

export default function PrivateLayout() {
  const [status, setStatus] = useState<BootStatus>("checking");
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useGlobalStore((state) => state.setUser);

  const returnTo = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      if (!backendApi.isAuthenticated()) {
        navigate(`/auth?next=${encodeURIComponent(returnTo)}`, {
          replace: true,
          state: { from: returnTo },
        });
        return;
      }

      try {
        const me = await backendApi.getMe();
        if (!cancelled) {
          setUser(me);
          setStatus("ready");
        }
      } catch {
        backendApi.signOut();
        if (!cancelled) {
          navigate(`/auth?next=${encodeURIComponent(returnTo)}`, {
            replace: true,
            state: { from: returnTo },
          });
        }
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [returnTo, navigate, setUser]);

  if (status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.2),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.2),transparent_40%),linear-gradient(180deg,#f8fafc,#f1f5f9)]">
        <div className="rounded-xl border bg-white/80 px-6 py-4 text-sm text-slate-700 backdrop-blur">
          Checking your session...
        </div>
      </main>
    );
  }

  return <Outlet />;
}
