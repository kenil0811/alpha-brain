/**
 * Settings: only what a person decides, in sections beside a nav (pull request #3's layout): how
 * Zazoo thinks (Models), how the app looks, the companion, the core's own settings for project
 * look and builds, the desktop companion and voice, what macOS lets Zazoo reach, keyboard
 * shortcuts, and where the world is kept. Each section has an address (#/settings/<section>).
 * What isn't wired yet sits where it will live and says it's coming soon.
 */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { LookPicker } from "../avatar/LookPicker";
import type { ClaudeStatus, Client, DataInfo, Thinking } from "../core/client";
import { host } from "../core/host";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { Button, IconButton, InfoTip, Segmented, SoonBadge, Trouble, useComingSoon } from "../ui";
import { AppearanceIcon, BuildsIcon, CompanionIcon, DataIcon, DesktopIcon, LookIcon, ModelsIcon, PermissionsIcon, ResetIcon, ShortcutsIcon } from "../ui/icons";
import { followCompanion, FONTS, readAnimal, useAppearance, type Appearance } from "./appearance";
import { Models } from "./models";
import { ACCENTS, COMPANION_PALETTES } from "./palettes";
import { Permissions } from "./Permissions";
import { bindingOf, comboLabel, problemWith, recorded, sameCombo, saveBinding, SHORTCUTS, type Combo, type ShortcutId } from "./shortcuts";
import { ThemeControl, type Theme } from "./theme";
import { ANIMALS } from "../avatar/looks";

export const SETTINGS_SECTIONS: { value: string; label: string; icon: ComponentType }[] = [
  { value: "models", label: "Models", icon: ModelsIcon },
  { value: "appearance", label: "Appearance", icon: AppearanceIcon },
  { value: "companion", label: "Companion", icon: CompanionIcon },
  { value: "look", label: "Project look", icon: LookIcon },
  { value: "builds", label: "Builds", icon: BuildsIcon },
  { value: "desktop", label: "Desktop", icon: DesktopIcon },
  { value: "permissions", label: "Permissions", icon: PermissionsIcon },
  { value: "shortcuts", label: "Shortcuts", icon: ShortcutsIcon },
  { value: "data", label: "Data", icon: DataIcon },
];

/** A section the address names, or the first one. */
export function settingsSection(value: string | undefined): string {
  return SETTINGS_SECTIONS.some((s) => s.value === value) ? value! : "models";
}

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function readPageSize(): PageSize {
  try {
    const raw = localStorage.getItem(PAGE_SIZE_KEY);
    return raw ? (JSON.parse(raw) as PageSize) : "fit";
  } catch {
    return "fit";
  }
}

/** A row: a title, its explanation behind (i), maybe a coming-soon mark, and its control. */
function Row({ title, tip, soon, children }: { title: string; tip?: string; soon?: boolean; children?: ReactNode }) {
  return (
    <div className="item">
      <div className="item__body settings__title">
        <b>{title}</b>
        {tip ? <InfoTip text={tip} /> : null}
        {soon ? <SoonBadge /> : null}
      </div>
      {children}
    </div>
  );
}

function Swatches({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string; color: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="settings__swatches" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.label} title={o.label} className="settings__swatch" style={{ background: o.color }} onClick={() => onChange(o.value)} />
      ))}
    </div>
  );
}

