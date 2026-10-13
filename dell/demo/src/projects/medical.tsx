import { CalendarClock, CircleCheck, Clock, HeartPulse, Stethoscope, TriangleAlert } from "lucide-react";
import { Card, Pill } from "../kit";
import { daysBetween, fmtDate } from "../data/format";
import { href } from "../data/route";
import { useWorld } from "../data/store";
import { TODAY } from "../data/format";
import type { Project, Rec } from "../data/types";
import type { Extras } from "./extras";

/* Medical monitoring: every ongoing-benefits client needs a medical update every 120 days.
   Sample data — invented. Last-update dates match Network · Clients (lastUpdate). */

const LIMIT = 120;

const CHECK_STATUS = [
  { value: "On track", tone: "green" as const },
  { value: "Due soon", tone: "yellow" as const },
  { value: "Overdue", tone: "red" as const },
];

const REC_STATUS = [
  { value: "Not requested", tone: "gray" as const },
  { value: "Requested", tone: "blue" as const },
  { value: "No reply", tone: "red" as const },
  { value: "Received", tone: "green" as const, done: true },
];

const plusDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** Status follows the 120-day rule: overdue past 120 days, due soon within 45 days of it. */
const ck = (client: string, name: string, last: string, physician: string, owner: string): Rec => {
  const days = daysBetween(last, TODAY);
  const status = days > LIMIT ? "Overdue" : days >= LIMIT - 45 ? "Due soon" : "On track";
  return { id: `ck-${client.slice(2)}`, title: `${name} — 120-day check`, client, last, next: plusDays(last, LIMIT), days, status, physician, owner };
};

const CHECKINS: Rec[] = [
  ck("c-1042", "Angela Morrison", "2026-10-03", "dr-01", "Maria Alvarez"),
  ck("c-1003", "Gregory Patel", "2026-07-21", "dr-02", "Maria Alvarez"),
  ck("c-1017", "Marcus Hill", "2026-06-30", "dr-01", "Maria Alvarez"),
  ck("c-1020", "Linda Chen", "2026-09-12", "dr-04", "Sam Okafor"),
  ck("c-1031", "Tanya Brooks", "2026-05-02", "dr-04", "Maria Alvarez"),
  ck("c-1039", "Sofia Ramirez", "2026-08-28", "dr-07", "Maria Alvarez"),
  ck("c-1044", "Kevin O'Brien", "2026-04-18", "dr-05", "Sam Okafor"),
  ck("c-1050", "Howard Kim", "2026-09-22", "dr-08", "Maria Alvarez"),
  ck("c-1052", "Brenda Foster", "2026-07-08", "dr-10", "Sam Okafor"),
  ck("c-1058", "Michelle Davis", "2026-09-30", "dr-08", "Sam Okafor"),
];

const pv = (id: string, title: string, client: string, physician: string, specialty: string, lastVisit: string, through: string, request: string, extra: Partial<Rec> = {}): Rec => ({ id, title, client, physician, specialty, lastVisit, through, request, ...extra });

