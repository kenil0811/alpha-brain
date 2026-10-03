/**
 * Settings: only what a person decides. How Alpha thinks (their Claude, through Claude Code on
 * this Mac), the companion and how the app looks, where their world is kept and copies of it,
 * and the defaults set elsewhere in the app. Each row says what is so and offers the one thing
 * to do about it.
 */
import { useCallback, useEffect, useState } from "react";
import type { ClaudeStatus, Client, DataInfo } from "../core/client";
import { host } from "../core/host";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { ThemeControl, type Theme } from "./theme";
import { Button } from "../ui";

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
            <Button size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" onClick={() => void act(() => client.signOutClaude().then(onStatus), null).then(() => setConfirming(false))}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Sign out
          </Button>
        )
      ) : status.installed ? (
        <Button size="sm" variant="primary" disabled={waiting !== null} onClick={() => void act(() => client.signInClaude(), "signin")}>
          {waiting === "signin" ? "Waiting…" : "Sign in"}
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={waiting !== null} onClick={() => void act(() => client.installClaude(), "install")}>
          {waiting === "install" ? "Installing…" : "Install"}
        </Button>
      )}
    </div>
  );
}

export function Settings({ client, theme, onTheme, claude, onClaude }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void }) {
  const [companion, setCompanion] = useState<boolean | null>(null);
  const [data, setData] = useState<DataInfo | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void host.companionVisible().then(setCompanion).catch(() => setCompanion(null));
    client.dataInfo().then(setData).catch(() => undefined);
    client.claude().then(onClaude).catch(() => undefined);
  }, [client, onClaude]);

  const choosePageSize = useCallback((next: PageSize) => {
    setPageSize(next);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, JSON.stringify(next));
    } catch {
      /* the choice lasts this session */
    }
  }, []);

  const last = data?.backups[0];
  return (
    <div className="page">
      <div className="home__head">
        <h1>Settings</h1>
        <span className="muted">How Alpha thinks, looks and keeps your data</span>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Claude</h2>
        </div>
        <div className="card list">
          <ClaudeRow client={client} status={claude} onStatus={onClaude} />
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Companion and appearance</h2>
        </div>
        <div className="card list">
          {companion !== null ? (
            <div className="item">
              <div className="item__body">
                <b>Companion</b>
                <div className="item__sub">Alpha's character, always on top, for quick asks</div>
              </div>
              <button type="button" className={`switch${companion ? "" : " switch--off"}`} role="switch" aria-checked={companion} aria-label={companion ? "Hide the companion" : "Show the companion"} onClick={() => void host.setCompanionVisible(!companion).then((v) => setCompanion(v ?? !companion))} />
            </div>
          ) : null}
          <div className="item">
            <div className="item__body">
              <b>Appearance</b>
              <div className="item__sub">Light, dark, or the same as your Mac</div>
            </div>
            <ThemeControl theme={theme} onChange={onTheme} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Your data</h2>
        </div>
        <div className="card list">
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
            <Button size="sm" disabled={busy} onClick={() => { setBusy(true); client.backUp().then(setData).catch(() => undefined).finally(() => setBusy(false)); }}>
              {busy ? "Backing up…" : "Back up now"}
            </Button>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Defaults</h2>
        </div>
        <div className="card list">
          <div className="item">
            <div className="item__body">
              <b>Rows per page</b>
              <div className="item__sub">How many rows a table shows at once</div>
            </div>
            <select className="btn btn--sm" value={String(pageSize)} onChange={(e) => choosePageSize(e.target.value === "fit" ? "fit" : Number(e.target.value))} aria-label="Rows per page">
              <option value="fit">Fit to window</option>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
