import { Outlet } from "react-router";
import { Toaster } from "sonner";

export default function GlobalLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
      <Toaster richColors position="top-right" />
    </div>
  );
}
