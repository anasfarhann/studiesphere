import { notFound } from "next/navigation";
import { AppRail } from "@/ui/AppRail";

/** Dev-only app shell without sign-in, used by e2e tests. 404 in production. */
export default function DevShellPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="flex flex-1 flex-col gap-5 p-5 pb-28 md:flex-row md:pb-5">
      <AppRail active="home" />
      <main className="min-w-0 flex-1">
        <h1 className="text-5xl font-medium tracking-tight">Shell</h1>
      </main>
    </div>
  );
}