const PROVIDERS: Rec[] = [
  pv("pv-01", "Angela Morrison · Dr. Helen Ortiz", "c-1042", "dr-01", "Neurology", "2026-10-03", "2026-10-03", "Received"),
  pv("pv-02", "Angela Morrison · Dr. Samuel Reyes", "c-1042", "dr-02", "Pain management", "2026-08-12", "2026-06-03", "Requested", { requested: "2026-10-05" }),
  pv("pv-03", "Angela Morrison · Dr. Karen Holt", "c-1042", "dr-03", "Primary care", "2026-07-15", "2026-07-15", "Received"),
  pv("pv-04", "Gregory Patel · Dr. Samuel Reyes", "c-1003", "dr-02", "Pain management", "2026-07-21", "2026-04-30", "Requested", { requested: "2026-10-07", _prov: { through: { kind: "source", note: "Last page of the records on file is dated 30 Apr 2026; MetLife asked for records since 1 May 2026" } } }),
  pv("pv-05", "Marcus Hill · Dr. Helen Ortiz", "c-1017", "dr-01", "Neurology", "2026-06-30", "2026-06-30", "Received"),
  pv("pv-06", "Linda Chen · Dr. Anil Mehta", "c-1020", "dr-04", "Rheumatology", "2026-09-12", "2026-09-12", "Received"),
  pv("pv-07", "Tanya Brooks · Dr. Anil Mehta", "c-1031", "dr-04", "Rheumatology", "2026-05-02", "2026-05-02", "Not requested", { _prov: { lastVisit: { kind: "assumed", note: "No newer visit is on file; the client may have been seen since. Ask her first." } } }),
  pv("pv-08", "Tanya Brooks · Dr. Karen Holt", "c-1031", "dr-03", "Primary care", "2026-03-11", "2026-03-11", "Not requested"),
  pv("pv-09", "Sofia Ramirez · Dr. Grace Adeyemi", "c-1039", "dr-07", "Gastroenterology", "2026-08-28", "2026-08-28", "Received"),
  pv("pv-10", "Kevin O'Brien · Dr. Joan Whitaker", "c-1044", "dr-05", "Psychiatry", "2026-04-18", "2026-04-18", "No reply", { requested: "2026-09-01" }),
  pv("pv-11", "Howard Kim · Dr. Thomas Bauer", "c-1050", "dr-08", "Neurology", "2026-09-22", "2026-08-04", "Requested", { requested: "2026-10-08" }),
  pv("pv-12", "Brenda Foster · Dr. Luis Carrillo", "c-1052", "dr-10", "Pulmonology", "2026-07-08", "2026-07-08", "Received"),
  pv("pv-13", "Michelle Davis · Dr. Thomas Bauer", "c-1058", "dr-08", "Neurology", "2026-09-30", "2026-09-30", "Received"),
];

/** Recent visits per client, newest first: [date, who, what]. */
const VISITS: Record<string, [string, string, string][]> = {
  "c-1042": [["2026-10-03", "Dr. Helen Ortiz", "Neurology follow-up"], ["2026-08-18", "Imaging center", "MRI brain and cervical spine"], ["2026-08-12", "Dr. Samuel Reyes", "Pain management"], ["2026-07-15", "Dr. Karen Holt", "Primary care"], ["2026-07-02", "Dr. Helen Ortiz", "Neurology follow-up"]],
  "c-1003": [["2026-07-21", "Dr. Samuel Reyes", "Epidural injection"], ["2026-05-19", "Dr. Samuel Reyes", "Pain management follow-up"], ["2026-03-24", "Dr. Samuel Reyes", "Pain management follow-up"]],
  "c-1017": [["2026-06-30", "Dr. Helen Ortiz", "Neurology follow-up"], ["2026-03-31", "Dr. Helen Ortiz", "Neurology follow-up"], ["2026-01-06", "Dr. Helen Ortiz", "Neurology follow-up"]],
  "c-1020": [["2026-09-12", "Dr. Anil Mehta", "Rheumatology follow-up"], ["2026-06-10", "Dr. Anil Mehta", "Infusion review"]],
  "c-1031": [["2026-05-02", "Dr. Anil Mehta", "Rheumatology follow-up"], ["2026-03-11", "Dr. Karen Holt", "Primary care"], ["2026-01-28", "Dr. Anil Mehta", "Rheumatology follow-up"]],
  "c-1039": [["2026-08-28", "Dr. Grace Adeyemi", "Colonoscopy"], ["2026-06-02", "Dr. Grace Adeyemi", "Gastroenterology follow-up"]],
  "c-1044": [["2026-04-18", "Dr. Joan Whitaker", "Medication review"], ["2026-02-23", "Dr. Joan Whitaker", "Psychiatry follow-up"], ["2026-01-12", "Dr. Joan Whitaker", "Psychiatry follow-up"]],
  "c-1050": [["2026-09-22", "Dr. Thomas Bauer", "Neurology follow-up"], ["2026-08-04", "Dr. Thomas Bauer", "Neurology follow-up"], ["2026-05-26", "Dr. Thomas Bauer", "Neurology follow-up"]],
  "c-1052": [["2026-07-08", "Dr. Luis Carrillo", "Tilt-table test"], ["2026-04-14", "Dr. Luis Carrillo", "Pulmonology follow-up"]],
  "c-1058": [["2026-09-30", "Dr. Thomas Bauer", "EEG and neurology follow-up"], ["2026-07-01", "Dr. Thomas Bauer", "Neurology follow-up"]],
};

