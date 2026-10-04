/**
 * Settings, as in Alpha: a header, then a second nav column (icon, label, a dot on the current
 * section) beside the section. Models (how Alpha thinks), Appearance, Avatar (the companion's
 * animal, outfit and colours), Project look and Builds (the core's own settings), Desktop (the
 * companion window and voice), Permissions, Shortcuts, Data, and About (what leaves this Mac, and
 * re-entering first steps).
 * Explanations sit behind (i). What isn't wired yet is there and says "coming soon".
 * `section` / `onSection` come from the address (#/settings/<section>); without them the last
 * section is remembered per window.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Hammer, HardDrive, Info, Keyboard, type LucideIcon, Monitor, Palette, PawPrint, RotateCcw, Settings as SettingsIcon, Shapes, ShieldCheck } from "lucide-react";
import { ACCESSORIES, type AvatarLook, BODY_COLORS, DEFAULT_LOOK, kindLabel, saveLook, SHIRT_COLORS, speciesOf, SUIT_COLORS, TIE_COLORS, useLook } from "../avatar/look";
import { CompanionZazooFace } from "../avatar/zazoo/CompanionZazooFace";
import { ZazooDirector } from "../avatar/zazoo/director";
import { SPECIES } from "../avatar/zazoo/species";
import type { Client, DataInfo, Thinking } from "../core/client";
import { host } from "../core/host";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { IconButton, InfoTip, SoonBadge, Textarea, useComingSoon } from "../ui";
import { StandardDropdown } from "../ui/StandardDropdown";
import { Segmented } from "../ui/Segmented";
import { ACCENTS, CORNERS, DENSITIES, FONTS, SIZES, useAppearance } from "./appearance";
import { Models } from "./models";
import { COMPANION_PALETTES } from "./palettes";
import { OPEN_ONBOARDING } from "./OnboardingDialog";
import { Permissions } from "./Permissions";
import { bindingOf, type Combo, comboLabel, problemWith, recorded, sameCombo, saveBinding, SHORTCUTS, type ShortcutId } from "./shortcuts";
import { ThemeControl, type Theme } from "./theme";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

const SECTION_KEY = "alpha.settings.section";
export const SETTINGS_SECTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "models", label: "Models", icon: Cpu },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "avatar", label: "Avatar", icon: PawPrint },
  { value: "look", label: "Project look", icon: Shapes },
  { value: "builds", label: "Builds", icon: Hammer },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "permissions", label: "Permissions", icon: ShieldCheck },
  { value: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { value: "data", label: "Data", icon: HardDrive },
  { value: "about", label: "About", icon: Info },
];
// An older build's section names.
const RENAMED: Record<string, string> = { companion: "desktop", claude: "models" };

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

function known(value: string | null | undefined): string | null {
  const v = value ? (RENAMED[value] ?? value) : null;
  return v && SETTINGS_SECTIONS.some((s) => s.value === v) ? v : null;
}

function readSection(): string {
  try {
    return known(localStorage.getItem(SECTION_KEY)) ?? "models";
  } catch {
    return "models";
  }
}

/** A two-way choice (Shown/Hidden, On/Off). */
function Toggle({ label, on, onChange, labels }: { label: string; on: boolean; onChange: (on: boolean) => void; labels: [string, string] }) {
  return <Segmented label={label} value={on ? "on" : "off"} options={[{ value: "on", label: labels[0] }, { value: "off", label: labels[1] }]} onChange={(v) => onChange(v === "on")} />;
}

/** A row of colour swatches, one of which is chosen. */
function Swatches({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string; color: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="settings__swatches" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value.toLowerCase() === o.value.toLowerCase()} aria-label={o.label} title={o.label} className="settings__swatch" style={{ background: o.color }} onClick={() => onChange(o.value)} />
      ))}
    </div>
  );
}

function Row({ title, tip, children }: { title: ReactNode; tip?: string; children: ReactNode }) {
  return (
    <div className="item">
      <div className="item__body">
        <b>{title}</b>
        {tip ? <InfoTip content={tip} label={`About ${typeof title === "string" ? title.toLowerCase() : "this"}`} /> : null}
      </div>
      {children}
    </div>
  );
}

const CONTRASTS = [
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
];
const MOTIONS = [
  { value: "system", label: "Match Mac" },
  { value: "reduce", label: "Reduce" },
];

