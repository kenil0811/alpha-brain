/**
 * Settings → Permissions: each thing Alpha may reach on this Mac, laid out as on
 * feat/bridge-parity. What macOS has granted, and asking for it, need the host's
 * permissions_status / permission_request / permission_settings (backend-requests.md §9), so each
 * row is marked coming soon and its button says so.
 */
import { AudioLines, Keyboard, type LucideIcon, Mic, PersonStanding, ScreenShare, ScrollText, Volume2 } from "lucide-react";
import { Button, InfoTip, SoonBadge, useComingSoon } from "../ui";

const PERMISSIONS: { kind: string; label: string; icon: LucideIcon; tip: string }[] = [
  { kind: "screen", label: "Screen", icon: ScreenShare, tip: "Alpha may see what is on your screen when you ask about it. macOS calls this Screen & System Audio Recording and may ask Alpha to reopen after you allow it." },
  { kind: "system_audio", label: "System audio", icon: Volume2, tip: "Alpha may listen to what your Mac plays: calls, meetings, videos. Shares macOS's Screen & System Audio Recording grant." },
  { kind: "microphone", label: "Microphone", icon: Mic, tip: "Alpha listens when you tap the mic or hold your push-to-talk key." },
  { kind: "speech", label: "Speech recognition", icon: AudioLines, tip: "Turns what you say into text on this Mac." },
  { kind: "accessibility", label: "Accessibility", icon: PersonStanding, tip: "Alpha may read the window you are in and act in other apps for you." },
  { kind: "input", label: "Input monitoring", icon: Keyboard, tip: "Alpha notices your push-to-talk key while another app is focused." },
  { kind: "logs", label: "System logs", icon: ScrollText, tip: "Alpha may read your Mac's logs to help when something goes wrong. macOS grants this as Full Disk Access." },
];

export function Permissions() {
  const soon = useComingSoon();
  return (
    <div className="card list" aria-label="Permissions">
      <div className="item">
        <div className="item__body">
          <b>Permissions</b>
          <InfoTip content="What macOS lets Alpha reach on this Mac. To take a grant back, use System Settings → Privacy & Security." label="About permissions" />
        </div>
      </div>
      {PERMISSIONS.map(({ kind, label, icon: Icon, tip }) => (
        <div key={kind} className="item">
          <span className="item__ico" aria-hidden="true">
            <Icon size={16} />
          </span>
          <div className="item__body">
            <b>{label}</b>
            <InfoTip content={tip} label={`About ${label.toLowerCase()}`} />
          </div>
          <SoonBadge />
          <Button variant="outline" size="sm" onClick={() => soon(`${label} access`)}>
            {/* macOS never prompts for Full Disk Access: it is only granted in System Settings. */}
            {kind === "logs" ? "Open System Settings" : "Allow"}
          </Button>
        </div>
      ))}
    </div>
  );
}
