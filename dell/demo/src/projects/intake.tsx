import { CalendarDays, CircleCheck, Copy, FileSignature, Mail, PenLine, Send, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";
import { Button, Card, Pill } from "../kit";
import { daysBetween, fmtDate } from "../data/format";
import { href } from "../data/route";
import { useWorld } from "../data/store";
import type { Project, Rec } from "../data/types";
import type { Extras } from "./extras";

/* Intake: a new lead to a signed client. Sample data — invented. The rules that matter: every
   lead has a next step with a date (or a hold reason), a possible duplicate is never merged
   without a person's Approve, and an ERISA deadline estimate is shown as an estimate. */

const TODAY = "2026-10-12";

const STAGE = [
  { value: "New lead", tone: "blue" as const },
  { value: "Contacted", tone: "blue" as const },
  { value: "Waiting on lead", tone: "yellow" as const },
  { value: "Screening", tone: "yellow" as const },
  { value: "Records requested", tone: "blue" as const },
  { value: "Conflict check", tone: "yellow" as const },
  { value: "Consult booked", tone: "blue" as const },
  { value: "Consult held", tone: "blue" as const },
  { value: "Agreement sent", tone: "yellow" as const },
  { value: "Signed", tone: "green" as const, done: true },
  { value: "Not a fit", tone: "gray" as const, done: true },
  { value: "Referred out", tone: "gray" as const, done: true },
];
const CLOSED = ["Signed", "Not a fit", "Referred out"];

const OUTCOME = [
  { value: "Scheduled", tone: "blue" as const },
  { value: "Take the case", tone: "green" as const, done: true },
  { value: "Decline", tone: "gray" as const, done: true },
  { value: "No-show — rebook", tone: "yellow" as const },
];

const SIGN = [
  { value: "Sent", tone: "blue" as const },
  { value: "Viewed", tone: "yellow" as const },
  { value: "Signed", tone: "green" as const, done: true },
  { value: "Expired", tone: "red" as const },
];

const POLICY = [
  { value: "Group LTD (ERISA)", tone: "blue" as const },
  { value: "Individual policy", tone: "gray" as const },
  { value: "Unknown", tone: "gray" as const },
];

/** ERISA appeal window: 180 days from the denial letter. */
const plus180 = (iso: string) => new Date(Date.parse(iso) + 180 * 864e5).toISOString().slice(0, 10);

const lead = (id: string, name: string, stage: string, source: string, brand: string, insurer: string | null, policy: string, denial: string, received: string, next: string, nextDue: string, extra: Partial<Rec> = {}): Rec => {
  const erisa = policy === "Group LTD (ERISA)" && denial ? plus180(denial) : "";
  return {
    id, name, stage, source, brand, insurer, policy, denial, erisa, received, next, nextDue, owner: "Priya Shah", ...extra,
    _prov: {
      ...(erisa ? { erisa: { kind: "estimated" as const, note: `180 days from the denial date the lead gave (${fmtDate(denial)}). Not yet checked against the denial letter; an attorney confirms.` } } : {}),
      ...((extra._prov as Rec["_prov"]) ?? {}),
    },
  };
};

const LEADS: Rec[] = [
  lead("l-2214", "Pat Young", "New lead", "Web", "Brand B", "ins-aetna", "Group LTD (ERISA)", "", "2026-10-12T05:52", "Hold — possible duplicate of a client", "2026-10-12", {
    phone: "(314) 555-0147", email: "patyoung.home@example.com",
    story: "Asked about her Aetna claim. Says she is in cancer treatment and her claim is still open.",
    dupOf: "c-1047", dupConfidence: 94, dupOn: "Phone exact · Pat is a short form of Patricia · same insurer (Aetna) · email differs",
    _prov: { dupOf: { kind: "estimated", note: "94% match on phone and name across both brands; a person decides" } },
  }),
  lead("l-2213", "Amy Lindqvist", "New lead", "Web", "Brand A", "ins-guardian", "Unknown", "", "2026-10-12T06:40", "First call", "2026-10-12", { phone: "(636) 555-0182", email: "amy.lindqvist@example.com", story: "Long-term disability claim filed in September; no decision yet." }),
  lead("l-2212", "Brian Hollis", "Contacted", "Phone", "Brand B", "ins-sunlife", "Group LTD (ERISA)", "2026-09-18", "2026-10-09T14:10", "Collect denial letter", "2026-10-14", { phone: "(618) 555-0133", email: "bhollis@example.com", story: "Back injury; benefits stopped after 24 months under the any-occupation change." }),
  lead("l-2211", "Nadia Farouk", "Records requested", "Web", "Brand A", "ins-reliance", "Group LTD (ERISA)", "2026-04-20", "2026-10-05T11:25", "Consult with Elena Ruiz", "2026-10-15", { phone: "(314) 555-0164", email: "nfarouk@example.com", story: "Lupus; denied in April. Came to us late — the appeal window is nearly closed." }),
  lead("l-2210", "Daniel Fischer", "Screening", "Phone", "Brand A", "ins-hartford", "Group LTD (ERISA)", "2026-09-02", "2026-10-08T09:05", "Book consultation", "2026-10-13", { phone: "(314) 555-0119", email: "dfischer@example.com", story: "Heart failure; Hartford denied on 2 Sep saying he can do sedentary work." }),
  lead("l-2209", "Keisha Monroe", "Consult booked", "Referral", "Brand A", "ins-unum", "Group LTD (ERISA)", "2026-07-28", "2026-10-01T16:30", "Consultation", "2026-10-13", { phone: "(314) 555-0191", email: "kmonroe@example.com", referrer: "Angela Morrison (client)", story: "Fibromyalgia; Unum terminated benefits in July." }),
  lead("l-2208", "Raymond Castillo", "Consult held", "Web", "Brand B", "ins-metlife", "Individual policy", "2026-08-11", "2026-09-29T10:15", "Send fee agreement", "2026-10-13", { phone: "(573) 555-0108", email: "rcastillo@example.com", story: "Surgeon; individual own-occupation policy. MetLife denied after a records review." }),
  lead("l-2207", "Hannah Mercer", "Agreement sent", "Referral", "Brand A", "ins-lincoln", "Group LTD (ERISA)", "2026-08-25", "2026-09-30T13:40", "Wait for signature", "2026-10-16", { phone: "(314) 555-0175", email: "hmercer@example.com", referrer: "Dr. office referral", story: "Long COVID; Lincoln denied in August." }),
  lead("l-2206", "Joanne Pruitt", "Agreement sent", "Phone", "Brand A", "ins-lincoln", "Group LTD (ERISA)", "2026-06-15", "2026-09-26T09:20", "Call if not signed", "2026-10-14", { phone: "(314) 555-0128", email: "jpruitt@example.com", story: "Rheumatoid arthritis; denied in June." }),
  lead("l-2205", "Owen Price", "Agreement sent", "Web", "Brand B", "ins-prudential", "Group LTD (ERISA)", "2026-07-02", "2026-09-14T15:55", "Agreement expired — call and resend", "2026-10-09", { phone: "(417) 555-0150", email: "oprice@example.com", story: "Bipolar disorder; Prudential stopped benefits in July." }),
  lead("l-2204", "Victor Alston", "Signed", "Referral", "Brand A", "ins-prudential", "Group LTD (ERISA)", "2026-08-04", "2026-09-22T08:45", "Open the client file", "2026-10-13", { phone: "(314) 555-0102", email: "valston@example.com", referrer: "Former client", story: "Parkinson's; denied in August." }),
  lead("l-2203", "Carla Jennings", "Signed", "Web", "Brand B", "ins-newyorklife", "Group LTD (ERISA)", "2026-07-19", "2026-09-15T12:05", "Done — client file opened", "2026-10-02", { phone: "(636) 555-0144", email: "cjennings@example.com", story: "Crohn's disease; claim denied in July." }),
  lead("l-2202", "Sharon Bell", "Not a fit", "Web", "Brand B", "", "Unknown", "", "2026-09-28T19:10", "None — closed", "2026-10-02", { phone: "(314) 555-0186", email: "sbell@example.com", story: "No disability policy through work; asked about Social Security only.", reason: "No private disability policy" }),
  lead("l-2201", "Thomas Reyes", "Referred out", "Phone", "Brand A", "", "Unknown", "", "2026-09-24T10:30", "None — referred out", "2026-09-25", { phone: "(314) 555-0171", email: "treyes@example.com", story: "Injured at work; workers' compensation question.", reason: "Workers' compensation — referred to a partner firm" }),
];

const consult = (id: string, title: string, leadId: string, attorney: string, when: string, outcome: string, notes: string): Rec => ({ id, title, lead: leadId, attorney, when, outcome, notes });

const CONSULTS: Rec[] = [
  consult("cs-412", "Consultation — Keisha Monroe", "l-2209", "Daniel Brooks", "2026-10-13T14:00", "Scheduled", "Video call. Unum termination letter on file."),
  consult("cs-413", "Consultation — Nadia Farouk", "l-2211", "Elena Ruiz", "2026-10-15T09:30", "Scheduled", "Moved up — estimated appeal deadline 17 Oct."),
  consult("cs-411", "Consultation — Raymond Castillo", "l-2208", "Elena Ruiz", "2026-10-09T11:00", "Take the case", "Strong own-occupation case; agreement to follow."),
  consult("cs-410", "Consultation — Hannah Mercer", "l-2207", "Daniel Brooks", "2026-10-07T15:30", "Take the case", "Agreement sent the same day."),
  consult("cs-409", "Consultation — Joanne Pruitt", "l-2206", "Daniel Brooks", "2026-10-05T10:00", "Take the case", "Appeal deadline about 12 Dec 2026 (estimated)."),
  consult("cs-408", "Consultation — Sharon Bell", "l-2202", "Elena Ruiz", "2026-10-02T13:00", "Decline", "No private policy. Gave the Social Security referral list."),
  consult("cs-406", "Consultation — Victor Alston", "l-2204", "Elena Ruiz", "2026-09-28T09:00", "Take the case", "Prudential denial; records request started."),
  consult("cs-405", "Consultation — Owen Price", "l-2205", "Elena Ruiz", "2026-09-24T16:00", "Take the case", "Held after one no-show on 21 Sep."),
  consult("cs-403", "Consultation — Carla Jennings", "l-2203", "Daniel Brooks", "2026-09-22T11:30", "Take the case", "Signed two days later."),
];

const agree = (id: string, title: string, leadId: string | null, client: string | null, status: string, prepared: string, approved: string, sent: string, viewed: string, signed: string, expires: string): Rec => ({ id, title, lead: leadId, client, status, prepared, approved, sent, viewed, signed, expires, approver: approved ? "Elena Ruiz" : "" });

const AGREEMENTS: Rec[] = [
  agree("ag-306", "Fee agreement — Hannah Mercer", "l-2207", null, "Sent", "2026-10-07T16:00", "2026-10-07T16:20", "2026-10-07T16:25", "", "", "2026-10-21"),
  agree("ag-305", "Fee agreement — Joanne Pruitt", "l-2206", null, "Viewed", "2026-10-05T11:10", "2026-10-05T11:30", "2026-10-05T11:32", "2026-10-06T19:48", "", "2026-10-19"),
  agree("ag-304", "Fee agreement — Victor Alston", "l-2204", null, "Signed", "2026-09-28T10:00", "2026-09-28T10:15", "2026-09-28T10:16", "2026-09-28T18:02", "2026-09-29T08:31", ""),
  agree("ag-302", "Fee agreement — Owen Price", "l-2205", null, "Expired", "2026-09-24T17:00", "2026-09-24T17:10", "2026-09-24T17:12", "2026-09-26T12:40", "", "2026-10-08"),
  agree("ag-301", "Fee agreement — Carla Jennings", "l-2203", null, "Signed", "2026-09-22T12:00", "2026-09-22T12:20", "2026-09-22T12:21", "2026-09-23T20:15", "2026-09-24T07:58", ""),
  agree("ag-298", "Fee agreement — Patricia Young", null, "c-1047", "Signed", "2026-09-29T14:00", "2026-09-29T14:30", "2026-09-29T14:31", "2026-09-29T21:05", "2026-09-30T09:12", ""),
];

function Duplicate({ rec }: { rec: Rec }) {
  const w = useWorld();
  if (!rec.dupOf) {
    return (
      <Card title="Possible duplicates" info="Every new lead is checked against clients and leads in both brands by phone, email and name.">
        <p className="empty">No match above 60% among clients or leads in either brand.</p>
      </Card>
    );
  }
  const client = w.rows("network", "clients").find((c) => c.id === rec.dupOf);
  const insurer = (id: unknown) => w.rows("network", "insurers").find((i) => i.id === id)?.name;
  const pr = w.proposals.find((p) => p.id === `pr-intake-merge-${rec.id.slice(2)}`);
  const row = (label: string, a: unknown, b: unknown) => (
    <tr><td className="meta">{label}</td><td>{String(a ?? "Unknown")}</td><td>{String(b ?? "Unknown")}</td><td>{a === b ? <Pill tone="green">Same</Pill> : <Pill tone="gray">Differs</Pill>}</td></tr>
  );
  return (
    <Card title="Possible duplicate" info="Alpha never merges on its own. A merge keeps the original lead and its form submission in the client's history.">
      <ul className="steps">
        <li><Copy aria-hidden /><span>Confidence {String(rec.dupConfidence)}% — {String(rec.dupOn)}</span></li>
      </ul>
      {client ? (
        <table className="mini" style={{ marginTop: 10 }}>
          <thead><tr><th></th><th>This lead</th><th><a href={href.record("network", "clients", client.id)}>{String(client.name)}</a></th><th></th></tr></thead>
          <tbody>
            {row("Phone", rec.phone, client.phone)}
            {row("Email", rec.email, client.email)}
            {row("Insurer", insurer(rec.insurer), insurer(client.insurer))}
            {row("Brand", rec.brand, client.brand)}
          </tbody>
        </table>
      ) : null}
      {pr?.state === "open" ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="primary" icon={CircleCheck} onClick={() => w.decide(pr.id, true)}>Approve merge</Button>
          <Button onClick={() => w.decide(pr.id, false)}>Decline</Button>
        </div>
      ) : pr ? (
        <p className="meta" style={{ marginTop: 10 }}>{pr.state === "approved" ? "Merge approved — the lead now sits in the client's history." : "Declined — kept as a separate lead."}</p>
      ) : null}
    </Card>
  );
}

