import { getUser } from "@/lib/auth";

/** Auth gate for everything under /app. The rail lives in the (shell) group; the canvas route (/app/p/*) stays full-bleed. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await getUser();
  return <div className="flex flex-1 flex-col">{children}</div>;
}
