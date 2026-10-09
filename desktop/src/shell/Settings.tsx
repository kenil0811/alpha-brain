/**
 * Settings: only what a person decides. How Alpha thinks (their Claude, through Claude Code on
 * this Mac), the companion and how the app looks, where their world is kept and copies of it,
 * and the defaults set elsewhere in the app. Each row says what is so and offers the one thing
 * to do about it.
 */
import { useCallback, useEffect, useState } from "react";
import { LookPicker } from "../avatar/LookPicker";
import type { ClaudeStatus, Client, DataInfo, ThinkRoute, Thinking } from "../core/client";
import { host } from "../core/host";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { ThemeControl, type Theme } from "./theme";
import { Badge, Button, Dropdown, Trouble } from "../ui";

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

/** One way to think, connected or not, and the one step that gets there: Claude through Claude
 *  Code, or ChatGPT through the Codex CLI (Q32). Also used on first run for the chosen one. */
export function ThinkerRow({ which, client, status, onStatus, inUse, onUse }: { which: ThinkRoute; client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void; inUse?: boolean; onUse?: () => void }) {
  const [waiting, setWaiting] = useState<"install" | "signin" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = which === "claude" ? "Claude" : "ChatGPT";
  const tool = which === "claude" ? "Claude Code" : "the Codex CLI";
  const calls = which === "claude"
    ? { status: () => client.claude(), install: () => client.installClaude(), signIn: () => client.signInClaude(), signOut: () => client.signOutClaude() }
    : { status: () => client.thinking().then((t) => t.codex), install: () => client.installCodex(), signIn: () => client.signInCodex(), signOut: () => client.signOutCodex() };

  // While the installer runs or the person signs in in their browser, check until it's done.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      calls
        .status()
        .then((s) => {
          onStatus(s);
          if ((waiting === "install" && s.installed) || (waiting === "signin" && s.signed_in)) setWaiting(null);
        })
        .catch(() => undefined);
    }, WAIT_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, client, onStatus, which]);

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
      ? `Alpha can't think with ${name} until you sign in again.`
      : waiting === "install"
        ? which === "claude"
          ? "Installing Claude Code… this takes a minute."
          : "The Codex app's page is open; install it, then come back."
        : waiting === "signin"
          ? "Finish signing in in your browser."
          : connected
            ? [status.email, status.plan ? `${status.plan} plan` : null, status.via === "api_key" ? "with an API key" : null, `through ${tool} on this Mac`].filter(Boolean).join(" · ")
            : status.installed
              ? `Sign in with your ${name} account; your browser opens.`
              : which === "claude"
                ? "Alpha thinks with Claude Code. Installing it takes a minute and needs no password."
                : "Alpha can also think with ChatGPT through the Codex CLI, which the Codex app brings.";
  return (
    <div className="item">
      <div className="item__ico" aria-hidden="true">
        {which === "claude" ? "✳" : "◎"}
      </div>
      <div className="item__body">
        <b>{name}</b>
        <div className={`item__sub${confirming ? " item__sub--warn" : ""}`}>{words}</div>
        {error ? <div className="notice" style={{ fontSize: "var(--text-sm)" }}>{error}</div> : null}
      </div>
      {inUse ? <Badge tone="good">In use</Badge> : onUse && connected ? (
        <Button size="sm" onClick={onUse}>
          Use this
        </Button>
      ) : null}
      {status ? <Badge tone={connected ? "good" : "warn"}>{connected ? "Connected" : "Not connected"}</Badge> : null}
      {!status ? null : connected ? (
        confirming ? (
          <>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" onClick={() => void act(() => calls.signOut().then(onStatus), null).then(() => setConfirming(false))}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Sign out
          </Button>
        )
      ) : status.installed ? (
        <Button size="sm" variant="primary" disabled={waiting !== null} onClick={() => void act(() => calls.signIn(), "signin")}>
          {waiting === "signin" ? "Waiting…" : "Sign in"}
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={waiting !== null} onClick={() => void act(() => calls.install(), "install")}>
          {waiting === "install" ? "Installing…" : "Install"}
        </Button>
      )}
    </div>
  );
}

/** The chosen way to think, for the first run. */
export function ClaudeRow({ client, status, onStatus, which = "claude" }: { client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void; which?: ThinkRoute }) {
  return <ThinkerRow which={which} client={client} status={status} onStatus={onStatus} />;
}

export function Settings({ client, theme, onTheme, claude, onClaude, thinking, onThinking }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void; thinking?: Thinking | null; onThinking?: (t: Thinking) => void }) {
  const [companion, setCompanion] = useState<boolean | null>(null);
  const [data, setData] = useState<DataInfo | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize);
  const [busy, setBusy] = useState(false);

  const [trouble, setTrouble] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void host.companionVisible().then(setCompanion).catch(() => setCompanion(null));
    client
      .dataInfo()
      .then((d) => {
        setData(d);
        setTrouble(null);
      })
      .catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e)));
    client.claude().then(onClaude).catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e)));
  }, [client, onClaude, tick]);

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
      {trouble ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Settings: {trouble}</Trouble> : null}
      <div className="home__head">
        <h1>Settings</h1>
        <span className="muted">How Alpha thinks, looks and keeps your data</span>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Thinks with</h2>
          <span className="faint">Claude through Claude Code, or ChatGPT through the Codex CLI; each on your own subscription</span>
        </div>
        <div className="card list">
          <ThinkerRow which="claude" client={client} status={thinking?.claude ?? claude} onStatus={(s) => { onClaude(s); if (thinking && onThinking) onThinking({ ...thinking, claude: s }); }} inUse={(thinking?.route ?? "claude") === "claude"} onUse={() => void client.setThinking("claude").then((t) => onThinking?.(t))} />
          <ThinkerRow which="codex" client={client} status={thinking?.codex ?? null} onStatus={(s) => { if (thinking && onThinking) onThinking({ ...thinking, codex: s }); }} inUse={thinking?.route === "codex"} onUse={() => void client.setThinking("codex").then((t) => onThinking?.(t))} />
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
          <div className="item item--stack">
            <div className="item__body">
              <b>The companion's look</b>
              <div className="item__sub">The animal and what it wears. It is Alpha whichever you pick; the artwork is Bridge's, with thanks.</div>
            </div>
            <LookPicker client={client} />
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
            <Dropdown size="sm" label="Rows per page" value={String(pageSize)} onChange={(v) => choosePageSize(v === "fit" ? "fit" : Number(v))} options={[{ value: "fit", label: "Fit to window" }, ...PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))]} />
          </div>
        </div>
      </div>
    </div>
  );
}