function Screening({ rec }: { rec: Rec }) {
  const w = useWorld();
  const insurer = w.rows("network", "insurers").find((i) => i.id === rec.insurer);
  const erisa = String(rec.erisa ?? "");
  const left = erisa ? daysBetween(TODAY, erisa) : null;
  return (
    <Card title="Screening summary" info="From the lead's own answers. Nothing here is a legal judgement; the consulting attorney confirms the policy type and the deadline from the documents.">
      <table className="mini">
        <tbody>
          <tr><td className="meta">Policy type</td><td><Pill tone={POLICY.find((p) => p.value === rec.policy)?.tone}>{String(rec.policy)}</Pill></td></tr>
          <tr><td className="meta">Insurer</td><td>{insurer ? <a href={href.record("network", "insurers", insurer.id)}>{String(insurer.name)}</a> : "Unknown"}</td></tr>
          <tr><td className="meta">Denial date</td><td>{rec.denial ? fmtDate(String(rec.denial)) : "Unknown"}</td></tr>
          <tr><td className="meta">ERISA appeal deadline</td><td>{erisa ? <>{fmtDate(erisa)} <span className="cite">Estimated</span></> : rec.policy === "Individual policy" ? "Not ERISA — state law applies; attorney confirms" : "Unknown until we have the denial letter"}</td></tr>
        </tbody>
      </table>
      {left !== null ? (
        <>
          <div className="bar" style={{ marginTop: 12 }}><div className="bar__fill" style={{ width: `${Math.min(100, Math.max(0, ((180 - left) / 180) * 100))}%` }} /></div>
          <p className="meta" style={{ marginTop: 6 }}>
            {left < 0 ? "The estimated window has passed." : `${left} of 180 days left.`} {left >= 0 && left <= 30 ? <Pill tone="red">Deadline close</Pill> : null}
          </p>
        </>
      ) : null}
      {rec.story ? <p className="quote" style={{ marginTop: 10 }}>{String(rec.story)}</p> : null}
    </Card>
  );
}