function AppearanceSection({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const [a, update] = useAppearance();
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize);
  const animal = ANIMALS.find((x) => x.id === readAnimal())!;
  const palette = COMPANION_PALETTES[animal.id];
  const accents = [{ value: "companion", label: `${animal.name} (your companion)`, color: palette[0] }, ...ACCENTS.map((x) => ({ value: x.value, label: x.label, color: x.pair?.[0] ?? "#3f6f99" }))];
  const choosePageSize = (next: PageSize) => {
    setPageSize(next);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, JSON.stringify(next));
    } catch {
      /* the choice lasts this session */
    }
  };
  const seg = <K extends "size" | "density" | "corners" | "contrast" | "motion">(key: K, label: string, options: [Appearance[K], string][]) => (
    <Segmented label={label} value={a[key]} options={options.map(([value, text]) => ({ value, label: text }))} onChange={(v) => update({ [key]: v } as Partial<Appearance>)} />
  );
  return (
    <div className="card list" aria-label="Appearance">
      <Row title="Theme" tip="Match Mac follows the Mac's light or dark setting.">
        <ThemeControl theme={theme} onChange={onTheme} />
      </Row>
      <Row title="Companion colours" tip={`Tints the page, cards and borders with your companion's colours (the ${animal.name.toLowerCase()} now) and takes its accent. They follow the animal you choose under Companion.`}>
        <Segmented label="Companion colours" value={a.companion ? "on" : "off"} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} onChange={(v) => update(v === "on" ? { companion: true, accent: "companion" } : { companion: false, accent: a.accent === "companion" ? "steel" : a.accent })} />
      </Row>
      <Row title="Accent colour">
        <Swatches label="Accent colour" value={a.accent} options={accents} onChange={(accent) => update({ accent })} />
      </Row>
      <Row title="Font">
        <select className="btn btn--sm" value={a.font} aria-label="Font" onChange={(e) => update({ font: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Text size">{seg("size", "Text size", [["small", "Small"], ["default", "Default"], ["large", "Large"]])}</Row>
      <Row title="Density" tip="How much room forms, tables and cards take. Compact fits more on screen.">
        {seg("density", "Density", [["compact", "Compact"], ["comfortable", "Comfortable"]])}
      </Row>
      <Row title="Corners">{seg("corners", "Corners", [["sharp", "Sharp"], ["default", "Default"], ["round", "Round"]])}</Row>
      <Row title="Contrast" tip="Match Mac follows the Mac's Increase contrast setting. High makes secondary text and borders stronger in light and dark.">
        {seg("contrast", "Contrast", [["system", "Match Mac"], ["high", "High"]])}
      </Row>
      <Row title="Motion" tip="Match Mac follows the Mac's Reduce motion setting. Reduce stops animations here whatever the Mac says.">
        {seg("motion", "Motion", [["system", "Match Mac"], ["reduce", "Reduce"]])}
      </Row>
      <Row title="Rows per page" tip="How many rows a table shows at once.">
        <select className="btn btn--sm" value={String(pageSize)} onChange={(e) => choosePageSize(e.target.value === "fit" ? "fit" : Number(e.target.value))} aria-label="Rows per page">
          <option value="fit">Fit to window</option>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>
    </div>
  );
}

// The core's own settings, as bridge-parity's defines them, shown at their defaults. Changing
// one needs the core's settings (backend-requests.md §1 and §8).
const LOOK_RULES = `Every table a project keeps is drawn the same way everywhere: a table first, with board, list, calendar and chart a click away, a record page for each row, and edits in place.
A summary with the numbers that matter comes first when the project has numbers worth a glance; otherwise the main table comes first.
One subject per table, named by what it holds (Openings, Sources, Goals), never by a verb.
Freshness is visible: when something was added or last changed, when a source was last read and when the next check runs.
Plain words, sentence case, no jargon and no emoji in labels. Numbers carry their unit.
Estimates are labelled as estimates and can be corrected in place.
Nothing is invented: when a source cannot be read or a value is unknown, say so and store nothing made up.`;

function SoonChoice({ title, tip, what, value, options }: { title: string; tip: string; what: string; value: string; options: [string, string][] }) {
  const soon = useComingSoon();
  return (
    <Row title={title} tip={tip} soon>
      <select className="btn btn--sm" value={value} aria-label={title} onChange={() => soon(what)}>
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </Row>
  );
}

function LookSection() {
  const soon = useComingSoon();
  return (
    <div className="card list" aria-label="Project look">
      <div className="item item--stack">
        <div className="item__body settings__title">
          <b>Rules for how projects look and behave</b>
          <InfoTip text="Followed whenever Zazoo makes or changes a project's tables and views. Edit them to your taste or go back to Alpha's." />
          <SoonBadge />
        </div>
        {/* Held at the default: typing says it's coming soon instead of changing it. */}
        <textarea value={LOOK_RULES} rows={9} aria-label="Rules for how projects look and behave" onChange={() => soon("Editing the look rules")} />
      </div>
    </div>
  );
}

function BuildsSection() {
  return (
    <div className="card list" aria-label="Builds">
      <SoonChoice title="Model for making a project" what="Choosing the model for making projects" value="default" tip="The model that makes a new project and changes it. The most capable makes the best projects." options={[["default", "Same as the chat"], ["opus", "Claude Opus (most capable)"], ["sonnet", "Claude Sonnet (faster)"], ["haiku", "Claude Haiku (fastest)"]]} />
      <SoonChoice title="When Zazoo needs your OK" what="Choosing when Zazoo needs your OK" value="ask" tip="Ask for approval: always ask before Zazoo reads the web or removes a record. Approve for me: only ask for removing. Full access: no approval prompts. Sending, posting or anything outside Alpha always waits for your yes." options={[["ask", "Ask for approval"], ["approve_for_me", "Approve for me"], ["full", "Full access"]]} />
    </div>
  );
}

function DesktopSection({ onShortcuts }: { onShortcuts: () => void }) {
  const soon = useComingSoon();
  const [shown, setShown] = useState<boolean | null>(null);
  useEffect(() => {
    void host.companionVisible().then(setShown).catch(() => setShown(null));
  }, []);
  return (
    <div className="card list" aria-label="Desktop">
      <Row title="Companion on your desktop" tip="Zazoo's character stays above your other windows, for quick asks.">
        {shown === null ? (
          <span className="faint">Desktop app only</span>
        ) : (
          <button type="button" className={`switch${shown ? "" : " switch--off"}`} role="switch" aria-checked={shown} aria-label={shown ? "Hide the companion" : "Show the companion"} onClick={() => void host.setCompanionVisible(!shown).then((v) => setShown(v ?? !shown))} />
        )}
      </Row>
      <Row title="Speak replies" tip="Zazoo says its replies aloud in the companion. Start talking to cut it short." soon>
        <Segmented label="Speak replies" value="off" options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} onChange={() => soon("Speaking replies")} />
      </Row>
      <Row title="Push to talk" tip="Hold Fn anywhere, or a key you record in Shortcuts, to speak to Zazoo instead of typing. It needs Input monitoring permission." soon>
        <Button size="sm" onClick={() => soon("Push to talk")}>
          Fn (default)
        </Button>
        <Button size="sm" variant="ghost" onClick={onShortcuts}>
          Change in Shortcuts
        </Button>
      </Row>
      <SoonChoice title="Transcription" what="Choosing how speech is transcribed" value="automatic" tip="Automatic uses Whisper through Groq or OpenAI when a key is saved under Models, otherwise this Mac's own speech recognition." options={[["automatic", "Automatic"], ["native", "On this Mac"], ["groq", "Groq Whisper"], ["openai", "OpenAI Whisper"]]} />
    </div>
  );
}

