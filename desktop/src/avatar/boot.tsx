/**
 * The companion window's own entry: it gets the core session like the workspace, then renders
 * the character with the host's layout commands. In a browser tab (`#avatar`) it works against
 * the Vite env session, without the host.
 */
import { useEffect, useState } from "react";
import { Client } from "../core/client";
import { hasTauri, resolveSession } from "../core/session";
import { reapplyAppearance } from "../shell/appearance";
import { applyTheme, readTheme } from "../shell/theme";
import { AvatarWindow, type AvatarHost } from "./AvatarWindow";
import { useLookChange } from "./look";

/** The workspace's theme, accent and companion colours, here too; again when they change there. */
function syncLook() {
  applyTheme(readTheme());
  reapplyAppearance();
}

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

/** The window's size per mode; main's host takes the size from the page. */
const SIZES = { idle: { width: 112, height: 124 }, bubble: { width: 320, height: 230 }, open: { width: 380, height: 560 } };

async function tauriHost(): Promise<AvatarHost | undefined> {
  if (!hasTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    layout: (mode) => invoke("avatar_layout", { mode, ...SIZES[mode] }),
    showMain: () => invoke("show_main"),
    hotAreas: (areas) => invoke("avatar_hot_areas", { areas }),
  };
}

export function AvatarBoot() {
  useEffect(syncLook, []);
  useLookChange(syncLook);
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
  if (!state) return <div className="avatar avatar--waiting" aria-label="Alpha is starting" />;
  if ("reason" in state) return <div className="avatar avatar--waiting" title={state.reason} aria-label="Alpha is starting" />;
  return <AvatarWindow client={state.client} host={state.host} />;
}
