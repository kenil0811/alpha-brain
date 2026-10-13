import { BookOpen, CalendarClock, CircleCheck, FileSearch, FolderOpen, ListChecks, Scale, TriangleAlert } from "lucide-react";
import { Card, Pill } from "../kit";
import { daysBetween, fmtDate } from "../data/format";
import { href } from "../data/route";
import { useWorld } from "../data/store";
import type { Project, Rec } from "../data/types";
import type { Extras } from "./extras";

/* Appeals: ERISA LTD appeals of denials and terminations. Sample data — invented.
   The rule that matters: every chronology line cites a claim-file page, and the 180-day
   appeal deadline is proposed by Alpha but only counts once an attorney confirms it. */

const TODAY = "2026-10-12";
const plus180 = (iso: string) => new Date(Date.parse(iso) + 180 * 86_400_000).toISOString().slice(0, 10);

const STAGE = [
  { value: "Record requested", tone: "blue" as const },
  { value: "Reviewing record", tone: "blue" as const },
  { value: "Building evidence", tone: "blue" as const },
  { value: "Drafting appeal", tone: "yellow" as const },
  { value: "In litigation", tone: "gray" as const },
  { value: "Appeal won", tone: "green" as const, done: true },
];
const OPEN = (r: Rec) => r.stage !== "Appeal won" && r.stage !== "In litigation";

const RECORD = [
  { value: "Received", tone: "green" as const, done: true },
  { value: "Requested", tone: "blue" as const },
  { value: "Overdue from insurer", tone: "red" as const },
];

const CH_STATUS = [
  { value: "Proposed", tone: "yellow" as const },
  { value: "Approved", tone: "green" as const, done: true },
];

const EV_STATUS = [
  { value: "Planned", tone: "gray" as const },
  { value: "Requested", tone: "blue" as const },
  { value: "Draft", tone: "yellow" as const },
  { value: "Overdue", tone: "red" as const },
  { value: "Received", tone: "green" as const, done: true },
];

/* ---------- claim file ---------- */

const cf = (id: string, title: string, matter: string, docType: string, pages: number, date: string, bates: string, reviewed: boolean): Rec => ({ id, title, matter, docType, pages, date, bates, reviewed });

const CLAIM_FILE: Rec[] = [
  cf("cf-1", "Termination letter", "am-1011", "Decision letter", 6, "2026-06-08", "CF 0001–0006", true),
  cf("cf-2", "Peer review — psychiatry", "am-1011", "Insurer review", 14, "2026-05-28", "CF 0007–0020", true),
  cf("cf-3", "Surveillance report", "am-1011", "Insurer review", 22, "2026-05-02", "CF 0021–0042", true),
  cf("cf-4", "Treating records — psychiatry and primary care", "am-1011", "Medical records", 388, "2026-06-14", "CF 0043–0430", true),
  cf("cf-5", "Claim notes", "am-1011", "Claim notes", 612, "2026-06-08", "CF 0431–1042", false),
  cf("cf-6", "Denial letter", "am-1061", "Decision letter", 9, "2026-04-22", "CF 0001–0009", true),
  cf("cf-7", "Vocational report — transferable skills", "am-1061", "Insurer review", 18, "2026-04-10", "CF 0010–0027", true),
  cf("cf-8", "Independent medical exam", "am-1061", "Insurer review", 31, "2026-03-19", "CF 0028–0058", true),
  cf("cf-9", "Rheumatology records", "am-1061", "Medical records", 1104, "2026-03-30", "CF 0059–1162", true),
  cf("cf-10", "Claim notes", "am-1061", "Claim notes", 840, "2026-04-22", "CF 1163–2002", false),
  cf("cf-11", "Final denial and record index", "am-1024", "Decision letter", 12, "2026-02-10", "CF 0001–0012", true),
];

const pagesOf = (matter: string) => CLAIM_FILE.filter((d) => d.matter === matter).reduce((n, d) => n + Number(d.pages), 0);

/* ---------- matters ---------- */