function Signing({ rec }: { rec: Rec }) {
  const step = (label: string, at: unknown, Icon: typeof Send) => (
    <li className={at ? "ok" : undefined}><Icon aria-hidden /><span><strong>{label}</strong> — {at ? fmtDate(String(at).slice(0, 10)) + ", " + String(at).slice(11) : "Not yet"}</span></li>
  );
  return (
    <Card title="Signing steps" info="An attorney approves every agreement before it is sent. Unsigned agreements expire after 14 days and need a new one.">
      <ul className="steps">
        {step("Prepared from the firm's template", rec.prepared, PenLine)}
        {step(`Approved by ${String(rec.approver || "an attorney")}`, rec.approved, ShieldCheck)}
        {step("Sent for e-signature", rec.sent, Send)}
        {step("Viewed by the lead", rec.viewed, Mail)}
        {step("Signed", rec.signed, FileSignature)}
      </ul>
      {rec.status === "Expired" ? <p className="meta" style={{ marginTop: 10 }}><Pill tone="red">Expired {fmtDate(String(rec.expires))}</Pill> Viewed but never signed. Call before sending a new one.</p>
        : rec.status === "Signed" ? <p className="meta" style={{ marginTop: 10 }}>The signed copy is kept unchanged with its signing certificate.</p>
        : rec.expires ? <p className="meta" style={{ marginTop: 10 }}>Expires {fmtDate(String(rec.expires))}.</p> : null}
    </Card>
  );
}

