"use client";

import { usePathname } from "next/navigation";
import { AppRail, type RailAccount } from "./AppRail";

/** Picks the active rail item from the URL (Subjects for /app/s/* and /app/n/*, otherwise Home). */
export function ShellRail({ account }: { account?: RailAccount }) {
  const path = usePathname();
  const active = path.startsWith("/app/s/") || path.startsWith("/app/n/") ? "subjects" : "home";
  return <AppRail active={active} account={account} />;
}
