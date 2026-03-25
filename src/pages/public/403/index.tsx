import { Ripple } from "@/components/ui/shadcn-io/ripple";

export default function ForbiddenPage() {
  return (
    <main className="container grid place-content-center">
      <Ripple />
      <h1 className="text-4xl font-bold">403 - Forbidden</h1>
      <p className="mt-4">
        You do not have permission to access this resource.
      </p>
    </main>
  );
}