/** Click a shortcut and press the new keys (Esc cancels); the window uses it at once. The Mac
 *  menu's own (⌘W, ⌘Q) and push to talk need the host first. */
function ShortcutsSection() {
  const soon = useComingSoon();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [problem, setProblem] = useState<{ id: ShortcutId; text: string } | null>(null);
  const [, setVersion] = useState(0);
  const save = (id: ShortcutId, combo: Combo | null) => {
    saveBinding(id, combo);
    setVersion((v) => v + 1);
  };
  useEffect(() => {
    if (!recording) return;
    // Capture, so the keys being recorded don't also open the command menu or close a panel.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        setProblem(null);
        return;
      }
      const combo = recorded(e);
      if (!combo) return;
      const why = problemWith(recording, combo);
      if (why) return setProblem({ id: recording, text: why });
      save(recording, combo);
      setProblem(null);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);
  return (
    <div className="card list" aria-label="Keyboard shortcuts">
      {SHORTCUTS.map((s) => {
        const combo = bindingOf(s.id);
        const on = recording === s.id;
        return (
          <div key={s.id} className="item">
            <Button
              size="sm"
              variant={on ? "primary" : "default"}
              className="settings__keys"
              aria-label={`${s.what}: ${comboLabel(combo)}. Change`}
              onClick={() => {
                setProblem(null);
                if (s.host) soon(`Changing ${comboLabel(combo)}`);
                else setRecording(on ? null : s.id);
              }}
            >
              {on ? "Press keys…" : comboLabel(combo)}
            </Button>
            <div className="item__body">
              {s.what}
              {problem?.id === s.id ? (
                <div className="item__sub item__sub--warn" role="alert">
                  {problem.text}
                </div>
              ) : null}
            </div>
            {sameCombo(combo, s.combo) ? null : <IconButton size="sm" label={`Reset “${s.what}” to ${comboLabel(s.combo)}`} icon={<ResetIcon />} onClick={() => save(s.id, null)} />}
          </div>
        );
      })}
      <div className="item">
        <Button size="sm" className="settings__keys" aria-label="Talk: hold Fn. Change" onClick={() => soon("Push to talk")}>
          Fn
        </Button>
        <div className="item__body settings__title">
          <SoonBadge /> Talk: hold Fn
        </div>
      </div>
    </div>
  );
}

