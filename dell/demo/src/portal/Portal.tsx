import { useState } from "react";
import { ArrowLeft, Check, CircleCheck, ClipboardList, FileText, History, House, Send, UploadCloud, X } from "lucide-react";
import { Button, Card, Confirm, Disabled, Flash, Pill, useFlash } from "../kit";
import { href } from "../data/route";
import "./portal.css";

/* The client's view of the firm, for Angela Morrison (c-1042). Demo only: nothing here is sent anywhere. */

const TABS = [
  { id: "home", label: "Home", icon: House },
  { id: "aps", label: "Claimant statement", icon: ClipboardList },
  { id: "upload", label: "Upload records", icon: UploadCloud },
  { id: "history", label: "What we've sent", icon: History },
];

const QUESTIONS = [
  { id: "conditions", label: "Your conditions", before: "Multiple sclerosis (relapsing-remitting); chronic fatigue." },
  { id: "meds", label: "Your medications", before: "Ocrelizumab infusion every 6 months; modafinil 100 mg each morning; baclofen 10 mg twice a day." },
  { id: "doctors", label: "Your treating doctors", before: "Dr. Helen Ortiz, neurology; Dr. Samuel Reyes, pain management; Dr. Karen Holt, primary care." },
  { id: "daily", label: "Your daily activities", before: "I can do light chores for about 20 minutes before I need to rest. I don't drive on bad days. I need help with grocery shopping." },
];

type Answer = { mark?: "same" | "changed"; text: string };

const SUBMISSIONS = [
  {
    id: "sb-3298", what: "Neurology records and cover letter", sent: "8 Oct 2026", how: "Verified email", docs: 2,
    status: [["Sent", "green"], ["Delivery confirmed", "green"], ["Awaiting insurer acknowledgment", "yellow"]] as const,
  },
  {
    id: "sb-3290", what: "Claimant statement", sent: "12 Jul 2026", how: "Electronic fax", docs: 1,
    status: [["Sent", "green"], ["Delivery confirmed", "green"], ["Insurer acknowledged", "green"]] as const,
  },
];

export function Portal({ view }: { view: string }) {
  const active = TABS.some((t) => t.id === view) ? view : "home";
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(QUESTIONS.map((q) => [q.id, { text: q.before }])),
  );
  const [sent, setSent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  return (
    <div className="portal">
      <header className="portal__bar">
        <span className="portal__firm">Dell Disability Lawyers · Client portal</span>
        <Pill tone="blue">Demo of what the client sees</Pill>
        <span className="portal__who">Angela Morrison</span>
        <a className="portal__back" href={href.home()}><ArrowLeft aria-hidden /> Back to the staff view</a>
      </header>
      <nav className="portal__tabs" aria-label="Portal sections">
        {TABS.map((t) => (
          <a key={t.id} href={href.portal(t.id)} className={["portal__tab", t.id === active && "portal__tab--on"].filter(Boolean).join(" ")} aria-current={t.id === active ? "page" : undefined}>
            <t.icon aria-hidden /> {t.label}
          </a>
        ))}
      </nav>
      <main className="portal__body">
        {active === "home" ? <Home answers={answers} sent={sent} /> : null}
        {active === "aps" ? <Aps answers={answers} setAnswers={setAnswers} sent={sent} onSend={() => setSent(true)} /> : null}
        {active === "upload" ? <Upload files={files} setFiles={setFiles} /> : null}
        {active === "history" ? <HistoryView /> : null}
      </main>
    </div>
  );
}

