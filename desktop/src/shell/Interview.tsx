/**
 * A voice tool running, as a conversation across the table: Zazoo sits in the middle of the
 * page facing the person, asks each question aloud (mouth talking), listens hands-free (about
 * two seconds of quiet ends an answer; "skip" and "stop" are heard as such) and thinks while it
 * prepares or drafts. Nothing of the conversation is written on screen unless the person turns
 * on "Show words"; a typed answer appears only where the window can't listen.
 *
 * Zazoo prepares in the interview's own conversation (reads what it holds, finds the gaps,
 * writes topics with goals and questions with a value and a time each: ./interviewPlan); the
 * person slides how long they have and sees what share of the questions and of their value fits.
 * The plan is redone after every answer with the time left: a "no" drops that question's
 * follow-ups, "let's move on" drops the topic, and Zazoo bridges to the next one aloud. At the end Zazoo drafts facts and notes; nothing is
 * kept until the person ticks it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Captions, ChevronRight, Mic, Pause, Play, Plus, SkipForward, Square } from "lucide-react";
import type { Client, ModuleCard } from "../core/client";
import { CompanionZazooFace } from "../avatar/zazoo/CompanionZazooFace";
import { ZazooDirector } from "../avatar/zazoo/director";
import { IconButton, InfoTip, PageHeader, StandardDropdown } from "../ui";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Input";
import { afterAnswer, closePrompt, command, fullMinutes, parseDrafts, parsePrepared, plan, preparePrompt, type Answered, type Draft, type Prepared, type Question, type Tool } from "./interviewPlan";
import { say, stopSaying } from "./say";
import { useSpeech } from "./voice";

/** Quiet that ends an answer. */
const QUIET_MS = 2000;
/** Time a question may run past the end, so the plan the person chose is the plan they get. */
const GRACE_MINUTES = 0.25;
/** Microphone level counted as speech (0–1 RMS). */
const SPEECH_RMS = 0.02; // ponytail: one level for every room and mic; calibrate on the first second if it cuts people off

type Phase = "preparing" | "setup" | "live" | "timeup" | "closing" | "review" | "done" | "failed" | "unsaved";
type Stage = "speaking" | "listening" | "settling" | "paused";
/** What Zazoo's face is doing: also on the page as `data-mood`. */
type Mood = "talking" | "listening" | "thinking" | "idle";
interface Saved {
  prepared: Prepared;
  /** The interview's conversation: where Zazoo prepares and drafts, so the journal keeps both. */
  thread: string;
  at: string;
}

const cacheKey = (tool: Tool, scope: string) => `alpha.interview.v2.${tool.id}.${scope || "all"}`;
function readCache(key: string): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as Saved | null;
  } catch {
    return null;
  }
}

