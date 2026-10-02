/**
 * Settings → Permissions: each thing Alpha may reach on this Mac, with Alpha's own switch and
 * what macOS has granted. An app cannot take back a macOS grant, so the switch is Alpha's: off
 * means Alpha does not use it even when macOS allows it. "Grant access" shows macOS's prompt the
 * first time; after that it opens the right System Settings pane. The host side is
 * `desktop/src-tauri/src/permissions.rs`. Statuses refresh when the window regains focus, so
 * coming back from System Settings shows the change.
 */
import { useCallback, useEffect, useState } from "react";
import { AudioLines, Keyboard, type LucideIcon, Mic, PersonStanding, ScreenShare, ScrollText, Volume2 } from "lucide-react";
import { hasTauri } from "../core/session";
import { InfoTip } from "../ui";

export type PermissionKind = "screen" | "system_audio" | "microphone" | "speech" | "accessibility" | "input" | "logs";
type Status = "granted" | "not_asked" | "denied" | "unknown";

const KEY = "alpha.permissions";

export const PERMISSIONS: { kind: PermissionKind; label: string; icon: LucideIcon; tip: string; on: boolean }[] = [
  { kind: "screen", label: "Screen", icon: ScreenShare, tip: "Alpha may see what is on your screen when you ask about it. macOS calls this Screen & System Audio Recording and may ask Alpha to reopen after you allow it.", on: false },
  { kind: "system_audio", label: "System audio", icon: Volume2, tip: "Alpha may listen to what your Mac plays: calls, meetings, videos. Shares macOS's Screen & System Audio Recording grant.", on: false },
  { kind: "microphone", label: "Microphone", icon: Mic, tip: "Alpha listens when you tap the mic or hold your push-to-talk key.", on: true },
  { kind: "speech", label: "Speech recognition", icon: AudioLines, tip: "Turns what you say into text on this Mac, when Transcription is On this Mac.", on: true },
  { kind: "accessibility", label: "Accessibility", icon: PersonStanding, tip: "Alpha may read the window you are in and act in other apps for you.", on: false },
  { kind: "input", label: "Input monitoring", icon: Keyboard, tip: "Alpha notices your push-to-talk key while another app is focused.", on: true },
  { kind: "logs", label: "System logs", icon: ScrollText, tip: "Alpha may read your Mac's logs to help when something goes wrong. macOS grants this as Full Disk Access.", on: false },
];

function readSwitches(): Partial<Record<PermissionKind, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<PermissionKind, boolean>>;
  } catch {
    return {};
  }
}

/** Alpha's own switch for `kind` (not macOS's grant). */
export function permissionOn(kind: PermissionKind): boolean {
  return readSwitches()[kind] ?? PERMISSIONS.find((p) => p.kind === kind)?.on ?? false;
}

function setPermissionOn(kind: PermissionKind, on: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readSwitches(), [kind]: on }));
  } catch {
    /* per-window convenience only */
  }
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(command, args);
}

const PILL: Record<Status, [string, string]> = {
  granted: ["pill pill--good", "Granted"],
  not_asked: ["pill pill--warn", "Not granted"],
  denied: ["pill pill--warn", "Not granted"],
  unknown: ["pill pill--gray", "Unknown"],
};

export function Permissions() {
  const desktop = hasTauri();
  const [on, setOn] = useState(() => Object.fromEntries(PERMISSIONS.map((p) => [p.kind, permissionOn(p.kind)])) as Record<PermissionKind, boolean>);
  const [status, setStatus] = useState<Partial<Record<PermissionKind, Status>>>({});
  const [asked, setAsked] = useState<Partial<Record<PermissionKind, boolean>>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!desktop) return;
    invoke<Record<PermissionKind, Status>>("permissions_status")
      .then(setStatus)
      .catch(() => undefined);
  }, [desktop]);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const flip = (kind: PermissionKind) => {
    setPermissionOn(kind, !on[kind]);
    setOn((all) => ({ ...all, [kind]: !all[kind] }));
  };
  const grant = (kind: PermissionKind) => {
    const settings = asked[kind] || status[kind] === "denied";
    setProblem(null);
    setAsked((all) => ({ ...all, [kind]: true }));
    invoke(settings ? "permission_settings" : "permission_request", { kind })
      .then(refresh)
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="card list" aria-label="Permissions">
      <div className="item">
        <div className="item__body">
          <b>Permissions</b>
          <InfoTip content="The switch is Alpha's own: off, Alpha doesn't use it even if macOS allows it. To take a grant back from macOS, use System Settings → Privacy & Security." label="About permissions" />
          {!desktop ? <div className="item__sub">macOS grants are shown in the desktop app only.</div> : null}
          {problem ? (
            <div className="notice models__line" role="alert">
              {problem}
            </div>
          ) : null}
        </div>
      </div>
      {PERMISSIONS.map(({ kind, label, icon: Icon, tip }) => {
        const s = status[kind];
        return (
          <div key={kind} className="item">
            <span className="item__ico" aria-hidden="true">
              <Icon size={16} />
            </span>
            <div className="item__body">
              <b>{label}</b>
              <InfoTip content={tip} label={`About ${label.toLowerCase()}`} />
            </div>
            {s ? <span className={PILL[s][0]}>{PILL[s][1]}</span> : null}
            {desktop && on[kind] && s && s !== "granted" ? (
              <button type="button" className="btn btn--sm" onClick={() => grant(kind)}>
                {kind === "logs" || asked[kind] || s === "denied" ? "Open System Settings" : "Grant access"}
              </button>
            ) : null}
            <button type="button" className={`switch${on[kind] ? "" : " switch--off"}`} role="switch" aria-checked={on[kind]} aria-label={label} onClick={() => flip(kind)} />
          </div>
        );
      })}
    </div>
  );
}
