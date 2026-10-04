/**
 * The companion window's own entry: it gets the core session like the workspace, then renders
 * the character with the host's layout commands. In a browser tab (`#avatar`) it works against
 * the Vite env session, without the host.
 */
import { useEffect, useState } from "react";
import { Client } from "../core/client";
import { hasTauri, resolveSession } from "../core/session";
import { AvatarWindow, type AvatarHost } from "./AvatarWindow";

export async function isAvatarWindow(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.location.hash === "#avatar") return true;
  if (!hasTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label === "avatar";
  } catch {
    return false;
  }
}

async function tauriHost(): Promise<AvatarHost | undefined> {
  if (!hasTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    layout: (mode, width, height) => invoke("avatar_layout", { mode, width, height }),
    showMain: () => invoke("show_main"),
    hotAreas: (areas) => invoke("avatar_hot_areas", { areas }),
  };
}

export function AvatarBoot() {
  const [state, setState] = useState<{ client: Client; host?: AvatarHost } | { reason: string } | null>(null);
  useEffect(() => {
    document.body.classList.add("avatar-window");
    let cancelled = false;
    void (async () => {
      const [resolution, host] = await Promise.all([resolveSession(), tauriHost()]);
      if (cancelled) return;
      if (resolution.kind === "unavailable") {
        setState({ reason: resolution.reason });
        setTimeout(() => !cancelled && setState(null), 5000);
        return;
      }
      setState({ client: new Client(resolution.session), host });
    })();
    return () => {
      cancelled = true;
    };
  }, [state === null]);
  if (!state) return <div className="avatar avatar--waiting" aria-label="Zazoo is starting" />;
  if ("reason" in state) return <div className="avatar avatar--waiting" title={state.reason} aria-label="Zazoo is starting" />;
  return <AvatarWindow client={state.client} host={state.host} />;
}