function Visits({ rec }: { rec: Rec }) {
  const visits = VISITS[String(rec.client)] ?? [];
  return (
    <Card title="Recent visits" icon={Stethoscope} info="Visits the firm has records or a confirmed appointment for. A visit with no records on file still shows, so staff know what to request.">
      {visits.length ? (
        <ul className="steps">
          {visits.map(([d, who, what]) => (
            <li key={d + who} className="ok"><CircleCheck aria-hidden /><span><strong>{fmtDate(d)}</strong> — {who}, {what}</span></li>
          ))}
        </ul>
      ) : (
        <p className="empty">No visits on file yet.</p>
      )}
    </Card>
  );
}

function InsurerView({ rec }: { rec: Rec }) {
  const visits = VISITS[String(rec.client)] ?? [];
  const days = Number(rec.days);
  const gaps = visits.slice(1).map((v, i) => ({ from: v[0], to: visits[i][0], days: daysBetween(v[0], visits[i][0]) }));
  const widest = gaps.reduce<(typeof gaps)[number] | null>((a, g) => (!a || g.days > a.days ? g : a), null);
  const over = days > LIMIT;
  return (
    <Card title="What the insurer will see" icon={over ? TriangleAlert : CalendarClock} info="Insurers read a long stretch with no treatment as a sign the condition has improved. This counts from the last visit with records on file, against the 120-day rule.">
      <div className="bar" aria-label={`${days} of ${LIMIT} days`}><div className="bar__fill" style={{ width: `${Math.min(100, (days / LIMIT) * 100)}%`, background: over ? "var(--bad)" : undefined }} /></div>
      <p style={{ marginTop: 10 }}>
        {over
          ? <>No treatment on file since {fmtDate(String(rec.last))} — <strong>{days} days</strong>. That gap is {days - LIMIT} days past the 120-day rule.</>
          : <>Last treatment on file {fmtDate(String(rec.last))}, {days} days ago. The next update is due by {fmtDate(String(rec.next))}.</>}
      </p>
      {widest ? <p className="meta" style={{ marginTop: 6 }}>Longest gap between recent visits: {widest.days} days ({fmtDate(widest.from)} to {fmtDate(widest.to)}).</p> : null}
    </Card>
  );
}

