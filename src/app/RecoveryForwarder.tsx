"use client";

import { useEffect } from "react";
import { recoveryForwardTarget } from "@/lib/recovery-forward";

/**
 * Sends a recovery-link fragment that landed on the wrong page to /auth/recovery (see
 * recoveryForwardTarget). A full-page replace keeps the fragment exactly and leaves no history entry
 * holding the tokens. Renders nothing.
 */
export function RecoveryForwarder() {
  useEffect(() => {
    const target = recoveryForwardTarget(window.location.pathname, window.location.hash);
    if (target) window.location.replace(target);
  }, []);
  return null;
}