const matter = (id: string, title: string, client: string, insurer: string, claim: string, stage: string, denied: string, attorney: string, record: string, reasons: string[], extra: Partial<Rec> = {}): Rec => {
  const deadline = OPEN({ id, stage }) ? plus180(denied) : "";
  return { id, title, client, insurer, claim, stage, denied, deadline, daysLeft: deadline ? daysBetween(TODAY, deadline) : null, attorney, record, pages: pagesOf(id) || null, reasons, ...extra };
};

const MATTERS: Rec[] = [
  matter("am-1011", "Denise Walker — Lincoln termination", "c-1011", "ins-lincoln", "LFG-2209351", "Building evidence", "2026-06-08", "Elena Ruiz", "Received",
    ["No objective evidence", "Psychiatric peer review", "Surveillance"],
    { _prov: { deadline: { kind: "source", note: "180 days from the termination letter dated 8 Jun 2026 (CF 0001). Confirmed by Elena Ruiz on 11 Jun 2026." } } }),
  matter("am-1036", "Jerome Washington — Reliance termination", "c-1036", "ins-reliance", "RSL-6624019", "Record requested", "2026-08-20", "Daniel Brooks", "Requested",
    ["Ejection fraction improved", "No treating physician statement"],
    { _prov: { deadline: { kind: "source", note: "180 days from the termination letter dated 20 Aug 2026. Confirmed by Daniel Brooks on 28 Aug 2026." }, reasons: { kind: "source", note: "Read from the termination letter; the full claim file has not arrived yet" } } }),
  matter("am-1061", "Carlos Mendoza — Prudential any-occupation denial", "c-1061", "ins-prudential", "PRU-5590871", "Drafting appeal", "2026-04-22", "Elena Ruiz", "Received",
    ["Vocational report", "IME findings"],
    { _prov: { deadline: { kind: "estimated", note: "180 days from the denial letter dated 22 Apr 2026 (CF 0001). Waiting for an attorney to confirm." } } }),
  matter("am-1024", "Robert Nguyen — Unum final denial", "c-1024", "ins-unum", "UNM-77452210", "In litigation", "2026-02-10", "Elena Ruiz", "Received",
    ["Own occupation not met"], { _prov: { deadline: { kind: "source", note: "Appeal rights used up with the final denial; the case is now in federal court" } } }),
  matter("am-1055", "Anthony Russo — MetLife termination", "c-1055", "ins-metlife", "MET-4418230", "Appeal won", "2025-09-15", "Daniel Brooks", "Received", ["Return to work possible"]),
  matter("am-1020", "Linda Chen — Prudential denial", "c-1020", "ins-prudential", "PRU-5512064", "Appeal won", "2024-11-04", "Elena Ruiz", "Received", ["Pre-existing condition"]),
];

/* ---------- chronology ---------- */

const ch = (id: string, date: string, event: string, matterId: string, client: string, kind: string, cite: string, doc: string, quote: string, status: string): Rec => ({
  id, date, event, matter: matterId, client, kind, cite, doc, quote, status,
  _prov: { event: { kind: status === "Approved" ? "source" : "estimated", note: status === "Approved" ? `Read from ${cite}; approved by the attorney` : `Summarised by Alpha from ${cite}; waiting for an attorney` } },
});

