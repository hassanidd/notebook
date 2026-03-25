import { Sparkles } from "lucide-react";

export default function LoadingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-200">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          Loading...
        </div>
      </div>
    </main>
  );
}
