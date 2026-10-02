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
  companionVisible: () => invoke<boolean>("avatar_is_visible"),
  setCompanionVisible: (visible: boolean) => invoke<boolean>("avatar_visible", { visible }),
  revealData: () => invoke<void>("reveal_data"),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
};
