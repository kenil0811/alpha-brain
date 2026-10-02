/**
 * Settings, as in Alpha: a header, then a second nav column (icon, label, a dot on the current
 * section) beside the section. Models (every way Alpha can reach a model, then how long it
 * thinks), Appearance, Project look (the rules Chief of Staff follows for tables and views),
 * Builds (making projects, and when Alpha needs your OK), Desktop (the companion, voice),
 * Data & runtime, and About (what leaves this Mac, shortcuts). Explanations sit behind (i).
 * `section` / `onSection` come from the address (#/settings/<section>); without them the last
 * section is remembered per window.
 */
import { useCallback, useEffect, useState } from "react";
import { Cpu, Hammer, HardDrive, Info, type LucideIcon, Monitor, Palette, Settings as SettingsIcon, Shapes } from "lucide-react";
import type { Client, DataInfo, HealthInfo, ModelProvider, SettingField } from "../core/client";
import { host } from "../core/host";
import { hasTauri } from "../core/session";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { InfoTip, useOptionalToast } from "../ui";
import { ACCENTS, DENSITIES, FONTS, SIZES, useAppearance } from "./appearance";
import { ProviderAccounts } from "./models";
import { keycodeFor, labelFor, type PttShortcut, readShortcut, shortcutLabel, writeShortcut } from "./ptt";
import { ThemeControl, type Theme } from "./theme";
import { setSpeakEnabled, speakEnabled } from "./tts";
import { readTranscriptionMode, type TranscriptionMode, writeTranscriptionMode } from "./voice";

const SECTION_KEY = "alpha.settings.section";
export const SETTINGS_SECTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "models", label: "Models", icon: Cpu },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "look", label: "Project look", icon: Shapes },
  { value: "builds", label: "Builds", icon: Hammer },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "data", label: "Data & runtime", icon: HardDrive },
  { value: "about", label: "About", icon: Info },
];
// An older build's section names.
const RENAMED: Record<string, string> = { companion: "desktop" };

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

/** A two-way choice in Alpha's segmented style (Shown/Hidden, On/Off). */
function Toggle({ label, on, onChange, labels }: { label: string; on: boolean; onChange: (on: boolean) => void; labels: [string, string] }) {
  return (
    <div className="theme" role="group" aria-label={label}>
      <button type="button" aria-pressed={on} onClick={() => onChange(true)}>
        {labels[0]}
      </button>
      <button type="button" aria-pressed={!on} onClick={() => onChange(false)}>
        {labels[1]}
      </button>
    </div>
  );
}