function Appearance({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const [appearance, update] = useAppearance();
  const look = useLook();
  const kind = kindLabel(speciesOf(look));
  const companion = COMPANION_PALETTES[look.species];
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize);
  const choosePageSize = useCallback((next: PageSize) => {
    setPageSize(next);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, JSON.stringify(next));
    } catch {
      /* the choice lasts this session */
    }
  }, []);
  const accents = [
    ...(companion ? [{ value: "companion", label: `${kind} (your companion)`, color: companion[0] }] : []),
    ...ACCENTS.map((a) => ({ value: a.value, label: a.label, color: a.pair?.[0] ?? "#4d7ea8" })),
  ];
  return (
    <div className="card list" aria-label="Appearance">
      <Row title="Theme" tip="Match Mac follows the Mac's setting. Ambient is light from 7:00 to 19:00 and dark otherwise.">
        <ThemeControl theme={theme} onChange={onTheme} />
      </Row>
      <Row title="Companion colours" tip={`Tints the page, cards and borders with your companion's colours (the ${kind.toLowerCase()} now) and takes its accent. Pick another accent to keep your own.`}>
        <Toggle label="Companion colours" on={appearance.companion} labels={["On", "Off"]} onChange={(on) => update(on ? { companion: true, accent: "companion" } : { companion: false, accent: appearance.accent === "companion" ? "steel" : appearance.accent })} />
      </Row>
      <Row title="Accent colour">
        <Swatches label="Accent colour" value={appearance.accent} options={accents} onChange={(accent) => update({ accent })} />
      </Row>
      <Row title="Font">
        <StandardDropdown ariaLabel="Font" options={FONTS} value={appearance.font} onChange={(font) => update({ font })} />
      </Row>
      <Row title="Text size">
        <Segmented label="Text size" value={appearance.size} options={SIZES} onChange={(size) => update({ size })} />
      </Row>
      <Row title="Density" tip="How much room forms, tables and cards take. Compact fits more on screen.">
        <Segmented label="Density" value={appearance.density} options={DENSITIES} onChange={(density) => update({ density })} />
      </Row>
      <Row title="Corners">
        <Segmented label="Corners" value={appearance.corners} options={CORNERS} onChange={(corners) => update({ corners })} />
      </Row>
      <Row title="Contrast" tip="High makes secondary text and borders darker in light mode and brighter in dark mode.">
        <Segmented label="Contrast" value={appearance.contrast} options={CONTRASTS} onChange={(contrast) => update({ contrast })} />
      </Row>
      <Row title="Motion" tip="Reduce stops animations and holds your companion still. Match Mac follows the Mac's Reduce motion setting.">
        <Segmented label="Motion" value={appearance.motion} options={MOTIONS} onChange={(motion) => update({ motion })} />
      </Row>
      <Row title="Rows per page" tip="How many rows a table shows at once.">
        <StandardDropdown
          ariaLabel="Rows per page"
          options={[{ value: "fit", label: "Fit to window" }, ...PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))]}
          value={String(pageSize)}
          onChange={(v) => choosePageSize(v === "fit" ? "fit" : Number(v))}
        />
      </Row>
    </div>
  );
}

const swatches = (colors: [string, string][]) => colors.map(([color, label]) => ({ value: color, label, color }));

