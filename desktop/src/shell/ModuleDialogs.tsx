/**
 * The four small dialogs behind the sidebar's project menu ("module" in the code) (the UI rulebook §4 and §8): Move…,
 * A new project above it, Change icon, and View options (the hidden projects, with Show). Each
 * asks one thing, names the consequence, and ends in Cancel and the main action (§14). They do
 * nothing themselves: the sidebar calls the core and keeps the preferences.
 */
import { useState } from "react";
import { moduleWords, type ModuleCard } from "../core/client";
import { Button, Dialog, Dropdown } from "../ui";
import { ICON } from "../ui/icons";
import { MODULE_ICON_CHOICES } from "./moduleIcons";
import { isInside } from "./sidebarOrder";

const TOP = "__top__";

/** Move a project to the top level, or inside another one. Never into itself or what it holds,
 *  and not where it already is. */
export function MoveDialog({ module, modules, onMove, onClose }: { module: ModuleCard; modules: ModuleCard[]; onMove: (parent: string | null) => void; onClose: () => void }) {
  const [to, setTo] = useState("");
  const options = [
    ...(module.parent ? [{ value: TOP, label: "The top level" }] : []),
    ...modules.filter((m) => m.id !== module.parent && !isInside(modules, m.id, module.id)).map((m) => ({ value: m.id, label: moduleWords(m) })),
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Move ${module.name}`}>
      <div className="dialog__body">
        {options.length ? "Choose where it sits. What you ask in a project reaches the ones inside it." : `${module.name} has nowhere else to go yet: there are no other projects.`}
      </div>
      {options.length ? <Dropdown label="Move to" value={to} options={options} onChange={setTo} placeholder="Choose where…" /> : null}
      <div className="row dialog__actions" style={{ marginTop: "var(--space-4)" }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabledReason={to ? undefined : "Choose where it goes first."} onClick={() => onMove(to === TOP ? null : to)}>
          Move
        </Button>
      </div>
    </Dialog>
  );
}

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

/** A small picker over the curated icons; choosing one saves it. */
export function IconDialog({ module, current, onPick, onClose }: { module: ModuleCard; current: string | undefined; onPick: (name: string) => void; onClose: () => void }) {
  const chosen = MODULE_ICON_CHOICES.find((c) => c.name === current) ?? MODULE_ICON_CHOICES[0];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Icon for ${module.name}`}>
      <div className="iconpick" role="group" aria-label="Icons">
        {MODULE_ICON_CHOICES.map((c) => (
          <button key={c.name} type="button" className="iconpick__item" aria-label={c.label} aria-pressed={c === chosen} title={c.label} onClick={() => onPick(c.name)}>
            {c.draw(ICON)}
          </button>
        ))}
      </div>
      <div className="row dialog__actions" style={{ marginTop: "var(--space-4)" }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

/** What is hidden from the sidebar, each with Show. Hiding only takes a project off the sidebar:
 *  it, its records and its page are all still there. */
export function ViewOptionsDialog({ hidden, onShow, onClose }: { hidden: ModuleCard[]; onShow: (id: string) => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="View options">
      <div className="dialog__body">Hidden projects are off the sidebar only; their records and pages are untouched. Projects inside a hidden project are hidden with it.</div>
      {hidden.length ? (
        <ul className="viewopts">
          {hidden.map((m) => (
            <li key={m.id} className="viewopts__row">
              <span className="viewopts__name">{moduleWords(m)}</span>
              <Button size="sm" aria-label={`Show ${m.name}`} onClick={() => onShow(m.id)}>
                Show
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint">Nothing is hidden.</p>
      )}
      <div className="row dialog__actions" style={{ marginTop: "var(--space-4)" }}>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
