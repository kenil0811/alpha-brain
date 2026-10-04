/**
 * Settings: only what a person decides. How Alpha thinks (their Claude, through Claude Code on
 * this Mac), the companion and how the app looks, where their world is kept and copies of it,
 * and the defaults set elsewhere in the app, one section at a time (the toggle in the header).
 * Each row says what is so and offers the one thing to do about it; what a row is for is behind
 * its ⓘ, never written out.
 */
import { useCallback, useEffect, useState } from "react";
import { LookPicker } from "../avatar/LookPicker";
import type { ClaudeStatus, Client, DataInfo, ThinkRoute, Thinking } from "../core/client";
import { host } from "../core/host";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { ThemeControl, type Theme } from "./theme";
import { Button, InfoTip, PageHeader, Tabs, Trouble } from "../ui";

type Section = "thinking" | "appearance" | "data" | "defaults";
const SECTIONS: { id: Section; label: string; info: string }[] = [
  { id: "thinking", label: "Thinks with", info: "Claude through Claude Code, or ChatGPT through the Codex CLI; each on your own subscription." },
  { id: "appearance", label: "Appearance", info: "The companion and how the app looks." },
  { id: "data", label: "Your data", info: "Where your world is kept, and copies of it." },
  { id: "defaults", label: "Defaults", info: "Choices the rest of the app starts from." },
];
const SECTION_KEY = "alpha.settings.section";

/** A row's label with what it is for behind an ⓘ. */
function Label({ children, info }: { children: string; info: string }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      <b>{children}</b>
      <InfoTip text={info} />
    </span>
  );
}

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
export function ThinkerRow({ which, client, status, onStatus, inUse, onUse, onThinking }: { which: ThinkRoute; client: Client; status: (ClaudeStatus & Partial<Pick<Thinking["codex"], "models" | "model">>) | null; onStatus: (s: ClaudeStatus) => void; inUse?: boolean; onUse?: () => void; onThinking?: (t: Thinking) => void }) {
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
      {connected && status?.models?.length ? (
        <select
          className="btn btn--sm"
          aria-label="ChatGPT model"
          value={status.model ?? status.models[0].id}
          onChange={(e) =>
            void client
              .setCodexModel(e.target.value)
              .then((t) => onThinking?.(t))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          }
        >
          {status.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : null}
      {inUse ? <span className="pill pill--good">In use</span> : onUse && connected ? (
        <Button size="sm" onClick={onUse}>
          Use this
        </Button>
      ) : null}
      {status ? <span className={`pill ${connected ? "pill--good" : "pill--warn"}`}>{connected ? "Connected" : "Not connected"}</span> : null}
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
  const [section, setSectionState] = useState<Section>(() => {
    try {
      const saved = localStorage.getItem(SECTION_KEY);
      return SECTIONS.some((s) => s.id === saved) ? (saved as Section) : "thinking";
    } catch {
      return "thinking";
    }
  });
  const setSection = (next: Section) => {
    setSectionState(next);
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {
      /* the choice lasts this window */
    }
  };
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

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
      <PageHeader
        path={[{ label: "Settings" }]}
        title={current.label}
        info={current.info}
        right={<Tabs className="toggle" label="Settings" value={section} onChange={setSection} items={SECTIONS.map(({ id, label }) => ({ id, label }))} />}
      />

      {section === "thinking" ? (
        <div className="card list">
          <ThinkerRow which="claude" client={client} status={thinking?.claude ?? claude} onStatus={(s) => { onClaude(s); if (thinking && onThinking) onThinking({ ...thinking, claude: s }); }} inUse={(thinking?.route ?? "claude") === "claude"} onUse={() => void client.setThinking("claude").then((t) => onThinking?.(t))} />
          <ThinkerRow which="codex" client={client} status={thinking?.codex ?? null} onStatus={(s) => { if (thinking && onThinking) onThinking({ ...thinking, codex: { ...thinking.codex, ...s } }); }} inUse={thinking?.route === "codex"} onUse={() => void client.setThinking("codex").then((t) => onThinking?.(t))} onThinking={onThinking} />
        </div>
      ) : null}

      {section === "appearance" ? (
        <div className="card list">
          {companion !== null ? (
            <div className="item">
              <div className="item__body">
                <Label info="Alpha's character, always on top, for quick asks.">Companion</Label>
              </div>
              <button type="button" className={`switch${companion ? "" : " switch--off"}`} role="switch" aria-checked={companion} aria-label={companion ? "Hide the companion" : "Show the companion"} onClick={() => void host.setCompanionVisible(!companion).then((v) => setCompanion(v ?? !companion))} />
            </div>
          ) : null}
          <div className="item">
            <div className="item__body">
              <Label info="Light, dark, or the same as your Mac.">Theme</Label>
            </div>
            <ThemeControl theme={theme} onChange={onTheme} />
          </div>
          <div className="item item--stack">
            <div className="item__body">
              <Label info="The animal and what it wears. It is Alpha whichever you pick; the artwork is Bridge's, with thanks.">The companion's look</Label>
            </div>
            <LookPicker client={client} />
          </div>
        </div>
      ) : null}

      {section === "data" ? (
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
      ) : null}

      {section === "defaults" ? (
        <div className="card list">
          <div className="item">
            <div className="item__body">
              <Label info="How many rows a table shows at once.">Rows per page</Label>
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
      ) : null}
    </div>
  );
}