/** The companion: which animal, what it wears (Bridge's Zazoo Lab wardrobe), and its colours. */
function AvatarSettings() {
  const look = useLook();
  const [appearance, updateAppearance] = useAppearance();
  const species = speciesOf(look);
  const kind = kindLabel(species);
  const director = useMemo(() => new ZazooDirector(), []);
  const change = (next: Partial<AvatarLook>) => {
    saveLook({ ...look, ...next });
    director.perform({ emotion: "happy", warmth: 0.9, duration: 1.4 });
  };
  const palette = COMPANION_PALETTES[species.id];
  const themed = appearance.companion && appearance.accent === "companion";
  const furs: [string, string][] = [[species.body, `${kind}'s own`], ...BODY_COLORS.filter(([c]) => c.toLowerCase() !== species.body.toLowerCase())];
  return (
    <div className="card list" aria-label="Avatar">
      <div className="item avatar-settings__head">
        <div className="avatar-settings__preview">
          <CompanionZazooFace director={director} size={112} label={`Zazoo as a ${kind.toLowerCase()}`} crop={false} />
        </div>
        <div className="item__body stack avatar-settings__pick">
          <b>Animal</b>
          <StandardDropdown
            ariaLabel="Animal"
            options={SPECIES.map((s) => ({ value: s.id, label: kindLabel(s) }))}
            value={species.id}
            onChange={(id) => change({ species: id, body: SPECIES.find((s) => s.id === id)?.body ?? look.body })}
          />
          <div className="row">
            <Button variant="outline" size="sm" onClick={() => saveLook(DEFAULT_LOOK)} disabled={JSON.stringify(look) === JSON.stringify(DEFAULT_LOOK)}>
              <RotateCcw size={14} aria-hidden="true" /> Reset to Zazoo
            </Button>
          </div>
        </div>
      </div>
      {palette ? (
        <Row title={`${kind} colours`} tip="Tints the page, cards and borders with these colours and uses its accent. Appearance can turn it off or keep your own accent.">
          <span className="avatar-settings__palette" aria-hidden="true">
            {palette.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
          {themed ? (
            <Badge variant="info">In use</Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={() => updateAppearance({ companion: true, accent: "companion" })}>
              Use
            </Button>
          )}
        </Row>
      ) : null}
      <Row title="Fur">
        <Swatches label="Fur" value={look.body} options={swatches(furs)} onChange={(body) => change({ body })} />
      </Row>
      <Row title="Suit">
        <Swatches label="Suit" value={look.suit} options={swatches(SUIT_COLORS)} onChange={(suit) => change({ suit })} />
      </Row>
      <Row title="Tie" tip="Also colours the bow tie and the scarf.">
        <Swatches label="Tie" value={look.tie} options={swatches(TIE_COLORS)} onChange={(tie) => change({ tie })} />
      </Row>
      <Row title="Shirt">
        <Swatches label="Shirt" value={look.shirt} options={swatches(SHIRT_COLORS)} onChange={(shirt) => change({ shirt })} />
      </Row>
      <Row title="Accessories" tip="Wear any mix, or none.">
        <Segmented multiple label="Accessories" value={look.accessories} options={ACCESSORIES} onChange={(accessories) => change({ accessories })} />
      </Row>
    </div>
  );
}

function DataAndRuntime({ client }: { client: Client }) {
  const [data, setData] = useState<DataInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const soon = useComingSoon();
  useEffect(() => {
    client.dataInfo().then(setData).catch(() => undefined);
  }, [client]);
  const last = data?.backups[0];
  return (
    <div className="card list" aria-label="Data and runtime">
      <div className="item">
        <div className="item__body">
          <b>Where your data lives</b>
          <div className="item__sub models__line" title={data?.folder}>
            {data ? `${data.folder} · ${bytes(data.size)}` : "…"}
          </div>
        </div>
        {host.available() ? (
          <Button variant="outline" size="sm" onClick={() => void host.revealData()}>
            Show in Finder
          </Button>
        ) : null}
      </div>
      <div className="item">
        <div className="item__body">
          <b>Backups</b>
          <div className="item__sub">{!data ? "…" : last ? `Last ${when(last.at)} · ${data.backups.length} kept` : "None yet"}</div>
          {problem ? (
            <div className="notice models__line" role="alert">
              {problem}
            </div>
          ) : null}
        </div>
        <Button
          variant="outline" size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setProblem(null);
            client
              .backUp()
              .then(setData)
              .catch((e: unknown) => setProblem(e instanceof Error ? e.message : String(e)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Backing up…" : "Back up now"}
        </Button>
      </div>
      {data?.backups.slice(0, 5).map((b) => (
        <div className="item" key={b.name}>
          <div className="item__body">
            <div className="item__sub">
              {when(b.at)} · {bytes(b.size)}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => soon("Going back to a backup")}>
            Go back
          </Button>
        </div>
      ))}
    </div>
  );
}

/** The desktop assistant window: shown or hidden, remembered by the host. Mac app only. */
function AvatarSetting() {
  const [shown, setShown] = useState<boolean | null>(null);
  useEffect(() => {
    void host.companionVisible().then(setShown).catch(() => setShown(null));
  }, []);
  const set = (visible: boolean) => {
    setShown(visible);
    void host
      .setCompanionVisible(visible)
      .then((v) => setShown(v ?? visible))
      .catch(() => setShown(!visible));
  };
  return (
    <div className="card list" aria-label="Desktop assistant">
      <div className="item">
        <div className="item__body">
          <b>Zazoo on your desktop</b>
          <InfoTip content="A small Zazoo stays above your other windows. Click it or speak to log something, ask a question, open a project or start something new." label="About the desktop assistant" />
          {shown === null ? <div className="item__sub">Desktop app only.</div> : null}
        </div>
        {shown !== null ? <Toggle label="Desktop assistant" on={shown} onChange={set} labels={["Shown", "Hidden"]} /> : null}
      </div>
    </div>
  );
}

/** Speak replies, push to talk and how speech is transcribed, after bridge-parity's: they need
 *  the host's speech and key watching (backend-requests.md §9) and Whisper (§2), so for now each
 *  sits at its default and says it's coming soon. The talk key itself lives in Shortcuts. */
const TRANSCRIPTION_OPTIONS = [
  { value: "automatic", label: "Automatic" },
  { value: "native", label: "On this Mac" },
  { value: "groq", label: "Groq Whisper" },
  { value: "openai", label: "OpenAI Whisper" },
];

function VoiceSettings({ onShortcuts }: { onShortcuts: () => void }) {
  const soon = useComingSoon();
  return (
    <div className="card list" aria-label="Voice">
      <div className="item">
        <div className="item__body">
          <b>Speak replies</b>
          <InfoTip content="Zazoo says its replies aloud in the desktop assistant. Start talking to cut it short." label="About speak replies" />
          <SoonBadge />
        </div>
        <Toggle label="Speak replies" on={false} onChange={() => soon("Speaking replies")} labels={["On", "Off"]} />
      </div>
      <div className="item">
        <div className="item__body">
          <b>Push to talk</b>
          <InfoTip content="Hold Fn anywhere, or a key you record in Shortcuts, to speak to Zazoo instead of typing. Release to stop. It needs Input Monitoring permission." label="About push to talk" />
          <SoonBadge />
        </div>
        <div className="row settings__ptt">
          <Button variant="outline" size="sm" onClick={() => soon("Push to talk")}>
            Fn (default)
          </Button>
          <Button variant="ghost" size="sm" onClick={onShortcuts}>
            Change in Shortcuts
          </Button>
        </div>
      </div>
      <div className="item">
        <div className="item__body">
          <b>Transcription</b>
          <InfoTip content="Automatic uses Whisper through Groq or OpenAI when a key is saved in Settings → Models, otherwise this Mac's own speech recognition." label="About transcription" />
          <SoonBadge />
        </div>
        <StandardDropdown options={TRANSCRIPTION_OPTIONS} value="automatic" onChange={() => soon("Choosing how speech is transcribed")} ariaLabel="Transcription" />
      </div>
    </div>
  );
}

// The core's own settings, as bridge-parity's core/alpha/models/settings.py defines them, shown
// at their defaults. Changing one needs GET/PATCH /api/settings (backend-requests.md §1 and §8).
const LOOK_RULES = `Every table a project keeps is drawn by Alpha the same way everywhere: a table first, with board, list, calendar and chart a click away, a record page for each row, and edits in place. Declare the tables well: a title field, a status field with its finished values, and the columns the person scans first.
A summary with the numbers that matter (at most four cards, a progress bar against a goal, a trend when numbers change over time) comes first when the project has numbers worth a glance; otherwise the main table comes first.
One subject per table, named by what it holds (Openings, Sources, Goals), never by a verb. Five tables at most.
Freshness is visible: when something was added or last changed, when a source was last read and when the next check runs.
Plain words, sentence case, no jargon and no emoji in labels. Numbers carry their unit. Dates read as 27 Sep, times in the person's local time.
Compact. No decorative headings or explanatory text above the data; one short empty-state line that says what to do next.
Anything that runs on its own is visible under Automations with an on/off switch, and every action answers in one sentence saying what happened.
Estimates are labelled as estimates and can be corrected in place.
Nothing is invented: when a source cannot be read or a value is unknown, say so and store nothing made up.`;

const GROUPS: Record<string, { title: string; tip: string }> = {
  Models: { title: "Thinking", tip: "How long the model thinks before it answers. The provider and its model are chosen on the rows above. Changes apply to the next message." },
  Look: { title: "Look", tip: "How every project is drawn, and rules Zazoo follows when it makes or changes one." },
  "Making projects": { title: "Making projects", tip: "How Zazoo makes a new project." },
  Access: { title: "Access", tip: "The starting point for every new chat." },
};

const CORE_SETTINGS: { id: string; group: string; title: string; tip: string; soon: string; value: string; options?: { value: string; label: string }[] }[] = [
  {
    id: "models.effort", group: "Models", title: "How long it thinks", soon: "Choosing how long it thinks", value: "default",
    tip: "How long the model thinks before it answers, on Claude. Low answers fastest; high takes longest. Applies from the next message.",
    options: [{ value: "low", label: "Low (fastest)" }, { value: "medium", label: "Medium" }, { value: "high", label: "High (slowest)" }, { value: "default", label: "Claude Code's default" }],
  },
  { id: "look.rules", group: "Look", title: "Rules for how projects should look and behave", soon: "Editing the look rules", value: LOOK_RULES, tip: "Alpha's defaults, in plain sentences, followed whenever Zazoo makes or changes a project's tables and views. Edit them to your taste or reset to Alpha's." },
  {
    id: "build.model", group: "Making projects", title: "Model for making a project", soon: "Choosing the model for making projects", value: "default",
    tip: "The Claude model that makes a new project and changes it. The most capable model makes the best projects.",
    options: [{ value: "default", label: "Same as the chat" }, { value: "opus", label: "Claude Opus (most capable)" }, { value: "sonnet", label: "Claude Sonnet (faster)" }, { value: "haiku", label: "Claude Haiku (fastest)" }],
  },
  {
    id: "access.mode", group: "Access", title: "When Alpha needs your OK", soon: "Choosing when Alpha needs your OK", value: "ask",
    tip: "Ask for approval: always ask before Alpha reads the web through its browser or removes a record. Approve for me: only ask for removing. Full access: no approval prompts. Sending, posting or anything outside Alpha always waits for your yes, and moving money or entering passwords is never possible.",
    options: [{ value: "ask", label: "Ask for approval" }, { value: "approve_for_me", label: "Approve for me" }, { value: "full", label: "Full access" }],
  },
];

/** The core's settings for some groups, at their defaults; changing one says it's coming soon. */
function SoonSettings({ groups }: { groups: string[] }) {
  const soon = useComingSoon();
  return (
    <>
      {groups.map((group) => (
        <div key={group} className="card list" aria-label={GROUPS[group].title}>
          <div className="item">
            <div className="item__body">
              <b>{GROUPS[group].title}</b>
              <InfoTip content={GROUPS[group].tip} label={`About ${GROUPS[group].title.toLowerCase()}`} />
            </div>
            <SoonBadge />
          </div>
          {CORE_SETTINGS.filter((f) => f.group === group).map((f) => (
            <div key={f.id} className={f.options ? "item" : "item item--stack"}>
              <div className="item__body">
                <b>{f.title}</b>
                <InfoTip content={f.tip} label={`About ${f.title.toLowerCase()}`} />
              </div>
              {f.options ? (
                <StandardDropdown options={f.options} value={f.value} onChange={() => soon(f.soon)} ariaLabel={f.title} />
              ) : (
                <div className="settings__text">
                  {/* Held at the default: typing says it's coming soon instead of changing it. */}
                  <Textarea value={f.value} rows={10} aria-label={f.title} onChange={() => soon(f.soon)} />
                  <span className="faint">Alpha's defaults.</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** Settings → Shortcuts: click one and press the new keys (Esc cancels); the window uses it at
 *  once. The Mac menu's own (⌘W, ⌘Q) and push to talk need the host first. */
function Shortcuts() {
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
      <div className="item">
        <div className="item__body">
          <b>Keyboard shortcuts</b>
          <InfoTip content="Click a shortcut, then press the keys you want. Esc cancels." label="About keyboard shortcuts" />
        </div>
      </div>
      {SHORTCUTS.map((s) => {
        const combo = bindingOf(s.id);
        const on = recording === s.id;
        return (
          <div key={s.id} className="item settings__shortcut">
            <Button
              variant={on ? "default" : "outline"}
              size="sm"
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
            <span className="item__body">
              {s.what}
              {problem?.id === s.id ? (
                <span className="notice models__line settings__clash" role="alert">
                  {problem.text}
                </span>
              ) : null}
            </span>
            {sameCombo(combo, s.combo) ? null : (
              <IconButton size="sm" aria-label={`Reset “${s.what}” to ${comboLabel(s.combo)}`} title="Reset to default" onClick={() => save(s.id, null)}>
                <RotateCcw size={14} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        );
      })}
      <div className="item settings__shortcut">
        <Button variant="outline" size="sm" className="settings__keys" aria-label="Talk: hold Fn. Change" onClick={() => soon("Push to talk")}>
          Fn
        </Button>
        <span className="item__body settings__talk">
          <SoonBadge /> Talk: hold Fn
        </span>
      </div>
    </div>
  );
}

/** pr1's About: what leaves this Mac. */
function About({ to }: { to: string }) {
  return (
    <div className="card list" aria-label="About">
      <div className="item">
        <div className="item__body">
          <b>What leaves this Mac</b>
          <InfoTip content="Your requests, and what Zazoo needs to answer them, go to Claude or ChatGPT, whichever is the default under Models, through your own sign-in. Projects read the web only when they were made to, and sites you signed into only through Alpha's browser. Records, files and settings stay in the folder under Data & runtime." label="About what leaves this Mac" />
          <div className="item__sub models__line">Your requests go to {to}.</div>
        </div>
      </div>
      <Row title="First steps" tip="The questions from your first run: your companion's name, your work, and where Zazoo should begin. Your last answers are filled in.">
        <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_ONBOARDING))}>
          Re-enter onboarding
        </Button>
      </Row>
    </div>
  );
}

export function Settings({ client, theme, onTheme, thinking, onThinking, section: requested, onSection }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; thinking: Thinking | null; onThinking: (t: Thinking) => void; section?: string; onSection?: (section: string) => void }) {
  const [own, setOwn] = useState(readSection);
  const section = known(requested) ?? (onSection ? "models" : own);
  const setSection = (next: string) => {
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {
      /* per-window convenience only */
    }
    if (onSection) onSection(next);
    else setOwn(next);
  };
  return (
    <section aria-labelledby="settings-heading" className="settings">
      <header className="settings__head">
        <span className="settings__headico" aria-hidden="true">
          <SettingsIcon size={16} />
        </span>
        <h2 id="settings-heading">Settings</h2>
        <InfoTip content="How Alpha works on this Mac." label="About Settings" />
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" className={value === section ? "settings-nav__item settings-nav__item--current" : "settings-nav__item"} aria-current={value === section ? "page" : undefined} onClick={() => setSection(value)} title={label}>
              <Icon size={16} aria-hidden="true" />
              <span className="settings-nav__label">{label}</span>
              {value === section ? <span className="settings-nav__dot" aria-hidden="true" /> : null}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === "models" ? (
            <>
              <Models client={client} thinking={thinking} onThinking={onThinking} />
              <SoonSettings groups={["Models"]} />
            </>
          ) : null}
          {section === "appearance" ? <Appearance theme={theme} onTheme={onTheme} /> : null}
          {section === "avatar" ? <AvatarSettings /> : null}
          {section === "look" ? <SoonSettings groups={["Look"]} /> : null}
          {section === "builds" ? <SoonSettings groups={["Making projects", "Access"]} /> : null}
          {section === "desktop" ? (
            <>
              <AvatarSetting />
              <VoiceSettings onShortcuts={() => setSection("shortcuts")} />
              <div className="card list" aria-label="Running in the background">
                <div className="item">
                  <div className="item__body">
                    <b>Runs while Alpha is open</b>
                    <InfoTip content="Closing the window keeps Alpha running from the menu bar. Quit stops everything." label="About running in the background" />
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {section === "permissions" ? <Permissions /> : null}
          {section === "shortcuts" ? <Shortcuts /> : null}
          {section === "data" ? <DataAndRuntime client={client} /> : null}
          {section === "about" ? <About to={thinking?.route === "codex" ? "ChatGPT" : "Claude"} /> : null}
        </div>
      </div>
    </section>
  );
}