const open = (r: Rec) => !CLOSED.includes(String(r.stage));
const soon = (r: Rec) => open(r) && !!r.erisa && daysBetween(TODAY, String(r.erisa)) <= 30;

export const intake: Project = {
  id: "intake",
  name: "Intake",
  icon: UserPlus,
  summary: "New leads from both brands, screened, checked for duplicates and carried to a signed agreement.",
  collections: [
    {
      id: "leads",
      label: "Leads",
      word: "Lead",
      icon: UserPlus,
      titleKey: "name",
      view: "board",
      boardBy: "stage",
      dateKey: "nextDue",
      fields: [
        { key: "name", label: "Lead", type: "text", width: 200 },
        { key: "stage", label: "Stage", type: "status", options: STAGE, width: 180 },
        { key: "source", label: "Source", type: "choice", options: [{ value: "Web", tone: "blue" }, { value: "Phone", tone: "gray" }, { value: "Referral", tone: "green" }] },
        { key: "brand", label: "Brand", type: "choice", options: [{ value: "Brand A", tone: "blue" }, { value: "Brand B", tone: "gray" }] },
        { key: "insurer", label: "Insurer", type: "relation", to: { project: "network", collection: "insurers" } },
        { key: "next", label: "Next step", type: "text", width: 260 },
        { key: "nextDue", label: "Next step due", type: "date" },
        { key: "erisa", label: "ERISA deadline", type: "date", computed: true },
        { key: "owner", label: "Owner", type: "person" },
        { key: "received", label: "Received", type: "datetime" },
        { key: "policy", label: "Policy type", type: "choice", options: POLICY, hidden: true },
        { key: "denial", label: "Denial date", type: "date", hidden: true },
        { key: "phone", label: "Phone", type: "text", hidden: true },
        { key: "email", label: "Email", type: "text", hidden: true, width: 240 },
        { key: "referrer", label: "Referred by", type: "text", hidden: true },
        { key: "dupOf", label: "Possible duplicate of", type: "relation", to: { project: "network", collection: "clients" }, hidden: true, computed: true },
        { key: "dupConfidence", label: "Match", type: "percent", hidden: true, computed: true },
        { key: "reason", label: "Closed because", type: "text", hidden: true },
      ],
      records: LEADS,
      lists: [
        { id: "open", name: "Open pipeline", filter: open, star: true },
        { id: "dupes", name: "Possible duplicates", filter: (r) => !!r.dupOf },
      ],
      metrics: [
        { label: "Open leads", icon: UserPlus, value: (r) => r.filter(open).length, basis: (r) => `of ${r.length} since 14 Sep`, filter: open },
        { label: "Appeal deadline within 30 days", icon: TriangleAlert, value: (r) => r.filter(soon).length, basis: () => "estimated from the denial date", attention: (r) => r.some(soon), filter: soon },
        { label: "Possible duplicates", icon: Copy, value: (r) => r.filter((x) => !!x.dupOf && open(x)).length, basis: () => "waiting for a person", filter: (x) => !!x.dupOf },
        { label: "Signed", icon: FileSignature, value: (r) => r.filter((x) => x.stage === "Signed").length, basis: () => "since 14 Sep", filter: (x) => x.stage === "Signed" },
      ],
      sections: (r) => (<><Duplicate rec={r} /><Screening rec={r} /></>),
    },
    {
      id: "consultations",
      label: "Consultations",
      word: "Consultation",
      icon: CalendarDays,
      titleKey: "title",
      view: "calendar",
      dateKey: "when",
      boardBy: "outcome",
      fields: [
        { key: "title", label: "Consultation", type: "text", width: 260 },
        { key: "lead", label: "Lead", type: "relation", to: { project: "intake", collection: "leads" } },
        { key: "attorney", label: "Attorney", type: "person" },
        { key: "when", label: "When", type: "datetime" },
        { key: "outcome", label: "Outcome", type: "status", options: OUTCOME },
        { key: "notes", label: "Notes", type: "longtext", width: 320 },
      ],
      records: CONSULTS,
      lists: [{ id: "upcoming", name: "Upcoming", filter: (r) => r.outcome === "Scheduled", star: true }],
    },
    {
      id: "agreements",
      label: "Agreements",
      word: "Agreement",
      icon: FileSignature,
      titleKey: "title",
      boardBy: "status",
      fields: [
        { key: "title", label: "Agreement", type: "text", width: 260 },
        { key: "lead", label: "Lead", type: "relation", to: { project: "intake", collection: "leads" } },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "status", label: "E-signature", type: "status", options: SIGN },
        { key: "sent", label: "Sent", type: "datetime" },
        { key: "signed", label: "Signed", type: "datetime" },
        { key: "expires", label: "Expires", type: "date" },
        { key: "approver", label: "Approved by", type: "person", hidden: true },
      ],
      records: AGREEMENTS,
      noAdd: "Agreements are prepared from a lead after the consultation, and an attorney approves each one",
      lists: [{ id: "unsigned", name: "Not signed", filter: (r) => r.status !== "Signed", star: true }],
      sections: (r) => <Signing rec={r} />,
    },
  ],
  agents: [
    {
      id: "screener",
      name: "Intake screener",
      does: "Reads new web forms and call notes from both brands, checks each lead for duplicates, writes a screening summary and suggests the next step.",
      skills: ["Duplicate check: phone → email → name and short forms, across both brands", "Screening: policy type, insurer, denial date", "Estimating the ERISA appeal window and saying it is an estimate"],
      runs: [
        { when: "12 Oct, 06:45", what: "Screened 2 new web leads", result: "1 possible duplicate · 1 ready for a first call", tone: "yellow" },
        { when: "9 Oct, 14:20", what: "Screened 1 phone lead", result: "Summary written", tone: "green" },
        { when: "8 Oct, 09:15", what: "Screened 1 phone lead", result: "Summary written · consultation suggested", tone: "green" },
      ],
      may: ["Write a screening summary from the lead's answers", "Flag a possible duplicate with what matched", "Draft a consultation invite or a reminder for staff"],
      mayNot: ["Merge records", "Send an agreement or a message to a lead", "Tell a lead whether they have a case"],
    },
  ],
  automations: [
    { id: "dupe-check", sentence: "When a new lead arrives, check it against clients and leads in both brands", trigger: "When a lead is created", next: "On the next lead", on: true, agent: "screener" },
    { id: "intake-deadline-sweep", sentence: "Every morning at 07:00, flag open leads whose estimated appeal deadline is within 30 days", trigger: "Daily at 07:00", next: "13 Oct, 07:00", on: true, agent: "screener" },
    { id: "sign-reminder", sentence: "When an agreement has been viewed but not signed for 3 days, remind intake to call", trigger: "3 days after viewed", next: "13 Oct, 09:00", on: true },
  ],
  allowed: [
    { text: "Alpha may flag a possible duplicate and show what matched.", why: "Duplicates across the two brands are the most common intake mistake; a person decides." },
    { text: "Alpha may estimate an ERISA appeal deadline from the denial date.", why: "It is marked as an estimate until an attorney checks the letter." },
    { text: "Alpha may draft consultation invites and signing reminders.", why: "Staff approve every message before it leaves the firm." },
  ],
  denied: [
    { text: "Alpha may not merge a lead into a client or another lead.", why: "A wrong merge mixes two people's private information." },
    { text: "Alpha may not send a fee agreement.", why: "An attorney approves every agreement before it is sent." },
    { text: "Alpha may not tell a lead whether they have a case.", why: "That is a legal judgement for the consulting attorney." },
  ],
  kept: [
    { what: "Web form submissions", where: "Write-once storage, kept as received before anything is read from them" },
    { what: "Signed agreements", where: "The document store, with the e-signature certificate" },
    { what: "Read from", where: "Both brands' web forms and the intake phone notes" },
  ],
  files: [
    { name: "Intake summary — week of 5 Oct 2026.pdf", by: "Alpha", when: "12 Oct, 06:50", size: "84 KB" },
    { name: "Fee agreement template (2026).docx", by: "Elena Ruiz", when: "2 Jan, 10:00", size: "48 KB" },
  ],
  about: "This project replaces the manual Total Office lead entry. Leads from both brands arrive in one pipeline, are checked for duplicates and screened, and move from consultation to a signed agreement with an attorney's approval at each step that leaves the firm.",
};

