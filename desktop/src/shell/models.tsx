/**
 * Settings → Models: every way Zazoo can reach a model, one row each (pull request #3's, which
 * replaced "Claude"). Claude through Claude Code and ChatGPT through the Codex CLI are real
 * (Q32), and the star on either makes it the way Zazoo thinks. The other providers, their keys,
 * a model picker and how long it thinks need the core's model accounts (backend-requests.md §1),
 * so using them says so.
 */
import { useEffect, useState } from "react";
import type { ClaudeStatus, Client, ThinkRoute, Thinking } from "../core/client";
import { Button, IconButton, InfoTip, Menu, MenuItem, SoonBadge, useComingSoon } from "../ui";
import { MoreHorizontal, Star } from "../ui/icons";

const WAIT_EVERY_MS = 3000;

/** The star in front of a row: filled on the default; clicking an empty one makes that one the
 *  default without opening or connecting anything. */
function DefaultStar({ name, on, disabled, onClick }: { name: string; on: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <IconButton
      size="sm"
      className={`models__star${on ? " models__star--on" : ""}`}
      label={on ? `${name} is the default` : disabled ? `Connect ${name} to make it the default` : `Make ${name} the default`}
      aria-pressed={on}
      disabled={disabled}
      icon={<Star fill={on ? "currentColor" : "none"} />}
      onClick={on ? undefined : onClick}
    />
  );
}

/** The model a connected way to think uses: not a choice the core takes yet. */
function ModelPicker({ name, options }: { name: string; options: string[] }) {
  const soon = useComingSoon();
  return (
    <select className="btn btn--sm" value="" aria-label={`${name}'s model`} onChange={() => soon(`Choosing ${name}'s model`)}>
      <option value="">Default model</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}
const MODELS: Record<ThinkRoute, string[]> = { claude: ["Claude Opus", "Claude Sonnet", "Claude Haiku"], codex: ["GPT-5", "GPT-5 mini"] };

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
      ? `Zazoo can't think with ${name} until you sign in again.`
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
                ? "Zazoo thinks with Claude Code. Installing it takes a minute and needs no password."
                : "Zazoo can also think with ChatGPT through the Codex CLI, which the Codex app brings.";
  return (
    <div className="item">
      {onUse ? <DefaultStar name={name} on={Boolean(inUse)} disabled={!connected && !inUse} onClick={onUse} /> : null}
      <div className="item__ico" aria-hidden="true">
        {which === "claude" ? "✳" : "◎"}
      </div>
      <div className="item__body">
        <b>{name}</b>
        <div className={`item__sub${confirming ? " item__sub--warn" : ""}`}>{words}</div>
        {error ? <div className="notice" style={{ fontSize: "var(--text-sm)" }}>{error}</div> : null}
      </div>
      {onUse && connected ? <ModelPicker name={name} options={MODELS[which]} /> : null}
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

// The providers the core doesn't reach yet, and how each is reached (bridge-parity's accounts).
const PROVIDERS: { id: string; label: string; kind: "key" | "local"; how: string; transcribeOnly?: boolean }[] = [
  { id: "anthropic", label: "Claude API", kind: "key", how: "A key from console.anthropic.com (Anthropic). Billed per use." },
  { id: "openai", label: "ChatGPT API", kind: "key", how: "A key from platform.openai.com (OpenAI). Billed per use." },
  { id: "openrouter", label: "OpenRouter", kind: "key", how: "A key from openrouter.ai: many models behind one key. No web search on this route." },
  { id: "xai", label: "Grok", kind: "key", how: "A key from console.x.ai (xAI). No web search on this route." },
  { id: "deepseek", label: "DeepSeek", kind: "key", how: "A key from platform.deepseek.com. No web search on this route." },
  { id: "ollama", label: "Ollama", kind: "local", how: "Models running on this Mac, free and private. Install Ollama from ollama.com and pull a model; it shows up here." },
  { id: "groq", label: "Groq", kind: "key", how: "A key from console.groq.com, used only to turn speech into text.", transcribeOnly: true },
];

function SoonProviderRow({ provider: p }: { provider: (typeof PROVIDERS)[number] }) {
  const soon = useComingSoon();
  const [draft, setDraft] = useState("");
  const saveKey = () => {
    if (!draft.trim()) return;
    setDraft("");
    soon(`Saving a ${p.label} key`);
  };
  return (
    <div className="item">
      {p.transcribeOnly ? <span className="models__nostar" aria-hidden="true" /> : <DefaultStar name={p.label} on={false} onClick={() => soon("Choosing the default model")} />}
      <div className="item__body settings__title">
        <b>{p.label}</b>
        <InfoTip text={p.how} />
        <SoonBadge />
      </div>
      {p.kind === "key" ? (
        <>
          <input type="password" className="textfield models__key" placeholder="Paste a key" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveKey()} aria-label={`${p.label} key`} autoComplete="off" spellCheck={false} />
          {draft.trim() ? (
            <Button size="sm" onClick={saveKey}>
              Save
            </Button>
          ) : null}
        </>
      ) : (
        <Button size="sm" onClick={() => soon(`Finding ${p.label}'s models`)}>
          Find models
        </Button>
      )}
      <Menu trigger={<IconButton size="sm" label={`${p.label} options`} icon={<MoreHorizontal />} />}>
        <MenuItem onSelect={() => soon(`Testing ${p.label}`)}>Test</MenuItem>
        {p.kind === "key" ? <MenuItem onSelect={() => soon(`Reconnecting ${p.label}`)}>Reconnect</MenuItem> : null}
        {p.kind === "key" ? (
          <MenuItem danger onSelect={() => soon(`Removing a ${p.label} key`)}>
            Remove key
          </MenuItem>
        ) : null}
      </Menu>
    </div>
  );
}

const EFFORTS = [["default", "Claude Code's default"], ["low", "Low (fastest)"], ["medium", "Medium"], ["high", "High (slowest)"]];

/** Settings → Models: the two real ways to think, then the rest, then how long it thinks. */
export function Models({ client, claude, onClaude, thinking, onThinking }: { client: Client; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void; thinking?: Thinking | null; onThinking?: (t: Thinking) => void }) {
  const soon = useComingSoon();
  const route = thinking?.route ?? "claude";
  const use = (which: ThinkRoute) => void client.setThinking(which).then((t) => onThinking?.(t)).catch(() => undefined);
  return (
    <>
      <div className="card list" aria-label="Models">
        <ThinkerRow which="claude" client={client} status={thinking?.claude ?? claude} onStatus={(s) => { onClaude(s); if (thinking && onThinking) onThinking({ ...thinking, claude: s }); }} inUse={route === "claude"} onUse={() => use("claude")} />
        <ThinkerRow which="codex" client={client} status={thinking?.codex ?? null} onStatus={(s) => { if (thinking && onThinking) onThinking({ ...thinking, codex: s }); }} inUse={route === "codex"} onUse={() => use("codex")} />
        {PROVIDERS.map((p) => (
          <SoonProviderRow key={p.id} provider={p} />
        ))}
      </div>
      <div className="card list" aria-label="Thinking">
        <div className="item">
          <div className="item__body settings__title">
            <b>How long it thinks</b>
            <InfoTip text="How long the model thinks before it answers. Low answers fastest; high takes longest. Applies from the next message." />
            <SoonBadge />
          </div>
          <select className="btn btn--sm" value="default" aria-label="How long it thinks" onChange={() => soon("Choosing how long it thinks")}>
            {EFFORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
