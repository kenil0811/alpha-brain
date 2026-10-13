import { ArrowUp, Bell, Mic, Paperclip, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Disabled, Dropdown, IconButton, Tip } from "../kit";
import { href, type Route } from "../data/route";
import { useWorld } from "../data/store";
import { ProposalCard } from "../views/DataView";
import { findProject } from "../data/store";
import { CONVERSATIONS, type Turn } from "../data/home";

/** The assistant panel (rulebook §9). It follows the page: a project opens that project's
 *  conversation. In the demo, Alpha's replies are scripted and say so. */
export function Assistant({ route, folded, onUnfold }: { route: Route; folded: boolean; onUnfold: () => void }) {
  const w = useWorld();
  const scope = route.page === "project" ? route.project : "home";
  const [extra, setExtra] = useState<Record<string, Turn[]>>({});
  const [text, setText] = useState("");
  const [depth, setDepth] = useState("quick");
  const endRef = useRef<HTMLDivElement>(null);
  const convo = [...(CONVERSATIONS[scope] ?? CONVERSATIONS.home), ...(extra[scope] ?? [])];
  const projectName = scope === "home" ? "Home" : findProject(scope)?.name ?? scope;
  const unread = w.activity.length;

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [convo.length, scope]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setExtra((x) => ({
      ...x,
      [scope]: [
        ...(x[scope] ?? []),
        { who: "you", text: t },
        { who: "alpha", text: "In this demo my replies are scripted, so I can't act on that. In the platform, I would answer from this project's records and show the sources here.", source: "Demo · no model was called" },
      ],
    }));
    setText("");
  };

  if (folded) {
    return (
      <aside className="assist assist--folded" aria-label="Assistant">
        <button className="assist__strip" onClick={onUnfold} aria-label="Open the assistant">
          <span className="avatar"><span className="avatar__eye" /><span className="avatar__eye" /></span>
          <span className="assist__stripname">Alpha</span>
        </button>
        <a className="iconbtn" href={href.activity()} aria-label="Activity"><Bell aria-hidden /></a>
      </aside>
    );
  }

  return (
    <aside className="assist" aria-label="Assistant">
      <header className="assist__head">
        <span className="assist__who">
          <span className="avatar"><span className="avatar__eye" /><span className="avatar__eye" /></span>
          Alpha
        </span>
        <Tip text="Activity">
          <a className="iconbtn assist__bell" href={href.activity()} aria-label={`Activity, ${unread} entries`}><Bell aria-hidden /></a>
        </Tip>
      </header>
      <div className="assist__ctx">
        <Dropdown
          value={scope}
          options={[{ value: scope, label: projectName }]}
          onChange={() => {}}
          addLabel="New conversation"
          onAdd={() => setExtra((x) => ({ ...x, [scope]: [] }))}
          trigger={<button className="tb tb--quiet"><span className="tb__label">{projectName}</span></button>}
        />
        <IconButton icon={Plus} label="New conversation" onClick={() => setExtra((x) => ({ ...x, [scope]: [] }))} />
      </div>
      <div className="assist__body" aria-live="polite">
        {convo.length === 0 ? <p className="empty">Ask about {projectName === "Home" ? "anything in the firm" : `${projectName.toLowerCase()}`}.</p> : null}
        {convo.map((t, i) =>
          t.who === "you" ? (
            <div key={i} className="msg msg--you">{t.text}</div>
          ) : t.proposal ? (
            <div key={i} className="msg msg--card"><ProposalCard id={t.proposal} /></div>
          ) : (
            <div key={i} className="msg msg--alpha">
              <div className="msg__text">{t.text}</div>
              {t.source ? <div className="msg__source">{t.source}</div> : null}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask Alpha… type @ to address another agent"
          aria-label="Message Alpha"
        />
        <div className="composer__row">
          <Disabled reason="Attachments are off in this demo"><button className="iconbtn" disabled aria-label="Attach"><Paperclip aria-hidden /></button></Disabled>
          <Dropdown
            value={depth}
            options={[{ value: "quick", label: "Quick overview" }, { value: "deep", label: "Deep thinking" }]}
            onChange={setDepth}
            addLabel="Add depth…"
            trigger={<button className="tb tb--quiet"><span className="tb__label">{depth === "quick" ? "Quick overview" : "Deep thinking"}</span></button>}
          />
          <span className="composer__gap" />
          <Disabled reason="Voice is off in this demo"><button className="iconbtn" disabled aria-label="Speak"><Mic aria-hidden /></button></Disabled>
          <button className="send" aria-label="Send" onClick={send} disabled={!text.trim()}><ArrowUp aria-hidden /></button>
        </div>
      </div>
    </aside>
  );
}
