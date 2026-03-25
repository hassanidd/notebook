import { Ripple } from "@/components/ui/shadcn-io/ripple";

export default function InternalServerErrorPage() {
  return (
    <main className="container grid place-content-center">
      <Ripple />
      <h1 className="text-4xl font-bold">500 - Internal Server Error</h1>
      <p className="mt-4">
        Something went wrong on our end. Please try again later.
      </p>
    </main>
  );
}
