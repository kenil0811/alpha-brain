/**
 * Settings: only what a person decides, in four sections. Models (every way Alpha can reach a
 * model, the starred default, each one's model), Appearance (theme, accent, font, text size, rows
 * per page), Your data (where it is kept, backups) and Companion. Explanations sit behind (i).
 */
import { useCallback, useEffect, useState } from "react";
import type { Client, DataInfo } from "../core/client";
import { host } from "../core/host";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { InfoTip, Tabs } from "../ui";
import { ACCENTS, FONTS, SIZES, useAppearance } from "./appearance";
import { ProviderAccounts } from "./models";
import { ThemeControl, type Theme } from "./theme";

const SECTION_KEY = "alpha.settings.section";
const SECTIONS = [
  { value: "models", label: "Models" },
  { value: "appearance", label: "Appearance" },
  { value: "data", label: "Your data" },
  { value: "companion", label: "Companion" },
];

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

function readSection(): string {
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    return SECTIONS.some((s) => s.value === raw) ? (raw as string) : "models";
  } catch {
    return "models";
  }
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

function YourData({ client }: { client: Client }) {
  const [data, setData] = useState<DataInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    client.dataInfo().then(setData).catch(() => undefined);
  }, [client]);
  const last = data?.backups[0];
  return (
    <div className="card list" aria-label="Your data">
      <div className="item">
        <div className="item__body">
          <b>Kept on this Mac</b>
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
    </div>
  );
}

function Companion() {
  const [companion, setCompanion] = useState<boolean | null>(null);
  useEffect(() => {
    void host.companionVisible().then(setCompanion).catch(() => setCompanion(null));
  }, []);
  return (
    <div className="card list" aria-label="Companion">
      <div className="item">
        <div className="item__body">
          <b>Companion</b>
          <InfoTip content="Alpha's character, always on top, for quick asks." label="About the companion" />
        </div>
        {companion !== null ? (
          <button type="button" className={`switch${companion ? "" : " switch--off"}`} role="switch" aria-checked={companion} aria-label={companion ? "Hide the companion" : "Show the companion"} onClick={() => void host.setCompanionVisible(!companion).then((v) => setCompanion(v ?? !companion))} />
        ) : (
          <span className="faint">Mac app only</span>
        )}
      </div>
    </div>
  );
}

export function Settings({ client, theme, onTheme }: { client: Client; theme: Theme; onTheme: (t: Theme) => void }) {
  const [section, setSectionState] = useState(readSection);
  const setSection = (next: string) => {
    setSectionState(next);
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {
      /* per-window convenience only */
    }
  };
  return (
    <div className="page settings">
      <div className="home__head">
        <h1>Settings</h1>
        <InfoTip content="How Alpha thinks, looks and keeps your data on this Mac." label="About Settings" />
      </div>
      <Tabs items={SECTIONS} value={section} onChange={setSection} aria-label="Settings sections" className="settings__tabs" />
      <div className="settings__section">
        {section === "models" ? <ProviderAccounts client={client} /> : null}
        {section === "appearance" ? <Appearance theme={theme} onTheme={onTheme} /> : null}
        {section === "data" ? <YourData client={client} /> : null}
        {section === "companion" ? <Companion /> : null}
      </div>
    </div>
  );
}