function DataSection({ client }: { client: Client }) {
  const soon = useComingSoon();
  const [data, setData] = useState<DataInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    client
      .dataInfo()
      .then((d) => {
        setData(d);
        setTrouble(null);
      })
      .catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e)));
  }, [client, tick]);
  const last = data?.backups[0];
  return (
    <>
      {trouble ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load your data: {trouble}</Trouble> : null}
      <div className="card list" aria-label="Data">
        <div className="item">
          <div className="item__body">
            <b>Kept on this Mac</b>
            <div className="item__sub">{data ? `${data.folder} · ${bytes(data.size)}` : "…"}</div>
          </div>
          {host.available() ? (
            <Button size="sm" onClick={() => void host.revealData()}>
              Show in Finder
            </Button>
          ) : null}
        </div>
        <div className="item">
          <div className="item__body">
            <b>Backups</b>
            <div className="item__sub">{!data ? "…" : last ? `Last ${when(last.at)} · ${data.backups.length} kept` : "None yet"}</div>
          </div>
          <Button size="sm" disabled={busy} onClick={() => { setBusy(true); client.backUp().then(setData).catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}>
            {busy ? "Backing up…" : "Back up now"}
          </Button>
        </div>
        {data?.backups.slice(0, 5).map((b) => (
          <div className="item" key={b.name}>
            <div className="item__body item__sub">
              {when(b.at)} · {bytes(b.size)}
            </div>
            <Button size="sm" onClick={() => soon("Going back to a backup")}>
              Go back
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

export function Settings({ client, theme, onTheme, claude, onClaude, thinking, onThinking, section: requested, onSection }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void; thinking?: Thinking | null; onThinking?: (t: Thinking) => void; section?: string; onSection: (section: string) => void }) {
  const section = settingsSection(requested);
  // Whenever the section changes (leaving Companion included), take the companion's colours.
  useEffect(() => followCompanion(client), [client, section]);
  useEffect(() => {
    client.claude().then(onClaude).catch(() => undefined);
  }, [client, onClaude]);
  return (
    <div className="page settings">
      <div className="home__head">
        <h1>Settings</h1>
      </div>
      <div className="settings__layout">
        <nav className="settings__nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" className="settings__navitem" aria-current={value === section ? "page" : undefined} onClick={() => onSection(value)}>
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings__content">
          {section === "models" ? <Models client={client} claude={claude} onClaude={onClaude} thinking={thinking} onThinking={onThinking} /> : null}
          {section === "appearance" ? <AppearanceSection theme={theme} onTheme={onTheme} /> : null}
          {section === "companion" ? (
            <div className="card list" aria-label="Companion">
              <div className="item item--stack">
                <div className="item__body">
                  <b>The companion's look</b>
                  <div className="item__sub">The animal and what it wears. It is Zazoo whichever you pick; the artwork is Bridge's, with thanks.</div>
                </div>
                <LookPicker client={client} />
              </div>
            </div>
          ) : null}
          {section === "look" ? <LookSection /> : null}
          {section === "builds" ? <BuildsSection /> : null}
          {section === "desktop" ? <DesktopSection onShortcuts={() => onSection("shortcuts")} /> : null}
          {section === "permissions" ? <Permissions /> : null}
          {section === "shortcuts" ? <ShortcutsSection /> : null}
          {section === "data" ? <DataSection client={client} /> : null}
        </div>
      </div>
    </div>
  );
}