export const intakeExtras: Extras = {
  proposals: [
    {
      id: "pr-intake-merge-2214",
      project: "intake",
      task: "Merge lead Pat Young into Patricia Young's client record",
      outcome: "The Brand B web form joins Patricia Young's history; no new lead or second file is opened.",
      judged: "Same phone number, Pat is a short form of Patricia, same insurer. The email differs, so a person confirms.",
      reaches: "Stays in the firm; reaches nobody.",
      undo: "Can be split back out from the client's page; the original form is kept.",
      roles: ["intake"],
      recordLink: href.record("intake", "leads", "l-2214"),
      state: "open",
    },
    {
      id: "pr-intake-consult-2210",
      project: "intake",
      task: "Invite Daniel Fischer to a consultation with Daniel Brooks",
      outcome: "Consultation booked for 14 Oct 2026, 10:00 by video; the lead moves to Consult booked.",
      judged: "Group policy denied on 2 Sep; estimated appeal deadline 1 Mar 2027.",
      payload: "To: dfischer@example.com\nSubject: Your free consultation with Dell Disability Lawyers\nWednesday 14 October, 10:00, by video with attorney Daniel Brooks. Please have your denial letter ready.",
      reaches: "Reaches someone: it asks every time.",
      undo: "Cannot be unsent; the meeting can be moved.",
      roles: ["intake"],
      recordLink: href.record("intake", "leads", "l-2210"),
      state: "open",
    },
    {
      id: "pr-intake-agree-2208",
      project: "intake",
      task: "Send the fee agreement to Raymond Castillo for e-signature",
      outcome: "The standard agreement goes out for e-signature and expires in 14 days if unsigned.",
      judged: "Elena Ruiz recorded Take the case after the 9 Oct consultation.",
      payload: "To: rcastillo@example.com\nSubject: Your agreement with Dell Disability Lawyers\nAttached: Fee agreement — Raymond Castillo.pdf (for e-signature)",
      reaches: "Reaches someone: it asks every time.",
      undo: "Can be voided before it is signed.",
      roles: ["attorney"],
      recordLink: href.record("intake", "leads", "l-2208"),
      state: "open",
    },
  ],
  due: [
    { id: "d-intake-2205", title: "Owen Price's agreement expired — call and resend", when: "9 Oct 2026", bucket: "overdue", link: href.record("intake", "agreements", "ag-302"), roles: ["intake"] },
    { id: "d-intake-2213", title: "First call — Amy Lindqvist", when: "12 Oct 2026", bucket: "today", link: href.record("intake", "leads", "l-2213"), roles: ["intake"] },
    { id: "d-intake-2211", title: "Nadia Farouk — estimated appeal deadline", when: "17 Oct 2026", bucket: "upcoming", link: href.record("intake", "leads", "l-2211"), roles: ["intake", "attorney"] },
  ],
  activity: [
    { id: "a-i1", when: "12 Oct, 06:45", who: "Alpha", what: "Screened 2 new web leads", link: href.project("intake", "leads") },
    { id: "a-i2", when: "12 Oct, 06:45", who: "Alpha", what: "Flagged Pat Young as a possible duplicate of Patricia Young", link: href.record("intake", "leads", "l-2214") },
    { id: "a-i3", when: "12 Oct, 07:00", who: "Alpha", what: "Flagged Nadia Farouk — estimated appeal deadline 17 Oct", link: href.record("intake", "leads", "l-2211") },
  ],
  conversation: [
    { who: "alpha", text: "Two web leads came in overnight. One, Pat Young on Brand B, looks like Patricia Young — a client since 30 Sep. Same phone and insurer, different email: 94%.", source: "Read Leads · 2 new · client c-1047 · Intake screener" },
    { who: "you", text: "Merge it if you're sure." },
    { who: "alpha", proposal: "pr-intake-merge-2214" },
  ],
};
