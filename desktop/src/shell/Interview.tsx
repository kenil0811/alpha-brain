/**
 * A voice tool running: Alpha prepares (reads what it holds, finds the gaps, writes questions
 * with a value and a time each), the person slides how long they have and sees what share of
 * the questions and of their value fits, then Alpha asks aloud and listens hands-free (about two
 * seconds of quiet ends an answer; "skip" and "stop" are heard as such). The plan is redone after
 * every answer with the time left, so a long answer costs the least valuable questions, never
 * the flow. At the end Alpha drafts facts and notes; nothing is kept until the person ticks it.
 * The questions and answers stay in the interview's own conversation, so the journal has them
 * verbatim. Listening uses the window's speech recognition (shell/voice): Chrome has it, the Mac
 * app's WebKit does not yet, so there the answer is typed or dictated with the Mac's dictation key.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, ModuleCard } from "../core/client";
import { Button, InfoTip, PageHeader } from "../ui";
import { Mic } from "../ui/icons";
import { closePrompt, command, fullMinutes, parseDrafts, parsePrepared, plan, preparePrompt, type Answered, type Draft, type Prepared, type Question, type Tool } from "./interviewPlan";
import type { Surface } from "./Rail";
import { useSpeech } from "./voice";

/** Quiet that ends an answer. */
const QUIET_MS = 2000;
/** Time a question may run past the end, so the plan the person chose is the plan they get. */
const GRACE_MINUTES = 0.25;
/** Microphone level counted as speech (0–1 RMS). */
const SPEECH_RMS = 0.02; // ponytail: one level for every room and mic; calibrate on the first second if it cuts people off

type Phase = "preparing" | "setup" | "live" | "timeup" | "closing" | "review" | "done" | "failed" | "unsaved";
type Stage = "speaking" | "listening" | "settling" | "paused";
interface Saved {
  prepared: Prepared;
  /** The interview's conversation: where Alpha prepares and drafts, so the journal keeps both. */
  thread: string;
  at: string;
}

/** Saying a question aloud with the window's own voice; `speaking` follows the real start and end. */
function useSay() {
  const [speaking, setSpeaking] = useState(false);
  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);
  const speak = useCallback((text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    synth.speak(u);
  }, []);
  useEffect(() => stop, [stop]);
  return { speaking, speak, stop };
}

const cacheKey = (tool: Tool, scope: string) => `alpha.interview.${tool.id}.${scope || "all"}`;
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

