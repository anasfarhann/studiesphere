import { notFound } from "next/navigation";
import { DevCanvas } from "./DevCanvas";

/** Dev-only canvas without sign-in, used by e2e tests. 404 in production. */
export default function DevCanvasPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DevCanvas />
    </main>
  );
}