const CHRONOLOGY: Rec[] = [
  ch("ch-1", "2025-11-03", "Dr. Whitaker notes worsening depression and starts duloxetine", "am-1011", "c-1011", "Medical", "CF 0112", "cf-4", "Pt reports low mood most days, poor sleep. PHQ-9 of 19. Start duloxetine 30 mg.", "Approved"),
  ch("ch-2", "2026-01-14", "Lincoln continues benefits under own occupation", "am-1011", "c-1011", "Claim", "CF 0458", "cf-5", "Claim reviewed. Restrictions supported. Continue benefits, next review in 6 months.", "Approved"),
  ch("ch-3", "2026-02-17", "PHQ-9 rises to 21 at psychiatry follow-up", "am-1011", "c-1011", "Medical", "CF 0156", "cf-4", "PHQ-9 today 21. Pt tearful, missed two appointments due to fatigue.", "Proposed"),
  ch("ch-4", "2026-03-22", "Primary care records 14 of 18 tender points", "am-1011", "c-1011", "Medical", "CF 0287", "cf-4", "Widespread pain. Tender points positive 14/18. Continue current plan.", "Approved"),
  ch("ch-5", "2026-04-09", "Peer reviewer's call to Dr. Whitaker's office goes unanswered", "am-1011", "c-1011", "Claim", "CF 0897", "cf-5", "Peer reviewer left voicemail for Dr. Whitaker. No return call by 4/16. Review to proceed on records.", "Proposed"),
  ch("ch-6", "2026-05-02", "Surveillance: about 2 hours of activity seen over 3 days", "am-1011", "c-1011", "Claim", "CF 0024", "cf-3", "Claimant observed for approx. 2 hrs total across 3 days. Carried one grocery bag to vehicle.", "Approved"),
  ch("ch-7", "2026-05-28", "Psychiatric peer review finds no restrictions", "am-1011", "c-1011", "Claim", "CF 0011", "cf-2", "From a psychiatric standpoint, no restrictions or limitations are supported.", "Proposed"),
  ch("ch-8", "2026-06-08", "Lincoln terminates benefits", "am-1011", "c-1011", "Claim", "CF 0001", "cf-1", "We have determined you no longer meet the definition of disability under the policy.", "Approved"),
  ch("ch-9", "2026-06-14", "Dr. Whitaker: unable to sustain full-time work", "am-1011", "c-1011", "Medical", "CF 0429", "cf-4", "In my opinion she cannot sustain a full-time schedule of any kind at this time.", "Proposed"),
  ch("ch-10", "2026-02-05", "Dr. Mehta records BASDAI 6.8 and 2 hours of morning stiffness", "am-1061", "c-1061", "Medical", "CF 0214", "cf-9", "BASDAI 6.8. Morning stiffness ~2 hours. Continue adalimumab.", "Approved"),
  ch("ch-11", "2026-03-19", "IME reports full range of motion after a 20-minute exam", "am-1061", "c-1061", "Medical", "CF 0031", "cf-8", "Exam start 10:05, end 10:25. Lumbar range of motion within normal limits.", "Approved"),
  ch("ch-12", "2026-04-10", "Vocational report lists 3 sedentary jobs", "am-1061", "c-1061", "Claim", "CF 0012", "cf-7", "Claimant retains capacity for the following sedentary occupations: dispatcher, order clerk, receptionist.", "Approved"),
  ch("ch-13", "2026-04-22", "Prudential denies under any occupation", "am-1061", "c-1061", "Claim", "CF 0002", "cf-6", "Based on our review, you are able to perform the duties of other gainful occupations.", "Approved"),
];

/* ---------- evidence plan ---------- */

const ev = (id: string, item: string, matterId: string, client: string, rebuts: string, status: string, owner: string, target: string, physician: string | null = null): Rec => ({ id, item, matter: matterId, client, rebuts, status, owner, target, physician });

