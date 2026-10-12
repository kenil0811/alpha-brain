/**
 * The one dialog behind the sidebar's project menu ("module" in the code) (the UI rulebook §4 and
 * §8): A new project above it, which asks for a name. Move to, Change icon and Hidden projects are
 * submenus (the owner, 12 Oct: predefined choices are dropdowns, not pop-ups).
 */
import { useState } from "react";
import type { ModuleCard } from "../core/client";
import { Button, Dialog } from "../ui";

/** A new project made where this one sits now; this one moves into it (what ModulePage's
 *  Settings does too: `createModule`, then `moveModule`). */
export function NewAboveDialog({ module, onMake, onClose }: { module: ModuleCard; onMake: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const ready = name.trim().length > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`A new project above ${module.name}`}>
      <div className="dialog__body">It is made where {module.name} sits now, and {module.name} moves into it.</div>
      <input className="textfield" aria-label="The new project's name" placeholder="Its name, e.g. Avilo" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ready) onMake(name.trim()); }} />
      <div className="row dialog__actions" style={{ marginTop: "var(--space-4)" }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabledReason={ready ? undefined : "Give it a name first."} onClick={() => onMake(name.trim())}>
          Make it
        </Button>
      </div>
    </Dialog>
  );
}