/** Preparations under way, by cache key: a second ask for the same one (a remount, a double click) waits on the first. */
const inflight = new Map<string, Promise<Saved>>();

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clock = (minutes: number) => {
  const s = Math.max(0, Math.round(minutes * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const EMOTION = { talking: "curious", listening: "listening", thinking: "thinking", idle: "calm" } as const;

export function Interview({ client, tool, modules, onBack, onChanged }: { client: Client; tool: Tool; modules: ModuleCard[]; onBack: () => void; onChanged: () => void }) {
  const [scope, setScope] = useState("");
  const [phase, setPhase] = useState<Phase>("preparing");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [budget, setBudget] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [words, setWords] = useState(false);
  // Read when preparing, not followed: a refreshed project list must never restart a running interview.
  const live = useRef({ client, modules, tool });
  live.current = { client, modules, tool };

  const prepare = useCallback(
    async (fresh: boolean) => {
      const { client, modules, tool } = live.current;
      const key = cacheKey(tool, scope);
      const cached = fresh ? null : readCache(key);
      if (cached) {
        setSaved(cached);
        setPhase("setup");
        return;
      }
      setPhase("preparing");
      try {
        const project = modules.find((m) => m.id === scope) ?? null;
        const running =
          inflight.get(key) ??
          (async () => {
            const thread = await client.newConversation(project?.id ?? null, `Interview: ${tool.title}`);
            const turn = await client.askAndWait(preparePrompt(tool, project), { conversation: thread.id });
            const prepared = turn.state === "done" ? parsePrepared(turn.reply ?? "") : null;
            if (!prepared) throw new Error(turn.state === "done" ? "Zazoo didn't come back with questions. Try again." : turn.reply || "Zazoo couldn't prepare the interview.");
            const made = { prepared, thread: thread.id, at: new Date().toISOString() };
            localStorage.setItem(key, JSON.stringify(made));
            return made;
          })().finally(() => inflight.delete(key));
        inflight.set(key, running);
        setSaved(await running);
        setPhase("setup");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("failed");
      }
    },
    [scope],
  );
  useEffect(() => void prepare(false), [prepare, tool.id]);

  // ---- the live interview ----
  const [answered, setAnswered] = useState<Answered[]>([]);
  const answeredRef = useRef<Answered[]>([]);
  const [current, setCurrent] = useState<Question | null>(null);
  // The questions still to ask (answers drop follow-ups and topics), and the draw that orders topics for this interview.
  const leftRef = useRef<Question[]>([]);
  const seedRef = useRef(0);
  // What Zazoo says before the question ("OK, let's talk about ..."): spoken, shown only with "Show words".
  const [lead, setLead] = useState("");
  const [ahead, setAhead] = useState(0);
  const [stage, setStageState] = useState<Stage>("speaking");
  const stageRef = useRef<Stage>("speaking");
  const setStage = (s: Stage) => {
    stageRef.current = s;
    setStageState(s);
  };
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [level, setLevel] = useState(0);
  const [, setNow] = useState(Date.now()); // the clock's tick
  const clockRef = useRef({ startedAt: 0, pausedAt: 0, paused: 0, extra: 0, budget: 0 });
  const ear = useRef({ text: "", lastHeard: 0, lastText: 0, heardAny: false, stoppedAt: 0 });
  // Each thing said has a number: a voice that ends after the person moved on (Pause, Skip, End) starts nothing.
  const saying = useRef(0);

  const speech = useSpeech((final, interim) => {
    const text = `${final} ${interim}`.trim();
    ear.current.text = text;
    ear.current.lastHeard = ear.current.lastText = Date.now();
    if (text) ear.current.heardAny = true;
    setHeard(text);
  });
  const speechRef = useRef(speech);
  speechRef.current = speech;
  useEffect(() => () => {
    saying.current += 1;
    stopSaying();
  }, []);

  const minutesUsed = () => {
    const c = clockRef.current;
    const end = c.pausedAt || Date.now();
    return c.startedAt ? (end - c.startedAt - c.paused) / 60_000 : 0;
  };
  const minutesLeft = () => clockRef.current.budget + clockRef.current.extra - minutesUsed();

  const listen = useCallback(() => {
    Object.assign(ear.current, { text: "", heardAny: false, lastHeard: Date.now(), lastText: 0, stoppedAt: 0 });
    setHeard("");
    setStage("listening");
    speechRef.current.start();
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const n = ++saying.current;
      setStage("speaking");
      await say(text);
      if (saying.current === n && stageRef.current === "speaking") listen();
    },
    [listen],
  );
  const hush = () => {
    saying.current += 1;
    stopSaying();
    speechRef.current.stop();
  };

  const finish = useCallback(async () => {
    saying.current += 1;
    stopSaying();
    speechRef.current.stop();
    setStage("paused"); // the ear stops for good: a stale answer must not settle (and draft) again
    setCurrent(null);
    const said = answeredRef.current.filter((a) => !a.skipped && a.answer.trim());
    if (!said.length || !saved) {
      setPhase("done");
      return;
    }
    setPhase("closing");
    try {
      const turn = await client.askAndWait(closePrompt(tool, answeredRef.current), { conversation: saved.thread });
      if (turn.state !== "done") throw new Error(turn.reply || "Zazoo couldn't draft what to keep.");
      const { summary, items } = parseDrafts(turn.reply ?? "");
      setDrafts({ summary, items: items.map((d) => ({ ...d, keep: true })) });
      setPhase("review");
    } catch (e) {
      // The answers are still here: drafting is tried again from them, never from a new interview.
      setError(e instanceof Error ? e.message : String(e));
      setPhase("unsaved");
    }
  }, [client, saved, tool]);

  const askNext = useCallback(
    (topic?: string, movedOn = false) => {
      if (!saved) return;
      const left = leftRef.current;
      const opening = saved.prepared.topics.find((t) => t.opening)?.name;
      // A question that would just fit when the clock started still fits a moment later.
      const p = plan(left, Math.max(0, minutesLeft() + GRACE_MINUTES), { current: topic, opening, seed: seedRef.current });
      const q = p.order[0];
      if (!q) {
        speechRef.current.stop();
        setStage("paused");
        setCurrent(null);
        if (left.length) setPhase("timeup");
        else void finish();
        return;
      }
      setCurrent(q);
      setAhead(p.order.length);
      setHeard("");
      const name = q.topic.toLowerCase().replace(/^about /, "");
      const line =
        answeredRef.current.length === 0
          ? "Say skip to move on, or stop to finish. "
          : q.topic === topic
            ? ""
            : movedOn
              ? `OK, let's talk about ${name}. `
              : `Thanks. Next, ${name}. `;
      setLead(line.trim());
      void speak(line + q.question);
    },
    // minutesLeft reads refs only
    [saved, speak, finish],
  );

  const settle = useCallback(
    (answer: string, skipped = false) => {
      const q = current;
      if (!q) return;
      saying.current += 1;
      stopSaying();
      speechRef.current.stop();
      const cmd = skipped ? "skip" : command(answer);
      if (cmd === "stop") {
        void finish();
        return;
      }
      if (!cmd && !answer.trim()) {
        listen(); // nothing came through: keep listening
        return;
      }
      const said = cmd ? "" : answer.trim();
      answeredRef.current = [...answeredRef.current, { question: q, answer: said, skipped: cmd === "skip" }];
      setAnswered(answeredRef.current);
      setTyped("");
      // A skip counts as "no": its follow-ups go with it.
      const next = afterAnswer(leftRef.current, q, said);
      leftRef.current = next.left;
      askNext(next.moveOn ? undefined : q.topic, next.moveOn);
    },
    [askNext, current, finish, listen],
  );
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // The ear: microphone level and words both count as speech; quiet after speech ends the answer.
  useEffect(() => {
    if (phase !== "live") return;
    let read: (() => number) | null = null;
    let release: () => void = () => {};
    void navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        read = () => {
          analyser.getFloatTimeDomainData(buf);
          return Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
        };
        release = () => {
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
        };
      })
      .catch(() => undefined); // words alone still end answers where the level can't be read
    const tick = window.setInterval(() => {
      const t = Date.now();
      const e = ear.current;
      setNow(t);
      const s = stageRef.current;
      const rms = read ? read() : 0;
      setLevel(s === "listening" ? rms : 0);
      if (s === "listening") {
        if (rms > SPEECH_RMS) {
          e.lastHeard = t;
          e.heardAny = true;
        }
        if (e.heardAny && t - e.lastHeard > QUIET_MS) {
          speechRef.current.stop();
          e.stoppedAt = t;
          setStage("settling");
        }
      }
      if (s === "settling" && !speechRef.current.listening && ((e.text && t - e.lastText > 700) || t - e.stoppedAt > 10_000)) {
        setStage("listening"); // guards against settling twice before the next question starts
        settleRef.current(e.text);
      }
    }, 200);
    return () => {
      window.clearInterval(tick);
      release();
    };
  }, [phase]);

  const start = () => {
    clockRef.current = { startedAt: Date.now(), pausedAt: 0, paused: 0, extra: 0, budget: minutes };
    setKept(0);
    answeredRef.current = [];
    setAnswered([]);
    leftRef.current = saved?.prepared.questions ?? [];
    seedRef.current = Math.floor(Math.random() * 2 ** 31);
    setPhase("live");
    askNext();
  };
  const pause = () => {
    hush();
    clockRef.current.pausedAt = Date.now();
    setStage("paused");
  };
  const resume = () => {
    const c = clockRef.current;
    c.paused += Date.now() - c.pausedAt;
    c.pausedAt = 0;
    if (current) void speak(current.question);
  };
  const keepGoing = () => {
    clockRef.current.extra += 5;
    if (phase === "live") return;
    setPhase("live");
    askNext();
  };

  // ---- the review ----
  const [drafts, setDrafts] = useState<{ summary: string; items: (Draft & { keep: boolean })[] } | null>(null);
  const [kept, setKept] = useState(0);
  const keep = async () => {
    if (!drafts) return;
    const day = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const chosen = drafts.items.filter((x) => x.keep);
    const facts = chosen.filter((d) => d.kind === "fact" && !modules.some((m) => m.id === d.about));
    const problems: string[] = [];
    let count = 0;
    setPhase("closing");
    for (const d of chosen.filter((x) => !facts.includes(x))) {
      try {
        const project = modules.find((m) => m.id === d.about);
        // A note never replaces a page of the same title: the date keeps it its own.
        await client.writeNote(project ? `module:${project.id}` : "person", `${d.label} (${tool.title}, ${day})`, d.text);
        count += 1;
      } catch (e) {
        problems.push(`${d.label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Facts are Zazoo's to record (the window has no route for them): one turn, exactly these.
    if (facts.length && saved) {
      try {
        const turn = await client.askAndWait(
          "The person approved these facts about themselves from the interview. Record each exactly as given with fact_record " +
            "(subject person, source stated), and nothing else:\n" + facts.map((f) => `- ${f.label}: ${f.text}`).join("\n"),
          { conversation: saved.thread },
        );
        if (turn.state === "done") count += facts.length;
        else problems.push(turn.reply || "Zazoo couldn't record the facts.");
      } catch (e) {
        problems.push(e instanceof Error ? e.message : String(e));
      }
    }
    setKept(count);
    setError(problems.length ? `Not kept: ${problems.join("; ")}` : null);
    onChanged();
    setPhase("done");
  };

  // ---- Zazoo, across the table ----
  const director = useMemo(() => new ZazooDirector(), []);
  const mood: Mood =
    phase === "preparing" || phase === "closing" || (phase === "live" && stage === "settling") ? "thinking" : phase === "live" && stage === "speaking" ? "talking" : phase === "live" && stage === "listening" ? "listening" : "idle";
  useEffect(() => {
    director.setTalking(mood === "talking");
    director.perform({ emotion: EMOTION[mood], attention: "user" });
  }, [director, mood]);

  // ---- the screen ----
  const questions = saved?.prepared.questions ?? [];
  // Half minutes: with short spoken answers a whole plan is often only a few minutes.
  const half = (m: number) => Math.ceil(m * 2) / 2;
  const full = Math.max(0.5, half(fullMinutes(questions)));
  // The shortest interview that still asks one question.
  const least = Math.min(full, half(Math.min(...questions.filter((q) => !q.parent).map((q) => fullMinutes([q])))));
  const minutes = Math.min(Math.max(budget, least), full);
  const preview = useMemo(() => plan(questions, minutes), [questions, minutes]);
  const canListen = speech.supported && !speech.error;
  const small = phase === "review" || phase === "done";

  const status =
    phase === "preparing"
      ? "Getting ready…"
      : phase === "closing"
        ? "Drafting what to keep…"
        : phase === "timeup"
          ? `That's your time. ${leftRef.current.length} question${leftRef.current.length === 1 ? " is" : "s are"} left.`
          : phase === "live"
            ? stage === "speaking"
              ? "Zazoo is asking"
              : stage === "listening"
                ? canListen
                  ? "Listening…"
                  : "Type your answer"
                : stage === "settling"
                  ? "Got it"
                  : "Paused"
            : null;

  return (
    <div className="page interview">
      <PageHeader
        title={
          <span className="crumbs">
            <IconButton size="sm" aria-label="Back to Tools" title="Back to Tools" onClick={onBack}>
              <ArrowLeft size={16} />
            </IconButton>
            <button type="button" className="crumbs__up" onClick={onBack}>
              Tools
            </button>
            <ChevronRight size={14} className="faint" aria-hidden="true" />
            {tool.title} <InfoTip content={tool.description} label={`About ${tool.title}`} />
          </span>
        }
        right={
          phase === "live" || phase === "timeup" ? (
            <span className="faint num">{clock(minutesLeft())} left</span>
          ) : phase === "setup" ? (
            <Button size="sm" variant="ghost" onClick={() => void prepare(true)}>
              Prepare again
            </Button>
          ) : null
        }
      />

      <div className="interview__room">
        <button
          type="button"
          className={`interview__zazoo${small ? " interview__zazoo--small" : ""}`}
          data-mood={mood}
          data-overflow-ok=""
          aria-label={phase === "live" && stage === "speaking" ? "Answer now" : phase === "live" && stage === "listening" ? "Done answering" : "Zazoo"}
          onClick={() => {
            if (phase !== "live") return;
            if (stage === "speaking") {
              saying.current += 1;
              stopSaying();
              listen();
            } else if (stage === "listening") settle(ear.current.text);
          }}
        >
          <CompanionZazooFace director={director} size={small ? 120 : 320} crop={false} label="" />
        </button>

        {status ? (
          <p className="interview__status" role="status">
            {status}
            {phase === "live" && stage === "listening" && canListen ? (
              <span className="interview__level" aria-hidden="true">
                {[0.6, 1, 0.8, 0.5].map((k, i) => (
                  <span key={i} style={{ height: `${4 + Math.min(1, level * 12 * k) * 14}px` }} />
                ))}
              </span>
            ) : null}
          </p>
        ) : null}

        {phase === "live" && current ? (
          <>
            {words ? (
              <div className="interview__words" aria-live="polite">
                {lead ? <p className="muted">{lead}</p> : null}
                <p className="interview__q">{current.question}</p>
                {heard ? <p className="muted">{heard}</p> : null}
              </div>
            ) : null}
            {canListen ? null : (
              <form
                className="interview__typed"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) settle(typed);
                }}
              >
                <Textarea aria-label="Your answer" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} />
                <Button type="submit" size="sm" disabled={!typed.trim()}>
                  Send
                </Button>
              </form>
            )}
            <div className="interview__strip">
              {stage === "paused" ? (
                <Button size="sm" variant="outline" onClick={resume}>
                  <Play size={14} /> Resume
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={pause}>
                  <Pause size={14} /> Pause
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => settle("", true)}>
                <SkipForward size={14} /> Skip
              </Button>
              <Button size="sm" variant="outline" onClick={keepGoing} title="Add five minutes to the interview">
                <Plus size={14} /> 5 more minutes
              </Button>
              <Button size="sm" variant="outline" onClick={() => void finish()}>
                <Square size={12} /> End
              </Button>
              <Button size="sm" variant="ghost" aria-pressed={words} onClick={() => setWords((w) => !w)}>
                <Captions size={14} /> Show words
              </Button>
              <span className="faint num">
                {answered.length + 1} of {answered.length + ahead}
              </span>
            </div>
          </>
        ) : null}

        {phase === "failed" ? (
          <div className="interview__panel">
            <p className="notice" role="alert">
              {error}
            </p>
            <Button onClick={() => void prepare(true)}>Try again</Button>
          </div>
        ) : null}

        {phase === "setup" && saved ? (
          <div className="card card--pad stack interview__panel">
            <div className="row interview__time">
              <label htmlFor="interview-minutes" className="tile__lab">
                How long do you have?
              </label>
              <InfoTip content={[saved.prepared.context, ...saved.prepared.gaps].filter(Boolean).join(" · ")} label="What Zazoo sees" />
              <span className="interview__minutes num">{minutes} min</span>
            </div>
            <input id="interview-minutes" type="range" min={least} max={full} step={0.5} value={minutes} onChange={(e) => setBudget(Number(e.target.value))} aria-valuetext={`${minutes} minutes, ${pct(preview.questionShare)} of the questions`} />
            <div className="interview__bar" aria-hidden="true">
              <div style={{ width: pct(preview.questionShare) }} />
            </div>
            <p className="faint" aria-live="polite">
              <strong>{pct(preview.questionShare)}</strong> of the questions ({preview.order.length} of {questions.length}) · <strong>{pct(preview.valueShare)}</strong> of their value
            </p>
            <div className="row">
              <div className="interview__scope">
                <StandardDropdown ariaLabel="What the interview is about" options={[{ value: "all", label: "Everything" }, ...modules.map((m) => ({ value: m.id, label: m.name }))]} value={scope || "all"} onChange={(v) => setScope(v === "all" ? "" : v)} />
              </div>
              <Button onClick={start} disabled={!preview.order.length}>
                <Mic size={14} /> Start the interview
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "timeup" ? (
          <div className="row interview__strip">
            <Button variant="outline" onClick={keepGoing}>
              <Plus size={14} /> 5 more minutes
            </Button>
            <Button onClick={() => void finish()}>Wrap up</Button>
          </div>
        ) : null}

        {phase === "unsaved" ? (
          <div className="interview__panel">
            <p className="notice" role="alert">
              {error}
            </p>
            <Button onClick={() => void finish()}>Draft again</Button>
          </div>
        ) : null}

        {phase === "review" && drafts ? (
          <div className="card card--pad stack interview__panel interview__review">
            <h2 className="interview__summary">
              {drafts.summary || "What to keep"} <InfoTip content="Nothing is kept until you say so. Untick what's wrong, fix the words, then keep the rest." label="About keeping" />
            </h2>
            {drafts.items.length ? (
              <ul className="interview__drafts">
                {drafts.items.map((d, i) => (
                  <li key={i}>
                    <input type="checkbox" aria-label={`Keep ${d.label}`} checked={d.keep} onChange={(e) => setDrafts({ ...drafts, items: drafts.items.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)) })} />
                    <div className="stack">
                      <span className="faint">
                        {d.kind === "fact" ? "Fact" : "Note"} · {d.label.replace(/_/g, " ")}
                        {modules.find((m) => m.id === d.about) ? ` · ${modules.find((m) => m.id === d.about)?.name}` : ""}
                      </span>
                      <Textarea aria-label={`${d.label} text`} rows={2} value={d.text} onChange={(e) => setDrafts({ ...drafts, items: drafts.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Nothing worth keeping.</p>
            )}
            <div className="row">
              <Button onClick={() => void keep()} disabled={!drafts.items.some((d) => d.keep)}>
                Keep {drafts.items.filter((d) => d.keep).length}
              </Button>
              <Button variant="ghost" onClick={() => setPhase("done")}>
                Keep nothing
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="interview__panel">
            <p>{answered.some((a) => !a.skipped) ? `Thanks. ${kept ? `Kept ${kept} thing${kept === 1 ? "" : "s"} from your answers.` : "Nothing was kept."}` : "Nothing was answered, so nothing changed."}</p>
            {error ? (
              <p className="notice" role="alert">
                {error}
              </p>
            ) : null}
            <div className="row">
              <Button variant="outline" onClick={onBack}>
                Back to Tools
              </Button>
              <Button onClick={() => void prepare(true)}>Another round</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