const EVIDENCE: Rec[] = [
  ev("ev-1", "Rheumatology records with tender-point exam", "am-1011", "c-1011", "No objective evidence", "Requested", "Sam Okafor", "2026-10-23"),
  ev("ev-2", "Functional capacity evaluation", "am-1011", "c-1011", "No objective evidence", "Planned", "Elena Ruiz", "2026-11-06"),
  ev("ev-3", "Narrative letter answering the peer review", "am-1011", "c-1011", "Psychiatric peer review", "Overdue", "Sam Okafor", "2026-10-09", "dr-05"),
  ev("ev-4", "Client declaration on good and bad days", "am-1011", "c-1011", "Surveillance", "Received", "Sam Okafor", "2026-10-02"),
  ev("ev-5", "Statement from her sister", "am-1011", "c-1011", "Surveillance", "Received", "Sam Okafor", "2026-10-05"),
  ev("ev-6", "Vocational expert rebuttal report", "am-1061", "c-1061", "Vocational report", "Received", "Elena Ruiz", "2026-09-30"),
  ev("ev-7", "Client declaration on sitting tolerance", "am-1061", "c-1061", "Vocational report", "Draft", "Maria Alvarez", "2026-10-14"),
  ev("ev-8", "Functional questionnaire from Dr. Mehta", "am-1061", "c-1061", "IME findings", "Received", "Maria Alvarez", "2026-09-25", "dr-04"),
  ev("ev-9", "Sacroiliac MRI report (2025)", "am-1061", "c-1061", "IME findings", "Received", "Maria Alvarez", "2026-09-18"),
  ev("ev-10", "Cardiology records since 2025", "am-1036", "c-1036", "Ejection fraction improved", "Planned", "Sam Okafor", "2026-11-02", "dr-06"),
  ev("ev-11", "Cardiopulmonary exercise test", "am-1036", "c-1036", "Ejection fraction improved", "Planned", "Daniel Brooks", "2026-12-01"),
  ev("ev-12", "Cardiology APS", "am-1036", "c-1036", "No treating physician statement", "Requested", "Sam Okafor", "2026-10-13", "dr-06"),
];

/* ---------- record sections ---------- */

const tone = (opts: { value: string; tone: "green" | "yellow" | "red" | "blue" | "gray" }[], v: unknown) => opts.find((o) => o.value === v)?.tone;

function Deadline({ rec }: { rec: Rec }) {
  if (!rec.deadline) return null;
  const left = daysBetween(TODAY, String(rec.deadline));
  const used = Math.min(100, Math.max(0, Math.round(((180 - left) / 180) * 100)));
  const confirmed = rec._prov?.deadline?.kind === "source";
  return (
    <Card title="Appeal deadline" icon={CalendarClock} info="ERISA gives 180 days from the denial letter to appeal. Alpha proposes the date; it counts only once an attorney confirms it.">
      <p><strong>{fmtDate(String(rec.deadline))}</strong> · {left} days left</p>
      <div className="bar" style={{ margin: "10px 0" }}><div className="bar__fill" style={{ width: `${used}%` }} /></div>
      <p className="meta">Denied {fmtDate(String(rec.denied))} · {180 - left} of 180 days used</p>
      <p style={{ marginTop: 10 }}>{confirmed ? <Pill tone="green">Confirmed by an attorney</Pill> : <Pill tone={left <= 14 ? "red" : "yellow"}>Waiting for an attorney to confirm</Pill>}</p>
    </Card>
  );
}

