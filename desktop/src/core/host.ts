/** What the workspace window asks of the native host. In a browser tab there is no host, and
 * each of these says so by returning null or doing nothing. */
import { hasTauri } from "./session";

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!hasTauri()) return null;
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(command, args);
}

export const host = {
  available: hasTauri,
  /** Listen for a host event (`core-restarted`, `core-down`); the function given back stops listening. */
  onEvent: async (name: "core-restarted" | "core-down", handler: (payload: unknown) => void): Promise<() => void> => {
    if (!hasTauri()) return () => undefined;
    const { listen } = await import("@tauri-apps/api/event");
    return listen(name, (event) => handler(event.payload));
  },
  companionVisible: () => invoke<boolean>("avatar_is_visible"),
  setCompanionVisible: (visible: boolean) => invoke<boolean>("avatar_visible", { visible }),
  revealData: () => invoke<void>("reveal_data"),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
};
