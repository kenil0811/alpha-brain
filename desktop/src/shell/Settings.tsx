/**
 * Settings, as in Alpha: a header, then a second nav column (icon, label, a dot on the current
 * section) beside the section. Claude (how Alpha thinks), Appearance, Desktop (the companion),
 * Data, and About (what leaves this Mac, shortcuts). Explanations sit behind (i).
 * `section` / `onSection` come from the address (#/settings/<section>); without them the last
 * section is remembered per window.
 */
import { useCallback, useEffect, useState } from "react";
import { Cpu, HardDrive, Info, type LucideIcon, Monitor, Palette, Settings as SettingsIcon } from "lucide-react";
import type { ClaudeStatus, Client, DataInfo } from "../core/client";
import { host } from "../core/host";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { InfoTip } from "../ui";
import { ACCENTS, DENSITIES, FONTS, SIZES, useAppearance } from "./appearance";
import { ThemeControl, type Theme } from "./theme";

const SECTION_KEY = "alpha.settings.section";
export const SETTINGS_SECTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "claude", label: "Claude", icon: Cpu },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "data", label: "Data", icon: HardDrive },
  { value: "about", label: "About", icon: Info },
];
// An older build's section names.
const RENAMED: Record<string, string> = { companion: "desktop", models: "claude" };
const WAIT_EVERY_MS = 3000;

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
    return known(localStorage.getItem(SECTION_KEY)) ?? "claude";
  } catch {
    return "claude";
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

/** Claude: connected or not, and the one step that gets there. Also used on first run. */
export function ClaudeRow({ client, status, onStatus }: { client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void }) {
  const [waiting, setWaiting] = useState<"install" | "signin" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While the installer runs or the person signs in in their browser, check until it's done.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      client
        .claude()
        .then((s) => {
          onStatus(s);
          if ((waiting === "install" && s.installed) || (waiting === "signin" && s.signed_in)) setWaiting(null);
        })
        .catch(() => undefined);
    }, WAIT_EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting, client, onStatus]);

  async function act(work: () => Promise<unknown>, next: "install" | "signin" | null) {
    setError(null);
    try {
      await work();
      setWaiting(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const connected = Boolean(status?.signed_in);
  const words = !status
    ? "Checking…"
    : confirming
      ? "Alpha can't think until you sign in again."
      : waiting === "install"
        ? "Installing Claude Code… this takes a minute."
        : waiting === "signin"
          ? "Finish signing in in your browser."
          : connected
            ? [status.email, status.plan ? `${status.plan} plan` : null, "through Claude Code on this Mac"].filter(Boolean).join(" · ")
            : status.installed
              ? "Sign in with your Claude account; your browser opens."
              : "Alpha thinks with Claude Code. Installing it takes a minute and needs no password.";
  return (
    <div className="item">
      <div className="item__ico" aria-hidden="true">
        ✳
      </div>
      <div className="item__body">
        <b>Claude</b>
        <div className={`item__sub${confirming ? " item__sub--warn" : ""}`}>{words}</div>
        {error ? <div className="notice" style={{ fontSize: 12 }}>{error}</div> : null}
      </div>
      {status ? <span className={`pill ${connected ? "pill--good" : "pill--warn"}`}>{connected ? "Connected" : "Not connected"}</span> : null}
      {!status ? null : connected ? (
        confirming ? (
          <>
            <button type="button" className="btn btn--sm" onClick={() => setConfirming(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={() => void act(() => client.signOutClaude().then(onStatus), null).then(() => setConfirming(false))}>
              Sign out
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirming(true)}>
            Sign out
          </button>
        )
      ) : status.installed ? (
        <button type="button" className="btn btn--sm btn--primary" disabled={waiting !== null} onClick={() => void act(() => client.signInClaude(), "signin")}>
          {waiting === "signin" ? "Waiting…" : "Sign in"}
        </button>
      ) : (
        <button type="button" className="btn btn--sm btn--primary" disabled={waiting !== null} onClick={() => void act(() => client.installClaude(), "install")}>
          {waiting === "install" ? "Installing…" : "Install"}
        </button>
      )}
    </div>
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
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
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
      {data?.backups.slice(0, 5).map((b) => (
        <div className="item" key={b.name}>
          <div className="item__body">
            <div className="item__sub">
              {when(b.at)} · {bytes(b.size)}
            </div>
          </div>
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
          <b>Alpha on your desktop</b>
          <InfoTip content="A small Alpha stays above your other windows. Click it or speak to log something, ask a question, open a project or start something new." label="About the desktop assistant" />
          {shown === null ? <div className="item__sub">Desktop app only.</div> : null}
        </div>
        {shown !== null ? <Toggle label="Desktop assistant" on={shown} onChange={set} labels={["Shown", "Hidden"]} /> : null}
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["⌘↩", "Send a request to the assistant"],
  ["↩ / Esc", "Save or cancel a cell you are editing"],
  ["⌘K", "Go to a project or a page, or ask Alpha"],
  ["⌘W", "Close the window; Alpha keeps running"],
  ["⌘Q", "Quit Alpha and stop everything"],
];

/** pr1's About: what leaves this Mac, and the keyboard shortcuts. */
function About() {
  return (
    <>
      <div className="card list" aria-label="What leaves this Mac">
        <div className="item">
          <div className="item__body">
            <b>What leaves this Mac</b>
            <InfoTip content="Your requests, and what Zazoo needs to answer them, go to Claude through your own sign-in. Projects read the web only when they were made to, and sites you signed into only through Alpha's browser. Records, files and settings stay in the folder under Data & runtime." label="About what leaves this Mac" />
            <div className="item__sub models__line">Your requests go to Claude.</div>
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

export function Settings({ client, theme, onTheme, claude, onClaude, section: requested, onSection }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void; section?: string; onSection?: (section: string) => void }) {
  const [own, setOwn] = useState(readSection);
  const section = known(requested) ?? (onSection ? "claude" : own);
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
          {section === "claude" ? (
            <div className="card list" aria-label="Claude">
              <ClaudeRow client={client} status={claude} onStatus={onClaude} />
            </div>
          ) : null}
          {section === "appearance" ? <Appearance theme={theme} onTheme={onTheme} /> : null}
          {section === "desktop" ? (
            <>
              <AvatarSetting />
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
          {section === "about" ? <About /> : null}
        </div>
      </div>
    </section>
  );
}