function Coverage({ rec }: { rec: Rec }) {
  const w = useWorld();
  const items = w.rows("appeals", "evidence").filter((e) => e.matter === rec.id);
  const reasons = (rec.reasons as string[] | undefined) ?? [];
  if (!OPEN(rec)) return null;
  return (
    <Card title="Denial reasons and evidence" icon={ListChecks} info="Each reason the insurer gave, and how much of the evidence planned to answer it has arrived. A reason with nothing planned needs an attorney.">
      <table className="mini">
        <thead><tr><th>Denial reason</th><th style={{ width: 180 }}>Evidence received</th><th>Items</th></tr></thead>
        <tbody>
          {reasons.map((reason) => {
            const mine = items.filter((e) => e.rebuts === reason);
            const got = mine.filter((e) => e.status === "Received").length;
            const late = mine.some((e) => e.status === "Overdue");
            return (
              <tr key={reason}>
                <td>{reason}</td>
                <td>
                  {mine.length ? (
                    <div className="bar" style={{ marginTop: 6 }}><div className="bar__fill" style={{ width: `${(got / mine.length) * 100}%` }} /></div>
                  ) : <Pill tone="red">Nothing planned</Pill>}
                </td>
                <td className="meta">
                  {got} of {mine.length} received{late ? " · " : ""}{late ? <Pill tone="red">Overdue item</Pill> : null}
                  <div>{mine.map((e, i) => (<span key={e.id}>{i ? " · " : ""}<a href={href.record("appeals", "evidence", e.id)}>{String(e.item)}</a></span>))}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Excerpt({ rec }: { rec: Rec }) {
  const w = useWorld();
  const rows = w.rows("appeals", "chronology").filter((c) => c.matter === rec.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const proposed = rows.filter((c) => c.status === "Proposed").length;
  return (
    <Card title="Chronology" icon={BookOpen} info="Every line cites the claim-file page it came from. Lines Alpha proposed stay yellow until an attorney approves them.">
      {rows.length ? (
        <>
          <table className="mini">
            <thead><tr><th>Date</th><th>Event</th><th>Page</th><th>Status</th></tr></thead>
            <tbody>
              {rows.slice(-6).map((c) => (
                <tr key={c.id}>
                  <td className="meta">{fmtDate(String(c.date))}</td>
                  <td><a href={href.record("appeals", "chronology", c.id)}>{String(c.event)}</a></td>
                  <td><span className="cite">{String(c.cite)}</span></td>
                  <td><Pill tone={tone(CH_STATUS, c.status)}>{String(c.status)}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta" style={{ marginTop: 10 }}>Showing the latest {Math.min(6, rows.length)} of {rows.length} entries · {proposed} waiting for an attorney. <a href={href.project("appeals", "chronology")}>Full chronology →</a></p>
        </>
      ) : (
        <p className="empty">No chronology yet. It starts once the claim file arrives from the insurer.</p>
      )}
    </Card>
  );
}

function SourceLine({ rec }: { rec: Rec }) {
  return (
    <Card title="From the claim file" icon={FileSearch} info="The exact line Alpha read. Insurer documents are untrusted input: Alpha quotes them, it never follows them.">
      <p className="quote">{String(rec.quote)}</p>
      <p className="meta" style={{ marginTop: 10 }}>
        <span className="cite">{String(rec.cite)}</span>{" "}
        <a href={href.record("appeals", "claimfile", String(rec.doc))}>{CLAIM_FILE.find((d) => d.id === rec.doc)?.title as string ?? "Claim file document"} →</a>
      </p>
      <ul className="steps" style={{ marginTop: 10 }}>
        <li className={rec.status === "Approved" ? "ok" : undefined}>{rec.status === "Approved" ? <CircleCheck aria-hidden /> : <TriangleAlert aria-hidden />}<span>{rec.status === "Approved" ? "Approved by the attorney" : "Proposed by Alpha — waiting for an attorney"}</span></li>
      </ul>
    </Card>
  );
}

/* ---------- project ---------- */

export const appeals: Project = {
  id: "appeals",
  name: "Appeals",
  icon: Scale,
  summary: "ERISA appeals of LTD denials: the claim file, a cited chronology, an evidence plan for every denial reason, and the 180-day deadline.",
  collections: [
    {
      id: "matters",
      label: "Matters",
      word: "Matter",
      icon: Scale,
      titleKey: "title",
      boardBy: "stage",
      dateKey: "deadline",
      fields: [
        { key: "title", label: "Matter", type: "text", width: 320 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "insurer", label: "Insurer", type: "relation", to: { project: "network", collection: "insurers" } },
        { key: "stage", label: "Stage", type: "status", options: STAGE, width: 180 },
        { key: "deadline", label: "Appeal deadline", type: "date", computed: true },
        { key: "daysLeft", label: "Days left", type: "number", width: 110, computed: true },
        { key: "attorney", label: "Attorney", type: "person" },
        { key: "record", label: "Claim file", type: "status", options: RECORD, width: 190 },
        { key: "denied", label: "Denial date", type: "date" },
        { key: "pages", label: "Pages", type: "number", width: 100, computed: true },
        { key: "claim", label: "Claim number", type: "text", hidden: true },
        { key: "reasons", label: "Denial reasons", type: "text", width: 320, hidden: true },
      ],
      records: MATTERS,
      lists: [
        { id: "open", name: "Open appeals", filter: OPEN, star: true },
        { id: "soon", name: "Deadline within 30 days", filter: (r) => OPEN(r) && Number(r.daysLeft) <= 30 },
      ],
      metrics: [
        { label: "Open appeals", icon: Scale, value: (r) => r.filter(OPEN).length, basis: (r) => `of ${r.length} matters`, filter: OPEN },
        {
          label: "Nearest deadline", icon: CalendarClock,
          value: (r) => { const o = r.filter((x) => OPEN(x) && x.daysLeft !== null); return o.length ? `${Math.min(...o.map((x) => Number(x.daysLeft)))} days` : null; },
          basis: (r) => { const n = r.filter((x) => OPEN(x) && x.daysLeft !== null).sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft))[0]; return n ? `${String(n.title).split(" — ")[0]}, ${fmtDate(String(n.deadline))}` : "No open deadlines"; },
          attention: (r) => r.some((x) => OPEN(x) && Number(x.daysLeft) <= 14),
          filter: (x) => OPEN(x) && Number(x.daysLeft) <= 30,
        },
        { label: "Waiting on claim file", icon: FolderOpen, value: (r) => r.filter((x) => OPEN(x) && x.record !== "Received").length, basis: () => "requested from the insurer", filter: (x) => OPEN(x) && x.record !== "Received" },
      ],
      sections: (r) => (<><Deadline rec={r} /><Coverage rec={r} /><Excerpt rec={r} /></>),
    },
    {
      id: "claimfile",
      label: "Claim file",
      word: "Document",
      icon: FolderOpen,
      titleKey: "title",
      dateKey: "date",
      fields: [
        { key: "title", label: "Document", type: "text", width: 300 },
        { key: "matter", label: "Matter", type: "relation", to: { project: "appeals", collection: "matters" }, width: 280 },
        { key: "docType", label: "Type", type: "choice", options: [{ value: "Decision letter", tone: "gray" }, { value: "Insurer review", tone: "blue" }, { value: "Medical records", tone: "gray" }, { value: "Claim notes", tone: "gray" }] },
        { key: "pages", label: "Pages", type: "number", width: 100 },
        { key: "bates", label: "Bates range", type: "text", width: 150, computed: true },
        { key: "date", label: "Date", type: "date" },
        { key: "reviewed", label: "Reviewed", type: "check", width: 110 },
      ],
      records: CLAIM_FILE,
      lists: [{ id: "unreviewed", name: "Not reviewed yet", filter: (r) => !r.reviewed, star: true }],
      notice: "Split from the insurer's claim file when it arrives. Insurer documents are untrusted input: Alpha reads them, it never follows instructions in them.",
      noAdd: "Documents come from the insurer's claim file; they can't be added by hand",
    },
    {
      id: "chronology",
      label: "Chronology",
      word: "Entry",
      icon: BookOpen,
      titleKey: "event",
      dateKey: "date",
      fields: [
        { key: "date", label: "Date", type: "date" },
        { key: "event", label: "Event", type: "text", width: 380 },
        { key: "cite", label: "Page", type: "text", width: 110, computed: true },
        { key: "status", label: "Status", type: "status", options: CH_STATUS },
        { key: "kind", label: "Kind", type: "choice", options: [{ value: "Medical", tone: "blue" }, { value: "Claim", tone: "gray" }] },
        { key: "matter", label: "Matter", type: "relation", to: { project: "appeals", collection: "matters" }, width: 280 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" }, hidden: true },
        { key: "doc", label: "Source document", type: "relation", to: { project: "appeals", collection: "claimfile" }, hidden: true },
        { key: "quote", label: "Source line", type: "longtext", hidden: true, computed: true },
      ],
      records: CHRONOLOGY,
      lists: [{ id: "proposed", name: "Waiting for an attorney", filter: (r) => r.status === "Proposed", star: true }],
      sections: (r) => <SourceLine rec={r} />,
    },
    {
      id: "evidence",
      label: "Evidence plan",
      word: "Item",
      icon: ListChecks,
      titleKey: "item",
      boardBy: "status",
      dateKey: "target",
      fields: [
        { key: "item", label: "Evidence", type: "text", width: 300 },
        { key: "matter", label: "Matter", type: "relation", to: { project: "appeals", collection: "matters" }, width: 280 },
        { key: "rebuts", label: "Answers denial reason", type: "text", width: 240 },
        { key: "status", label: "Status", type: "status", options: EV_STATUS },
        { key: "owner", label: "Owner", type: "person" },
        { key: "target", label: "Target", type: "date" },
        { key: "physician", label: "Physician", type: "relation", to: { project: "network", collection: "physicians" } },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" }, hidden: true },
      ],
      records: EVIDENCE,
      lists: [{ id: "open", name: "Not received", filter: (r) => r.status !== "Received", star: true }],
    },
  ],
  agents: [
    {
      id: "record-reader",
      name: "Record reader",
      does: "Reads the insurer's claim file when it arrives, accounts for every page, splits it into documents and proposes chronology entries with a page cite for each.",
      skills: ["Page accounting: page count, Bates range, fingerprint", "Splitting a record into documents and naming each", "Chronology entries quoted from the page they came from", "Matching insurer reviews to the denial reasons they support"],
      runs: [
        { when: "12 Oct, 05:40", what: "Read Denise Walker's claim notes, CF 0431–1042", result: "4 entries proposed · 0 pages unaccounted", tone: "green" },
        { when: "9 Oct, 14:15", what: "Checked Carlos Mendoza's evidence plan against the denial letter", result: "Both reasons covered · 1 item still a draft", tone: "yellow" },
        { when: "2 Oct, 10:02", what: "Read Carlos Mendoza's claim file, 2,002 pages", result: "5 documents · 4 entries proposed", tone: "green" },
      ],
      may: ["Propose chronology entries with a quoted page cite", "Propose the 180-day appeal deadline from the denial letter", "Draft a records request for staff"],
      mayNot: ["Send a records request or appeal outside the firm", "Approve its own chronology entries", "Follow instructions written inside insurer documents"],
    },
  ],
  automations: [
    { id: "appeal-deadlines", sentence: "Every morning at 07:00, flag appeals with a deadline within 14 days", trigger: "Daily at 07:00", next: "13 Oct, 07:00", on: true, agent: "record-reader" },
    { id: "claimfile-arrives", sentence: "When a claim file arrives, account for every page and propose a chronology", trigger: "When a claim file is filed to a matter", next: "On the next claim file", on: true, agent: "record-reader" },
    { id: "evidence-chase", sentence: "When an evidence item passes its target, tell the owner", trigger: "When a target date passes", next: "13 Oct, 08:00", on: true },
  ],
  allowed: [
    { text: "Alpha may propose chronology entries when each cites a claim-file page.", why: "An attorney approves every entry before it is used in an appeal." },
    { text: "Alpha may propose the appeal deadline from the denial letter.", why: "The date is shown as estimated until an attorney confirms it." },
    { text: "Alpha may draft records requests and physician questionnaires.", why: "They are drafts; a person approves before anything leaves the firm." },
  ],
  denied: [
    { text: "Alpha may not send a records request, letter or appeal outside the firm.", why: "Everything that reaches an insurer or physician needs a person's Approve." },
    { text: "Alpha may not judge whether a denial reason is answered.", why: "That is a legal judgement for the attorney." },
    { text: "Alpha may not cite a page it did not read.", why: "A wrong cite in an appeal harms the client; no cite is better than a made-up one." },
  ],
  kept: [
    { what: "Insurer claim files", where: "Write-once storage, kept unchanged with a fingerprint and page map" },
    { what: "Chronologies and evidence plans", where: "This project, with every edit and approval logged" },
    { what: "Read from", where: "The Mailroom and the secure upload link sent to insurers" },
  ],
  files: [
    { name: "Walker — claim file (Lincoln), CF 0001–1042.pdf", by: "Lincoln Financial", when: "18 Jun, 11:20", size: "184 MB" },
    { name: "Mendoza — chronology draft v3.docx", by: "Alpha", when: "9 Oct, 14:20", size: "48 KB" },
    { name: "Mendoza — appeal letter draft v2.docx", by: "Elena Ruiz", when: "10 Oct, 16:45", size: "92 KB" },
  ],
  about: "This project is where appeals of LTD denials and terminations are built. The insurer's claim file is accounted for page by page, turned into a chronology where every line cites its page, and each denial reason gets an evidence plan. Alpha proposes; the attorney approves every entry, deadline and outgoing request.",
};

export const appealsExtras: Extras = {
  proposals: [
    {
      id: "pr-appeals-chron-1011",
      project: "appeals",
      task: "Approve 4 chronology entries for Denise Walker",
      outcome: "The entries join Denise Walker's chronology, including the unanswered call to Dr. Whitaker (CF 0897) and her 14 Jun 2026 letter (CF 0429).",
      judged: "Each entry quotes the claim-file page it came from; you can open the line on each entry.",
      reaches: "Stays in the firm; reaches nobody.",
      undo: "Any entry can be set back to proposed from its page.",
      roles: ["attorney"],
      recordLink: href.record("appeals", "matters", "am-1011"),
      state: "open",
    },
    {
      id: "pr-appeals-rr-1036",
      project: "appeals",
      task: "Send a records request to Dr. Peter Lindqvist for Jerome Washington",
      outcome: "Heartland Cardiology Group is asked for cardiology records and echo reports since 1 Jan 2025, to answer the ejection-fraction reason.",
      judged: "Jerome Washington's signed authorization is on file (signed 27 Aug 2026).",
      payload: "To: records@heartlandcardio.example (verified)\nSubject: Records request — Jerome Washington, DOB on authorization\nAttached: Records request letter.pdf, Signed authorization.pdf",
      reaches: "Reaches someone: it asks every time.",
      undo: "Cannot be unsent.",
      roles: ["attorney"],
      recordLink: href.record("appeals", "evidence", "ev-10"),
      state: "open",
    },
    {
      id: "pr-appeals-dl-1061",
      project: "appeals",
      task: "Confirm the appeal deadline for Carlos Mendoza: 19 Oct 2026",
      outcome: "The deadline counts as confirmed and drives reminders for Elena Ruiz and Maria Alvarez.",
      judged: "180 days from Prudential's denial letter dated 22 Apr 2026 (CF 0001).",
      reaches: "Stays in the firm; reaches nobody.",
      undo: "The date can be changed from the matter page.",
      roles: ["attorney"],
      recordLink: href.record("appeals", "matters", "am-1061"),
      state: "open",
    },
  ],
  due: [
    { id: "d-appeals-ev3", title: "Dr. Whitaker's letter answering the peer review — Denise Walker", when: "9 Oct 2026", bucket: "overdue", link: href.record("appeals", "evidence", "ev-3"), roles: ["assistant", "attorney"] },
    { id: "d-appeals-1061", title: "Appeal due to Prudential — Carlos Mendoza", when: "19 Oct 2026", bucket: "upcoming", link: href.record("appeals", "matters", "am-1061"), roles: ["attorney", "assistant"] },
  ],
  activity: [
    { id: "a-ap1", when: "12 Oct, 05:40", who: "Alpha", what: "Proposed 4 chronology entries for Denise Walker", link: href.record("appeals", "matters", "am-1011") },
    { id: "a-ap2", when: "12 Oct, 07:00", who: "Alpha", what: "Flagged Carlos Mendoza's appeal — deadline 19 Oct", link: href.record("appeals", "matters", "am-1061") },
    { id: "a-ap3", when: "10 Oct, 16:45", who: "Elena Ruiz", what: "Saved appeal letter draft v2 for Carlos Mendoza", link: href.record("appeals", "matters", "am-1061") },
  ],
  conversation: [
    { who: "you", text: "Where are we on Denise Walker's appeal?" },
    { who: "alpha", text: "Deadline is 5 Dec 2026, 54 days out. Of her three denial reasons, surveillance is answered; Dr. Whitaker's letter for the peer review is overdue since 9 Oct. I read her claim notes overnight and found 4 new entries, including the reviewer's unanswered call to Dr. Whitaker (CF 0897).", source: "Read matter am-1011 · claim notes CF 0431–1042 · Record reader" },
    { who: "alpha", proposal: "pr-appeals-chron-1011" },
  ],
};
