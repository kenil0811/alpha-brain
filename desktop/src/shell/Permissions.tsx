/**
 * Settings → Permissions: each thing Zazoo may reach on this Mac (pull request #3's). What macOS
 * has granted, and asking for it, need the host's permission commands (backend-requests.md §9),
 * so each row is marked coming soon and its button says so.
 */
import type { ComponentType } from "react";
import { Button, InfoTip, SoonBadge, useComingSoon } from "../ui";
import { AudioLines, Keyboard, Mic, PersonStanding, ScreenShare, ScrollText, Volume2 } from "../ui/icons";

const PERMISSIONS: { kind: string; label: string; icon: ComponentType<{ size?: number }>; tip: string }[] = [
  { kind: "screen", label: "Screen recording", icon: ScreenShare, tip: "Zazoo may see what is on your screen when you ask about it. macOS calls this Screen & System Audio Recording and may ask Alpha to reopen after you allow it." },
  { kind: "system_audio", label: "System audio", icon: Volume2, tip: "Zazoo may listen to what your Mac plays: calls, meetings, videos. It shares macOS's Screen & System Audio Recording grant." },
  { kind: "microphone", label: "Microphone", icon: Mic, tip: "Zazoo listens when you tap the mic or hold your push-to-talk key." },
  { kind: "speech", label: "Speech recognition", icon: AudioLines, tip: "Turns what you say into text on this Mac." },
  { kind: "accessibility", label: "Accessibility", icon: PersonStanding, tip: "Zazoo may read the window you are in and act in other apps for you." },
  { kind: "input", label: "Input monitoring", icon: Keyboard, tip: "Zazoo notices your push-to-talk key while another app is in front." },
  { kind: "logs", label: "System logs", icon: ScrollText, tip: "Zazoo may read your Mac's logs to help when something goes wrong. macOS grants this as Full Disk Access." },
];

export function Permissions() {
  const soon = useComingSoon();
  return (
    <div className="card list" aria-label="Permissions">
      {PERMISSIONS.map(({ kind, label, icon: Icon, tip }) => (
        <div key={kind} className="item">
          <span className="item__ico" aria-hidden="true">
            <Icon size={16} />
          </span>
          <div className="item__body settings__title">
            <b>{label}</b>
            <InfoTip text={tip} />
            <SoonBadge />
          </div>
          <Button size="sm" onClick={() => soon(`${label} access`)}>
            {/* macOS never prompts for Full Disk Access: it is only granted in System Settings. */}
            {kind === "logs" ? "Open System Settings" : "Allow"}
          </Button>
        </div>
      ))}
    </div>
  );
}
