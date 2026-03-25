export default function LoadingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.2),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.2),transparent_40%),linear-gradient(180deg,#f8fafc,#eef2ff)]">
      <div className="rounded-xl border bg-white/80 px-6 py-4 text-sm text-slate-700 backdrop-blur">
        Loading...
      </div>
    </main>
  );
}