function Home({ answers, sent }: { answers: Record<string, Answer>; sent: boolean }) {
  const marked = QUESTIONS.filter((q) => answers[q.id].mark).length;
  const items = [
    { label: "Updated APS questionnaire", state: "Sent to your legal team on 10 Oct 2026", done: true },
    { label: "Claimant statement", state: sent ? "Sent to your legal team" : marked ? `${marked} of ${QUESTIONS.length} answered` : "To do", done: sent, link: href.portal("aps") },
    { label: "Medical authorization", state: "Ready for you to check and sign", done: false },
  ];
  const done = items.filter((i) => i.done).length;
  return (
    <>
      <h1 className="hero">Hello, Angela</h1>
      <Card title="Your insurance company requested updated information" icon={FileText} info="Unum asked for an update on claim UNM-77310452. Their deadline is 15 Nov 2026. Your legal team checks everything before it goes to Unum.">
        <div className="portal__progress">
          <div className="bar"><div className="bar__fill" style={{ width: `${(done / items.length) * 100}%` }} /></div>
          <span className="meta">{done} of {items.length} done</span>
        </div>
        <ul className="portal__items">
          {items.map((i) => (
            <li key={i.label}>
              {i.done ? <CircleCheck className="portal__ok" aria-hidden /> : <span className="portal__dot" aria-hidden />}
              <span className="portal__item-text">
                <span>{i.label}</span>
                <span className="meta">{i.state}</span>
              </span>
              {i.link && !i.done ? <a className="btn btn--primary portal__go" href={i.link}>{marked ? "Continue" : "Start"}</a> : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Have new medical records?" icon={UploadCloud}>
        <a className="btn portal__go" href={href.portal("upload")}>Upload records</a>
      </Card>
    </>
  );
}

function Aps({ answers, setAnswers, sent, onSend }: {
  answers: Record<string, Answer>; setAnswers: (f: (a: Record<string, Answer>) => Record<string, Answer>) => void; sent: boolean; onSend: () => void;
}) {
  const [flash, setFlash] = useFlash();
  const [confirm, setConfirm] = useState(false);
  const left = QUESTIONS.filter((q) => !answers[q.id].mark).length;
  const set = (id: string, a: Partial<Answer>) => {
    setAnswers((all) => ({ ...all, [id]: { ...all[id], ...a } }));
    setFlash("Saved");
  };
  return (
    <>
      <h2 className="portal__title">Has anything changed since your last statement on 12 Jul 2026?</h2>
      {QUESTIONS.map((q) => {
        const a = answers[q.id];
        return (
          <Card key={q.id} title={q.label}>
            {a.mark === "changed" ? (
              <textarea
                className="input input--long"
                aria-label={`${q.label}, what changed`}
                value={a.text}
                disabled={sent}
                onChange={(e) => set(q.id, { text: e.target.value })}
              />
            ) : (
              <p className="portal__before">{q.before}</p>
            )}
            <div className="portal__choice" role="radiogroup" aria-label={q.label}>
              {(["same", "changed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={a.mark === m}
                  disabled={sent}
                  className={["portal__opt", a.mark === m && "portal__opt--on"].filter(Boolean).join(" ")}
                  onClick={() => set(q.id, m === "same" ? { mark: m, text: q.before } : { mark: m })}
                >
                  {a.mark === m ? <Check aria-hidden /> : null}
                  {m === "same" ? "Same" : "Changed"}
                </button>
              ))}
            </div>
          </Card>
        );
      })}
      <div className="portal__send">
        {sent ? (
          <Pill tone="green">Sent to your legal team</Pill>
        ) : left ? (
          <Disabled reason={`Mark ${left} more ${left === 1 ? "section" : "sections"} as Same or Changed first`}>
            <Button variant="primary" icon={Send} disabled>Send to my legal team</Button>
          </Disabled>
        ) : (
          <Button variant="primary" icon={Send} onClick={() => setConfirm(true)}>Send to my legal team</Button>
        )}
        <Flash msg={flash} />
      </div>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Send your answers to your legal team?"
        body="Maria Alvarez and Daniel Brooks will review your answers first. Nothing goes to Unum until they have checked it. You can't edit your answers after sending, but you can call the office with changes."
        action="Send to my legal team"
        danger={false}
        onConfirm={onSend}
      />
    </>
  );
}

function size(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Upload({ files, setFiles }: { files: File[]; setFiles: (f: (x: File[]) => File[]) => void }) {
  const [remove, setRemove] = useState<File | null>(null);
  const [flash, setFlash] = useFlash();
  return (
    <>
      <h2 className="portal__title">Upload medical records</h2>
      <Card title="Add files" icon={UploadCloud}>
        <label className="portal__drop">
          <UploadCloud aria-hidden />
          <span>Drop files here, or tap to choose</span>
          <span className="meta">PDF, photos or scans. In this demo nothing leaves your browser.</span>
          <input
            type="file"
            multiple
            accept=".pdf,image/*"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!picked.length) return;
              setFiles((x) => [...x, ...picked]);
              setFlash(picked.length === 1 ? "Added 1 file" : `Added ${picked.length} files`);
            }}
          />
        </label>
        <Flash msg={flash} />
      </Card>
      <Card title="Your files">
        {files.length === 0 ? (
          <p className="empty">No files yet.</p>
        ) : (
          <ul className="portal__files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <FileText aria-hidden />
                <span className="portal__item-text">
                  <span className="portal__fname">{f.name}</span>
                  <span className="meta">{size(f.size)}</span>
                </span>
                <Button variant="ghost" icon={X} className="portal__go" onClick={() => setRemove(f)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Confirm
        open={!!remove}
        onOpenChange={(o) => { if (!o) setRemove(null); }}
        title="Remove this file?"
        body={`${remove?.name ?? ""} will be taken off this list. The file on your device is not touched.`}
        action="Remove"
        onConfirm={() => setFiles((x) => x.filter((f) => f !== remove))}
      />
    </>
  );
}

function HistoryView() {
  return (
    <>
      <h2 className="portal__title">What we've sent to Unum</h2>
      {SUBMISSIONS.map((s) => (
        <Card key={s.id} title={s.what} icon={FileText} info="Only final documents your legal team approved are shown here.">
          <p className="meta">Sent {s.sent} · {s.how} · {s.docs} {s.docs === 1 ? "document" : "documents"} · {s.id}</p>
          <div className="portal__pills">
            {s.status.map(([label, tone]) => <Pill key={label} tone={tone}>{label}</Pill>)}
          </div>
        </Card>
      ))}
    </>
  );
}