/** Core's settings for some groups, edited in place; a change is saved as it is made. */
function ConfigurableSettings({ client, groups, titles }: { client: Client; groups: string[]; titles: Record<string, { title: string; tip: string }> }) {
  const [fields, setFields] = useState<SettingField[] | null>(null);
  const toast = useOptionalToast();
  useEffect(() => {
    let live = true;
    client
      .settings()
      .then((all) => live && setFields(all))
      .catch(() => live && setFields([]));
    return () => {
      live = false;
    };
  }, [client]);
  const change = async (field: SettingField, raw: string) => {
    const value = field.kind === "integer" ? Number(raw) : raw;
    if (field.kind === "integer" && !Number.isInteger(value)) return;
    setFields((all) => (all ?? []).map((f) => (f.id === field.id ? { ...f, value } : f)));
    try {
      setFields(await client.updateSettings({ [field.id]: value }));
      toast?.show(`Saved. ${field.title} applies from the next time it is used.`);
    } catch (e) {
      toast?.show(`Could not save ${field.title.toLowerCase()}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  if (!fields?.length) return null;
  return (
    <>
      {groups.map((group) => {
        const shown = fields.filter((f) => f.group === group);
        if (!shown.length) return null;
        return (
          <div key={group} className="card list" aria-label={titles[group]?.title ?? group}>
            <div className="item">
              <div className="item__body">
                <b>{titles[group]?.title ?? group}</b>
                {titles[group] ? <InfoTip content={titles[group].tip} label={`About ${titles[group].title.toLowerCase()}`} /> : null}
              </div>
            </div>
            {shown.map((f) => (
              <div key={f.id} className={f.kind === "text" ? "item item--stack" : "item"}>
                <div className="item__body">
                  <b>
                    <label htmlFor={`setting-${f.id}`}>{f.title}</label>
                  </b>
                  {f.description ? <InfoTip content={f.description} label={`About ${f.title.toLowerCase()}`} /> : null}
                </div>
                {f.kind === "text" ? (
                  <div className="settings__text">
                    <textarea key={String(f.value)} id={`setting-${f.id}`} defaultValue={String(f.value)} rows={10} maxLength={f.maximum ?? undefined} onBlur={(e) => e.target.value !== String(f.value) && void change(f, e.target.value)} />
                    {String(f.value) !== String(f.default) ? (
                      <div className="row">
                        <button type="button" className="btn btn--sm" onClick={() => void change(f, String(f.default))}>
                          Reset to Alpha's defaults
                        </button>
                      </div>
                    ) : (
                      <span className="faint">Alpha's defaults. Edit freely; reset any time.</span>
                    )}
                  </div>
                ) : f.kind === "choice" ? (
                  <select id={`setting-${f.id}`} className="btn btn--sm settings__select" value={String(f.value)} onChange={(e) => void change(f, e.target.value)}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="row settings__number">
                    <input id={`setting-${f.id}`} type="number" className="models__field" min={f.minimum ?? undefined} max={f.maximum ?? undefined} value={String(f.value)} onChange={(e) => void change(f, e.target.value)} />
                    {f.unit ? <span className="faint">{f.unit}</span> : null}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Appearance({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const [appearance, update] = useAppearance();
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize);
  const choosePageSize = useCallback((next: PageSize) => {
    setPageSize(next);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, JSON.stringify(next));
    } catch {
      /* the choice lasts this session */
    }
  }, []);
  return (
    <div className="card list" aria-label="Appearance">
      <div className="item">
        <div className="item__body">
          <b>Theme</b>
          <InfoTip content="Match Mac follows the Mac's setting. Ambient is light from 7:00 to 19:00 and dark otherwise." label="About theme" />
        </div>
        <ThemeControl theme={theme} onChange={onTheme} />
      </div>
      <div className="item">
        <div className="item__body">
          <b>Accent colour</b>
        </div>
        <div className="settings__swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button key={a.value} type="button" role="radio" aria-checked={appearance.accent === a.value} aria-label={a.label} title={a.label} className="settings__swatch" style={{ background: a.color ?? "#4d7ea8" }} onClick={() => update({ accent: a.value })} />
          ))}
        </div>
      </div>
      <div className="item">
        <div className="item__body">
          <b>
            <label htmlFor="appearance-font">Font</label>
          </b>
        </div>
        <select id="appearance-font" className="btn btn--sm settings__select" value={appearance.font} onChange={(e) => update({ font: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="item">
        <div className="item__body">
          <b>Text size</b>
        </div>
        <div className="theme" role="group" aria-label="Text size">
          {SIZES.map((s) => (
            <button key={s.value} type="button" aria-pressed={appearance.size === s.value} onClick={() => update({ size: s.value })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="item">
        <div className="item__body">
          <b>Density</b>
          <InfoTip content="How much room forms, tables and cards take. Compact fits more on screen." label="About density" />
        </div>
        <div className="theme" role="group" aria-label="Density">
          {DENSITIES.map((d) => (
            <button key={d.value} type="button" aria-pressed={appearance.density === d.value} onClick={() => update({ density: d.value })}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="item">
        <div className="item__body">
          <b>
            <label htmlFor="rows-per-page">Rows per page</label>
          </b>
          <InfoTip content="How many rows a table shows at once." label="About rows per page" />
        </div>
        <select id="rows-per-page" className="btn btn--sm settings__select" value={String(pageSize)} onChange={(e) => choosePageSize(e.target.value === "fit" ? "fit" : Number(e.target.value))}>
          <option value="fit">Fit to window</option>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function DataAndRuntime({ client }: { client: Client }) {
  const [data, setData] = useState<DataInfo | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    client.dataInfo().then(setData).catch(() => undefined);
    client.runtimeInfo().then(setHealth).catch(() => undefined);
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
          <button type="button" className="btn btn--sm" onClick={() => void host.revealData()}>
            Show in Finder
          </button>
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
        <button
          type="button"
          className="btn btn--sm"
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
        </button>
      </div>
      <div className="item">
        <div className="item__body">
          <b>Runtime</b>
          <div className="item__sub models__line">{health ? `Core ${health.core_version} · Python ${health.python_version} · internal development build` : "…"}</div>
        </div>
      </div>
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
          <b>Alpha on your desktop</b>
          <InfoTip content="A small Alpha stays above your other windows. Click it or speak to log something, ask a question, open a project or start something new." label="About the desktop assistant" />
          {shown === null ? <div className="item__sub">Desktop app only.</div> : null}
        </div>
        {shown !== null ? <Toggle label="Desktop assistant" on={shown} onChange={set} labels={["Shown", "Hidden"]} /> : null}
      </div>
    </div>
  );
}

function SpeakRepliesSetting() {
  const [on, setOn] = useState(() => speakEnabled());
  return (
    <div className="card list" aria-label="Speak replies">
      <div className="item">
        <div className="item__body">
          <b>Speak replies</b>
          <InfoTip content="Alpha says its replies aloud, in the desktop assistant." label="About speak replies" />
        </div>
        <Toggle
          label="Speak replies"
          on={on}
          onChange={(next) => {
            setSpeakEnabled(next);
            setOn(next);
          }}
          labels={["On", "Off"]}
        />
      </div>
    </div>
  );
}

/** Hold a key to speak instead of typing: Fn by default (watched natively, src-tauri/src/ptt.rs),
 *  or a recorded key or combination. */
function PushToTalkSetting() {
  const [shortcut, setShortcut] = useState<PttShortcut>(() => readShortcut());
  const [recording, setRecording] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const desktop = hasTauri();
  useEffect(() => {
    if (!desktop) return;
    let live = true;
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<boolean>("ptt_permission"))
      .then((granted) => live && setPermission(granted))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [desktop]);
  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const code = keycodeFor(e.code);
      if (code === null) return; // a bare modifier (or an unmapped key): keep waiting
      e.preventDefault();
      const next: PttShortcut = { mode: "key", code, shift: e.shiftKey, control: e.ctrlKey, alt: e.altKey, command: e.metaKey, label: labelFor(e.code) };
      writeShortcut(next);
      setShortcut(next);
      setRecording(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);
  const chooseFn = () => {
    const next: PttShortcut = { mode: "fn" };
    writeShortcut(next);
    setShortcut(next);
    setRecording(false);
  };
  const grantAccess = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("ptt_request_permission");
      setPermission(await invoke<boolean>("ptt_permission"));
    } catch {
      /* not inside the Mac app */
    }
  };
  return (
    <div className="card list" aria-label="Push to talk">
      <div className="item">
        <div className="item__body">
          <b>Push to talk</b>
          <InfoTip content="Hold this key anywhere to speak to Alpha instead of typing. Release to stop." label="About push to talk" />
          {!desktop ? <div className="item__sub">Desktop app only.</div> : null}
          {desktop && permission === false ? (
            <div className="item__sub">
              Alpha needs Input Monitoring permission to notice the key while another app is focused.{" "}
              <button type="button" className="btn btn--sm" onClick={() => void grantAccess()}>
                Grant access
              </button>
            </div>
          ) : null}
        </div>
        {desktop ? (
          <div className="row settings__ptt">
            <button type="button" className={shortcut.mode === "fn" ? "btn btn--sm btn--primary" : "btn btn--sm"} aria-pressed={shortcut.mode === "fn"} onClick={chooseFn}>
              Fn (default)
            </button>
            <button type="button" className={shortcut.mode === "key" ? "btn btn--sm btn--primary" : "btn btn--sm"} aria-pressed={shortcut.mode === "key"} onClick={() => setRecording(true)}>
              {recording ? "Press a key…" : shortcut.mode === "key" ? shortcutLabel(shortcut) : "Record a key…"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TRANSCRIPTION_OPTIONS: { value: TranscriptionMode; label: string }[] = [
  { value: "automatic", label: "Automatic" },
  { value: "native", label: "On this Mac" },
  { value: "groq", label: "Groq Whisper" },
  { value: "openai", label: "OpenAI" },
];

function TranscriptionSetting() {
  const [mode, setMode] = useState<TranscriptionMode>(() => readTranscriptionMode());
  return (
    <div className="card list" aria-label="Transcription">
      <div className="item">
        <div className="item__body">
          <b>
            <label htmlFor="transcription">Transcription</label>
          </b>
          <InfoTip content="Automatic uses Groq or OpenAI when a key is saved in Settings → Models, otherwise this Mac's own speech recognition." label="About transcription" />
        </div>
        <select
          id="transcription"
          className="btn btn--sm settings__select"
          value={mode}
          onChange={(e) => {
            const next = e.target.value as TranscriptionMode;
            writeTranscriptionMode(next);
            setMode(next);
          }}
        >
          {TRANSCRIPTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["⌘↩", "Send a request to the assistant"],
  ["↩ / Esc", "Save or cancel a cell you are editing"],
  ["Fn", "Hold to speak instead of typing"],
  ["⌘K", "Go to a project or a page, or ask Alpha"],
  ["⌘W", "Close the window; Alpha keeps running"],
  ["⌘Q", "Quit Alpha and stop everything"],
];

/** pr1's About: what leaves this Mac, and the keyboard shortcuts. */
function About({ client }: { client: Client }) {
  const [rows, setRows] = useState<ModelProvider[] | null>(null);
  useEffect(() => {
    client.modelProviders().then(setRows).catch(() => undefined);
  }, [client]);
  const star = rows?.find((r) => r.default)?.label;
  return (
    <>
      <div className="card list" aria-label="What leaves this Mac">
        <div className="item">
          <div className="item__body">
            <b>What leaves this Mac</b>
            <InfoTip content="Your requests, and what Chief of Staff needs to answer them, go to the model you chose, through your own sign-in or key. Projects read the web only when they were made to, and sites you signed into only through Alpha's browser. Records, files and settings stay in the folder under Data & runtime." label="About what leaves this Mac" />
            <div className="item__sub models__line">{star ? `Your requests go to ${star}.` : "…"}</div>
          </div>
        </div>
      </div>
      <div className="card list" aria-label="Keyboard shortcuts">
        <div className="item">
          <div className="item__body">
            <b>Keyboard shortcuts</b>
          </div>
        </div>
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="item settings__shortcut">
            <kbd>{keys}</kbd>
            <span className="item__body">{what}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function Settings({ client, theme, onTheme, section: requested, onSection }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; section?: string; onSection?: (section: string) => void }) {
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
              <ProviderAccounts client={client} />
              <ConfigurableSettings client={client} groups={["Models"]} titles={{ Models: { title: "Thinking", tip: "How long the model thinks before it answers. The provider and its model are chosen on the rows above. Changes apply to the next message." } }} />
            </>
          ) : null}
          {section === "appearance" ? <Appearance theme={theme} onTheme={onTheme} /> : null}
          {section === "look" ? <ConfigurableSettings client={client} groups={["Look"]} titles={{ Look: { title: "Look", tip: "How every project is drawn, and rules Alpha follows when it makes or changes one." } }} /> : null}
          {section === "builds" ? (
            <ConfigurableSettings
              client={client}
              groups={["Making projects", "Access"]}
              titles={{
                "Making projects": { title: "Making projects", tip: "How Chief of Staff makes a new project, and how long a step may run before it is stopped." },
                Access: { title: "Access", tip: "The starting point for every new chat; a chat can choose its own in + → Advanced → Access." },
              }}
            />
          ) : null}
          {section === "desktop" ? (
            <>
              <AvatarSetting />
              <SpeakRepliesSetting />
              <PushToTalkSetting />
              <TranscriptionSetting />
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
          {section === "data" ? <DataAndRuntime client={client} /> : null}
          {section === "about" ? <About client={client} /> : null}
        </div>
      </div>
    </section>
  );
}