function ClientProviders({ rec }: { rec: Rec }) {
  const w = useWorld();
  const rows = w.rows("medical", "providers").filter((p) => p.client === rec.client);
  if (!rows.length) return null;
  return (
    <Card title="Treating providers" info="Records on file through a date means the newest page the firm holds from that provider.">
      <table className="mini">
        <thead><tr><th>Provider</th><th>Last visit</th><th>Records through</th><th>Request</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><a href={href.record("medical", "providers", p.id)}>{String(p.title).split(" · ")[1] ?? String(p.title)}</a> <span className="meta">{String(p.specialty)}</span></td>
              <td className="meta">{fmtDate(String(p.lastVisit))}</td>
              <td className="meta">{fmtDate(String(p.through))}</td>
              <td><Pill tone={REC_STATUS.find((s) => s.value === p.request)?.tone}>{String(p.request)}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export const medical: Project = {
  id: "medical",
  name: "Medical monitoring",
  icon: HeartPulse,
  summary: "A medical update for every ongoing-benefits client at least every 120 days.",
  parent: "benefits",
  collections: [
    {
      id: "checkins",
      label: "Check-ins",
      word: "Check-in",
      icon: CalendarClock,
      titleKey: "title",
      boardBy: "status",
      dateKey: "next",
      fields: [
        { key: "title", label: "Check-in", type: "text", width: 280 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "status", label: "Status", type: "status", options: CHECK_STATUS },
        { key: "days", label: "Days since update", type: "number", width: 170, computed: true },
        { key: "last", label: "Last visit", type: "date" },
        { key: "next", label: "Next due", type: "date", computed: true },
        { key: "physician", label: "Last physician", type: "relation", to: { project: "network", collection: "physicians" } },
        { key: "owner", label: "Owner", type: "person" },
      ],
      records: CHECKINS,
      lists: [
        { id: "stale", name: "No update in 120 days", filter: (r) => Number(r.days) > LIMIT, star: true },
        { id: "soon", name: "Due in the next 45 days", filter: (r) => r.status === "Due soon" },
      ],
      metrics: [
        { label: "Overdue", icon: TriangleAlert, value: (r) => r.filter((x) => x.status === "Overdue").length, basis: () => "no update in 120 days", attention: (r) => r.some((x) => x.status === "Overdue"), filter: (x) => x.status === "Overdue" },
        { label: "Due soon", icon: Clock, value: (r) => r.filter((x) => x.status === "Due soon").length, basis: () => "due within 45 days", filter: (x) => x.status === "Due soon" },
        { label: "Average days since update", icon: CalendarClock, value: (r) => (r.length ? Math.round(r.reduce((a, x) => a + Number(x.days), 0) / r.length) : null), basis: (r) => `across ${r.length} ongoing-benefits clients` },
      ],
      notice: "One check-in per ongoing-benefits client. Days since update counts from the last visit with records on file.",
      noAdd: "A check-in is created for each client who moves to ongoing benefits",
      sections: (r) => (<><InsurerView rec={r} /><Visits rec={r} /><ClientProviders rec={r} /></>),
    },
    {
      id: "providers",
      label: "Providers",
      word: "Provider",
      icon: Stethoscope,
      titleKey: "title",
      boardBy: "request",
      dateKey: "lastVisit",
      fields: [
        { key: "title", label: "Client and provider", type: "text", width: 300 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "physician", label: "Physician", type: "relation", to: { project: "network", collection: "physicians" } },
        { key: "specialty", label: "Specialty", type: "text" },
        { key: "lastVisit", label: "Last visit", type: "date" },
        { key: "through", label: "Records on file through", type: "date", width: 210 },
        { key: "request", label: "Records request", type: "status", options: REC_STATUS, width: 180 },
        { key: "requested", label: "Requested on", type: "date", hidden: true },
      ],
      records: PROVIDERS,
      lists: [{ id: "behind", name: "Records behind the last visit", filter: (r) => String(r.through) < String(r.lastVisit), star: true }],
    },
  ],
  agents: [
    {
      id: "monitor",
      name: "Medical monitor",
      does: "Counts days since each ongoing-benefits client's last treatment, spots gaps the insurer will notice and drafts records requests and client check-ins for staff.",
      skills: ["Reads visit dates from records on file", "Compares records on file with the last known visit", "Drafts provider records requests and portal check-ins"],
      runs: [
        { when: "12 Oct, 07:00", what: "Checked 10 ongoing-benefits clients", result: "2 overdue · 3 due soon", tone: "red" },
        { when: "11 Oct, 07:00", what: "Checked 10 ongoing-benefits clients", result: "2 overdue · 3 due soon", tone: "red" },
        { when: "8 Oct, 14:20", what: "Read neurology records for Angela Morrison", result: "Last update moved to 3 Oct 2026", tone: "green" },
      ],
      may: ["Update days since update from records on file", "Draft a records request or a client check-in"],
      mayNot: ["Send a records request or a message to a client", "Contact a physician's office", "Judge whether a client is still disabled"],
    },
  ],
  automations: [
    { id: "daily-120", sentence: "Every morning at 07:00, recount days since update and flag anyone past 120 days", trigger: "Daily at 07:00", next: "13 Oct, 07:00", on: true, agent: "monitor" },
    { id: "records-chase", sentence: "When a records request has had no reply for 21 days, draft a follow-up for staff", trigger: "When a request is 21 days old", next: "15 Oct, 09:00", on: true, agent: "monitor" },
  ],
  allowed: [
    { text: "Alpha may recount days since update every morning.", why: "It only reads visit dates already on file." },
    { text: "Alpha may draft a records request to a treating provider.", why: "Staff approve each request before it leaves the firm." },
    { text: "Alpha may draft a portal check-in asking a client about recent visits.", why: "A legal assistant reads it before the client sees it." },
  ],
  denied: [
    { text: "Alpha may not send a records request or contact a physician's office.", why: "Anything that leaves the firm needs a person's Approve." },
    { text: "Alpha may not tell a client to see a doctor or change treatment.", why: "That is medical advice; the firm only asks whether visits happened." },
    { text: "Alpha may not treat a gap in records as proof the client has improved.", why: "A gap often means records are missing, not that care stopped. A person decides." },
  ],
  kept: [
    { what: "Medical records", where: "The case file, kept unchanged with a fingerprint" },
    { what: "Visit dates", where: "Read from records on file and client check-ins" },
  ],
  files: [
    { name: "120-day report — 12 Oct 2026.pdf", by: "Alpha", when: "12 Oct, 07:05", size: "64 KB" },
    { name: "Records request — Dr. Joan Whitaker (Kevin O'Brien).docx", by: "Sam Okafor", when: "1 Sep 2026", size: "22 KB" },
  ],
  about: "Medical monitoring keeps every ongoing-benefits client inside the 120-day rule. It shows how long since each client's last treatment, which providers' records are behind, and the gap an insurer would see if nothing changes.",
};

export const medicalExtras: Extras = {
  proposals: [
    {
      id: "pr-medical-1044",
      project: "medical",
      task: "Follow up with Dr. Joan Whitaker for Kevin O'Brien's records",
      outcome: "A second records request goes to Lakeside Behavioral Health for visits since 18 Apr 2026.",
      judged: "The first request, sent 1 Sep 2026, has had no reply in 41 days. Kevin O'Brien is 177 days past his last update.",
      payload: "To: records@lakesidebh.example\nSubject: Second request — records for Kevin O'Brien since 18 Apr 2026\nAttached: Signed authorization (MetLife 2025).pdf",
      reaches: "Reaches someone: it asks every time.",
      undo: "Cannot be unsent.",
      roles: ["assistant"],
      recordLink: href.record("medical", "providers", "pv-10"),
      state: "open",
    },
    {
      id: "pr-medical-1031",
      project: "medical",
      task: "Ask Tanya Brooks in the portal about visits since 2 May 2026",
      outcome: "Tanya Brooks gets one portal question: any doctor visits since 2 May, and with whom.",
      judged: "No records since 2 May 2026 — 163 days. She may have been seen and the firm doesn't have it yet.",
      reaches: "Reaches the client through the portal.",
      undo: "Can be withdrawn before she opens it.",
      roles: ["assistant"],
      recordLink: href.record("medical", "checkins", "ck-1031"),
      state: "open",
    },
  ],
  due: [
    { id: "d-med-1044", title: "Medical update overdue — Kevin O'Brien", when: "16 Aug 2026", bucket: "overdue", link: href.record("medical", "checkins", "ck-1044"), roles: ["assistant", "attorney"] },
    { id: "d-med-1031", title: "Medical update overdue — Tanya Brooks", when: "30 Aug 2026", bucket: "overdue", link: href.record("medical", "checkins", "ck-1031"), roles: ["assistant", "attorney"] },
    { id: "d-med-1017", title: "Medical update due — Marcus Hill", when: "28 Oct 2026", bucket: "upcoming", link: href.record("medical", "checkins", "ck-1017"), roles: ["assistant"] },
  ],
  activity: [
    { id: "a-m1", when: "12 Oct, 07:00", who: "Alpha", what: "Recounted 10 check-ins — 2 overdue, 3 due soon", link: href.project("medical", "checkins") },
    { id: "a-m2", when: "12 Oct, 07:02", who: "Alpha", what: "Drafted a follow-up records request to Dr. Joan Whitaker", link: href.record("medical", "providers", "pv-10") },
    { id: "a-m3", when: "8 Oct, 14:20", who: "Alpha", what: "Moved Angela Morrison's last update to 3 Oct 2026 from new neurology records", link: href.record("medical", "checkins", "ck-1042") },
  ],
  conversation: [
    { who: "alpha", text: "Two clients are past the 120-day rule: Kevin O'Brien (177 days) and Tanya Brooks (163 days). Gregory Patel, Marcus Hill and Brenda Foster are due within 45 days.", source: "Read Medical monitoring · Check-ins" },
    { who: "alpha", text: "Kevin O'Brien's psychiatrist hasn't answered the 1 Sep records request. I drafted a second one.", source: "Read Providers · pv-10" },
    { who: "alpha", proposal: "pr-medical-1044" },
  ],
};