export function Interview({ client, tool, modules, onGo, onChanged }: { client: Client; tool: Tool; modules: ModuleCard[]; onGo: (s: Surface) => void; onChanged: () => void }) {
  const [scope, setScope] = useState("");
  const [phase, setPhase] = useState<Phase>("preparing");
  const [progress, setProgress] = useState("Reading what Alpha holds…");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [budget, setBudget] = useState(10);
  const [error, setError] = useState<string | null>(null);
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
        setBudget((b) => Math.min(b, Math.ceil(fullMinutes(cached.prepared.questions))));
        setPhase("setup");
        return;
      }
      setPhase("preparing");
      setProgress("Reading what Alpha holds…");
      try {
        const project = modules.find((m) => m.id === scope) ?? null;
        const running =
          inflight.get(key) ??
          (async () => {
            const thread = await client.newConversation(project?.id ?? null, `Interview: ${tool.title}`);
            const turn = await client.askAndWait(preparePrompt(tool, project), { conversation: thread.id }, (t) => {
              const last = t.steps?.at(-1)?.text;
              if (last) setProgress(last);
            });
            const prepared = turn.state === "done" ? parsePrepared(turn.reply ?? "") : null;
            if (!prepared) throw new Error(turn.state === "done" ? "Alpha didn't come back with questions. Try again." : turn.reply || "Alpha couldn't prepare the interview.");
            const made = { prepared, thread: thread.id, at: new Date().toISOString() };
            localStorage.setItem(key, JSON.stringify(made));
            return made;
          })().finally(() => inflight.delete(key));
        inflight.set(key, running);
        const next = await running;
        setSaved(next);
        setBudget((b) => Math.min(b, Math.ceil(fullMinutes(next.prepared.questions))));
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
  const [ahead, setAhead] = useState(0);
  const [stage, setStageState] = useState<Stage>("speaking");
  const stageRef = useRef<Stage>("speaking");
  const setStage = (s: Stage) => {
    stageRef.current = s;
    setStageState(s);
  };
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [, setNow] = useState(Date.now()); // the clock's tick
  const clockRef = useRef({ startedAt: 0, pausedAt: 0, paused: 0, extra: 0, budget: 0 });
  const ear = useRef({ text: "", lastHeard: 0, lastText: 0, heardAny: false, saidAt: 0, sawSpeaking: false, stoppedAt: 0 });

  const speech = useSpeech((final, interim) => {
    const text = `${final} ${interim}`.trim();
    ear.current.text = text;
    ear.current.lastHeard = ear.current.lastText = Date.now();
    if (text) ear.current.heardAny = true;
    setHeard(text);
  });
  const tts = useSay();
  const speechRef = useRef(speech);
  speechRef.current = speech;

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

  const say = useCallback(
    (words: string) => {
      Object.assign(ear.current, { saidAt: Date.now(), sawSpeaking: false });
      setStage("speaking");
      tts.speak(words);
    },
    [tts],
  );

  const finish = useCallback(async () => {
    speechRef.current.stop();
    tts.stop();
    setCurrent(null);
    const said = answeredRef.current.filter((a) => !a.skipped && a.answer.trim());
    if (!said.length || !saved) {
      setPhase("done");
      return;
    }
    setPhase("closing");
    try {
      const turn = await client.askAndWait(closePrompt(tool, answeredRef.current), { conversation: saved.thread });
      if (turn.state !== "done") throw new Error(turn.reply || "Alpha couldn't draft what to keep.");
      const { summary, items } = parseDrafts(turn.reply ?? "");
      setDrafts({ summary, items: items.map((d) => ({ ...d, keep: true })) });
      setPhase("review");
    } catch (e) {
      // The answers are still here: drafting is tried again from them, never from a new interview.
      setError(e instanceof Error ? e.message : String(e));
      setPhase("unsaved");
    }
  }, [client, saved, tool, tts]);

  const askNext = useCallback(
    (topic?: string) => {
      if (!saved) return;
      const asked = new Set(answeredRef.current.map((a) => a.question.id));
      const left = saved.prepared.questions.filter((q) => !asked.has(q.id));
      // A question that would just fit when the clock started still fits a moment later.
      const p = plan(left, Math.max(0, minutesLeft() + GRACE_MINUTES), topic);
      const q = p.order[0];
      if (!q) {
        speechRef.current.stop();
        setCurrent(null);
        if (left.length) setPhase("timeup");
        else void finish();
        return;
      }
      setCurrent(q);
      setAhead(p.order.length);
      const first = answeredRef.current.length === 0;
      const lead = first
        ? `I have ${p.order.length} question${p.order.length === 1 ? "" : "s"} for you. Say skip to move on, or stop to finish. `
        : q.topic !== topic
          ? `Thanks. Next, ${q.topic.toLowerCase()}. `
          : "";
      say(lead + q.question);
    },
    // minutesLeft reads refs only
    [saved, say, finish],
  );

  const settle = useCallback(
    (answer: string, skipped = false) => {
      const q = current;
      if (!q) return;
      speechRef.current.stop();
      tts.stop();
      const cmd = skipped ? "skip" : command(answer);
      if (cmd === "stop") {
        void finish();
        return;
      }
      if (!cmd && !answer.trim()) {
        listen(); // nothing came through: keep listening
        return;
      }
      answeredRef.current = [...answeredRef.current, { question: q, answer: cmd ? "" : answer.trim(), skipped: cmd === "skip" }];
      setAnswered(answeredRef.current);
      setTyped("");
      askNext(q.topic);
    },
    [askNext, current, finish, listen, tts],
  );
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // Speaking ends -> listen. A voice that never starts (speaking switched off, no voice) is waited on briefly.
  useEffect(() => {
    if (phase !== "live" || stageRef.current !== "speaking") return;
    if (tts.speaking) ear.current.sawSpeaking = true;
    else if (ear.current.sawSpeaking) listen();
  }, [tts.speaking, phase, listen]);

  // The ear: microphone level and words both count as speech; quiet after speech ends the answer.
  useEffect(() => {
    if (phase !== "live") return;
    let level: (() => number) | null = null;
    let release: () => void = () => {};
    void navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        level = () => {
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
      if (s === "speaking" && !e.sawSpeaking && t - e.saidAt > 2500) listen();
      if (s === "listening") {
        if (level && level() > SPEECH_RMS) {
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
  }, [phase, listen]);

  const start = () => {
    clockRef.current = { startedAt: Date.now(), pausedAt: 0, paused: 0, extra: 0, budget: minutes };
    setKept(0);
    answeredRef.current = [];
    setAnswered([]);
    setPhase("live");
    askNext();
  };
  const pause = () => {
    speech.stop();
    tts.stop();
    clockRef.current.pausedAt = Date.now();
    setStage("paused");
  };
  const resume = () => {
    const c = clockRef.current;
    c.paused += Date.now() - c.pausedAt;
    c.pausedAt = 0;
    if (current) say(current.question);
  };
  const keepGoing = () => {
    clockRef.current.extra += 5;
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
    // Facts are Alpha's to record (the window has no route for them): one turn, exactly these.
    if (facts.length && saved) {
      try {
        const turn = await client.askAndWait(
          "The person approved these facts about themselves from the interview. Record each exactly as given with fact_record " +
            "(subject person, source stated), and nothing else:\n" + facts.map((f) => `- ${f.label}: ${f.text}`).join("\n"),
          { conversation: saved.thread },
        );
        if (turn.state === "done") count += facts.length;
        else problems.push(turn.reply || "Alpha couldn't record the facts.");
      } catch (e) {
        problems.push(e instanceof Error ? e.message : String(e));
      }
    }
    setKept(count);
    setError(problems.length ? `Not kept: ${problems.join("; ")}` : null);
    onChanged();
    setPhase("done");
  };

  // ---- the screen ----
  const questions = saved?.prepared.questions ?? [];
  const full = Math.max(1, Math.ceil(fullMinutes(questions)));
  // The shortest interview that still asks one question.
  const least = Math.min(full, Math.ceil(Math.min(...questions.map((q) => fullMinutes([q])))));
  const minutes = Math.min(Math.max(budget, least), full);
  const preview = useMemo(() => plan(questions, minutes), [questions, minutes]);
  const inPlan = new Set(preview.order.map((q) => q.id));
  const topics = [...new Set([...preview.order, ...questions].map((q) => q.topic))];


  return (
    <div className="page interview">
      <PageHeader
        path={[{ label: "Intelligence", onClick: () => onGo({ kind: "intelligence" }) }, { label: "Tools", onClick: () => onGo({ kind: "intelligence", tab: "tools" }) }]}
        title={tool.title}
        info={tool.description}
        right={
          phase === "setup" ? (
            <Button size="sm" variant="ghost" onClick={() => void prepare(true)}>
              Prepare again
            </Button>
          ) : null
        }
      />

      {phase === "preparing" ? (
        <div className="card interview__card" role="status">
          <div className="interview__orb interview__orb--thinking" aria-hidden="true" />
          <p>{progress}</p>
        </div>
      ) : null}

      {phase === "failed" ? (
        <div className="card interview__card">
          <p>{error}</p>
          <Button variant="primary" onClick={() => void prepare(true)}>
            Try again
          </Button>
        </div>
      ) : null}

      {phase === "setup" && saved ? (
        <div className="stack">
          <div className="card interview__card interview__card--left">
            <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
              <span className="tile__lab">What Alpha sees</span>
              <span className="faint">Prepared {new Date(saved.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p>{saved.prepared.context}</p>
            {saved.prepared.gaps.length ? (
              <details>
                <summary className="faint">{saved.prepared.gaps.length} gaps it found</summary>
                <ul>
                  {saved.prepared.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <label className="row interview__scope">
              <span className="faint">About</span>
              <select aria-label="What the interview is about" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Everything</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="card interview__card interview__card--left">
            <label htmlFor="interview-minutes" className="tile__lab">
              How long do you have?
            </label>
            <div className="interview__time">
              <span className="tile__big num">{minutes} min</span>
              <input id="interview-minutes" type="range" min={least} max={full} step={1} value={Math.min(Math.max(budget, least), full)} onChange={(e) => setBudget(Number(e.target.value))} aria-valuetext={`${minutes} minutes, ${pct(preview.questionShare)} of the questions`} />
            </div>
            <div className="interview__cover" aria-live="polite">
              <div className="interview__bar">
                <div style={{ width: pct(preview.questionShare) }} />
              </div>
              <span>
                <strong>{pct(preview.questionShare)}</strong> of the questions ({preview.order.length} of {questions.length}) · <strong>{pct(preview.valueShare)}</strong> of what they're worth
              </span>
            </div>
            <ol className="interview__plan">
              {topics.map((t) => (
                <li key={t}>
                  <span className="interview__topic">{t}</span>
                  <ul>
                    {questions
                      .filter((q) => q.topic === t)
                      .sort((a, b) => b.value - a.value)
                      .map((q) => (
                        <li key={q.id} className={inPlan.has(q.id) ? "" : "interview__out"} title={q.why}>
                          {q.question} <span className="faint">· {q.minutes} min</span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
            <Button variant="primary" icon={<Mic size={16} />} onClick={start} disabled={!preview.order.length}>
              Start the interview
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "live" && current ? (
        <div className="card interview__card interview__live">
          <div className="row faint" style={{ justifyContent: "space-between", width: "100%" }}>
            <span>
              Question {answered.length + 1} of {answered.length + ahead}
            </span>
            <span className="num">{clock(minutesLeft())} left</span>
          </div>
          <button
            type="button"
            className={`interview__orb interview__orb--${stage}`}
            aria-label={stage === "speaking" ? "Answer now" : stage === "listening" ? "Done answering" : "Listening"}
            onClick={() => {
              if (stage === "speaking") {
                tts.stop();
                listen();
              } else if (stage === "listening") settle(ear.current.text);
            }}
          >
            <Mic size={28} />
          </button>
          <span className="faint">{stage === "speaking" ? "Alpha is asking" : stage === "listening" ? "Listening, take your time" : stage === "settling" ? "Got it" : "Paused"}</span>
          <span className="interview__topic">{current.topic}</span>
          <h2 className="interview__q">{current.question}</h2>
          <p className="faint">{current.why}</p>
          <p className="interview__heard" aria-live="polite">
            {heard || speech.error || (speech.supported ? "" : "This window can't listen yet: type your answer, or press your Mac's dictation key.")}
          </p>
          <form
            className="row interview__typed"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) settle(typed);
            }}
          >
            <textarea aria-label="Type your answer instead" placeholder="Or type your answer" rows={1} value={typed} onChange={(e) => setTyped(e.target.value)} onFocus={() => speech.stop()} />
            <Button type="submit" size="sm" disabled={!typed.trim()}>
              Send
            </Button>
          </form>
          <div className="row">
            <Button size="sm" onClick={() => settle("", true)}>
              Skip
            </Button>
            {stage === "paused" ? (
              <Button size="sm" onClick={resume}>
                Resume
              </Button>
            ) : (
              <Button size="sm" onClick={pause}>
                Pause
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void finish()}>
              End
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "unsaved" ? (
        <div className="card interview__card">
          <p>{error}</p>
          <p className="faint">Your {answered.filter((a) => !a.skipped).length} answers are kept on this page until drafting works.</p>
          <Button variant="primary" onClick={() => void finish()}>
            Draft again
          </Button>
        </div>
      ) : null}

      {phase === "timeup" ? (
        <div className="card interview__card">
          <p>That's your time. {questions.length - answered.length} questions are left.</p>
          <div className="row">
            <Button onClick={keepGoing}>5 more minutes</Button>
            <Button variant="primary" onClick={() => void finish()}>
              Wrap up
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "closing" ? (
        <div className="card interview__card" role="status">
          <div className="interview__orb interview__orb--thinking" aria-hidden="true" />
          <p>Alpha is drafting what to keep from your answers…</p>
        </div>
      ) : null}

      {phase === "review" && drafts ? (
        <div className="card interview__card interview__card--left">
          <p>{drafts.summary}</p>
          {drafts.items.length ? (
            <>
              <ul className="interview__drafts">
                {drafts.items.map((d, i) => (
                  <li key={i}>
                    <input type="checkbox" aria-label={`Keep ${d.label}`} checked={d.keep} onChange={(e) => setDrafts({ ...drafts, items: drafts.items.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)) })} />
                    <div>
                      <span className="faint">
                        {d.kind === "fact" ? "Fact" : "Note"} · {d.label.replace(/_/g, " ")}
                        {modules.find((m) => m.id === d.about) ? ` · ${modules.find((m) => m.id === d.about)?.name}` : ""}
                      </span>
                      <textarea aria-label={`${d.label} text`} rows={2} value={d.text} onChange={(e) => setDrafts({ ...drafts, items: drafts.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="faint">Nothing in the answers was worth keeping as a fact or a note.</p>
          )}
          <div className="row">
            <Button variant="primary" onClick={() => void keep()} disabled={!drafts.items.some((d) => d.keep)}>
              Keep {drafts.items.filter((d) => d.keep).length}
            </Button>
            <InfoTip text="Nothing is kept until you say so. Untick what's wrong, fix the words, then keep the rest." />
            <Button variant="ghost" onClick={() => setPhase("done")}>
              Keep nothing
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="card interview__card">
          <p>{answered.filter((a) => !a.skipped).length ? `Thanks. ${kept ? `Kept ${kept} thing${kept === 1 ? "" : "s"} from your answers.` : "Nothing was kept."}` : "Nothing was answered, so nothing changed."}</p>
          {error ? <p className="notice">{error}</p> : null}
          <div className="row">
            <Button onClick={() => onGo({ kind: "home" })}>Back to Home</Button>
            <Button variant="primary" onClick={() => void prepare(true)}>
              Another round
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
