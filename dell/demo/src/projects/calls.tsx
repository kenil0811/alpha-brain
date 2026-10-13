import { CircleCheck, CircleDashed, ListChecks, MicOff, PhoneCall, ShieldCheck, TriangleAlert } from "lucide-react";
import { Card, Pill } from "../kit";
import { href } from "../data/route";
import { useWorld } from "../data/store";
import type { Project, Rec } from "../data/types";
import type { Extras } from "./extras";

/* Call reviews: recorded staff ↔ client phone calls → summary, action items with the moment they
   were said, and a compliance check. Sample data — invented. The rule that matters: Alpha flags,
   a person decides; nothing is "fine" when there is no recording to check. */

const REVIEW = [
  { value: "Needs review", tone: "yellow" as const },
  { value: "Flagged for attorney", tone: "yellow" as const },
  { value: "Recording missing", tone: "red" as const },
  { value: "Reviewed", tone: "green" as const, done: true },
];

const SENTIMENT = [
  { value: "Positive", tone: "green" as const },
  { value: "Neutral", tone: "gray" as const },
  { value: "Worried", tone: "yellow" as const },
  { value: "Upset", tone: "red" as const },
  { value: "Unknown", tone: "gray" as const },
];

const FU_STATUS = [
  { value: "Proposed", tone: "yellow" as const },
  { value: "Open", tone: "blue" as const },
  { value: "Overdue", tone: "red" as const },
  { value: "Done", tone: "green" as const, done: true },
];

/** Compliance checks, in the order a reviewer reads them. */
const CHECKS = [
  { id: "id", label: "Identity verified with two identifiers" },
  { id: "rec", label: "Recording disclosure given at the start" },
  { id: "advice", label: "No legal advice from a non-attorney" },
  { id: "promise", label: "No promises about the outcome" },
  { id: "phi", label: "Medical details kept to this client's case" },
];

const call = (id: string, title: string, client: string, staff: string, at: string, minutes: number | null, topic: string, sentiment: string, followUp: boolean, review: string, extra: Partial<Rec> = {}): Rec => ({ id, title, client, staff, at, minutes, topic, sentiment, followUp, review, ...extra });

const CALLS: Rec[] = [
  call("cl-501", "Angela Morrison — Unum request", "c-1042", "Maria Alvarez", "2026-10-09T10:15", 14, "Ongoing benefits", "Worried", true, "Needs review", { passed: ["id", "rec", "advice", "promise", "phi"] }),
  call("cl-502", "Jerome Washington — cardiology APS", "c-1036", "Sam Okafor", "2026-10-08T15:40", 9, "Appeal", "Upset", true, "Flagged for attorney", {
    passed: ["id", "rec", "advice", "phi"], flagged: ["promise"],
    _prov: { review: { kind: "estimated", note: "Alpha heard “you'll definitely get your benefits back” at 06:21. It may be reassurance, not a promise — an attorney decides." } },
  }),
  call("cl-503", "Brenda Foster — October payment", "c-1052", "Karen Liu", "2026-10-09T16:30", null, "Finance", "Unknown", true, "Recording missing", {
    notes: "Karen's own notes: client says October payment from Unum was lower than usual. No letter received yet. Will call back once we hear from Unum.",
  }),
  call("cl-504", "Howard Kim — work history form", "c-1050", "Maria Alvarez", "2026-10-07T13:30", 11, "Ongoing benefits", "Neutral", true, "Reviewed", { passed: ["id", "rec", "advice", "promise", "phi"] }),
  call("cl-505", "Patricia Young — new claim questions", "c-1047", "Priya Shah", "2026-10-06T09:50", 22, "New claim", "Worried", true, "Reviewed", { passed: ["id", "rec", "advice", "promise", "phi"] }),
  call("cl-506", "Linda Chen — SSA award letter", "c-1020", "Sam Okafor", "2026-10-02T16:10", 6, "Ongoing benefits", "Positive", false, "Reviewed", { passed: ["id", "rec", "advice", "promise", "phi"] }),
  call("cl-507", "Kevin O'Brien — new address", "c-1044", "Sam Okafor", "2026-10-05T10:25", 4, "Contact details", "Neutral", true, "Reviewed", { passed: ["id", "rec", "advice", "promise", "phi"] }),
  call("cl-508", "Tanya Brooks — signed authorization", "c-1031", "Maria Alvarez", "2026-10-09T14:45", 5, "Ongoing benefits", "Positive", false, "Reviewed", { passed: ["id", "rec", "advice", "promise", "phi"] }),
  call("cl-509", "Carlos Mendoza — appeal next steps", "c-1061", "Elena Ruiz", "2026-10-09T11:30", 27, "Appeal", "Neutral", true, "Needs review", { passed: ["id", "rec", "promise", "phi"], na: ["advice"] }),
];

/** What Alpha heard, kept out of the table: summary, a short excerpt, and action items with the moment they were said. */
const HEARD: Record<string, { summary: string; excerpt: { who: string; at: string; text: string }; actions: { text: string; at: string }[] }> = {
  "cl-501": {
    summary: "Angela called about Unum's request for an updated APS, claimant statement and authorization. She couldn't find the items in her portal. Her fatigue is worse since September and she started a new medication. She sees Dr. Ortiz on 21 Oct.",
    excerpt: { who: "Angela Morrison", at: "03:12", text: "I signed in twice and I just don't see anything to fill out. Can you send it again?" },
    actions: [
      { text: "Send the portal link again and check she can see all three items", at: "03:12" },
      { text: "Add the new medication (started Sep 2026) to the claimant statement draft", at: "07:48" },
      { text: "Ask Dr. Ortiz's office to have the APS ready after the 21 Oct visit", at: "10:05" },
    ],
  },
  "cl-502": {
    summary: "Jerome was upset that the cardiology APS is late. Sam explained the doctor's office has the prefilled form. Near the end Sam said the appeal would “definitely” win, which Alpha flagged for an attorney.",
    excerpt: { who: "Sam Okafor", at: "06:21", text: "Don't worry, you'll definitely get your benefits back once this form is in." },
    actions: [
      { text: "Call Heartland Cardiology Group about the signed APS", at: "02:40" },
      { text: "Daniel Brooks to call Jerome about what to expect from the appeal", at: "06:21" },
    ],
  },
  "cl-504": {
    summary: "Howard went through the work history form with Maria. One job from 2015 is missing an end date; he will look it up.",
    excerpt: { who: "Howard Kim", at: "05:30", text: "I left the warehouse job sometime in 2015, I'll have to check my old pay stubs." },
    actions: [{ text: "Get the 2015 end date from Howard and finish the work history draft", at: "05:30" }],
  },
  "cl-505": {
    summary: "Patricia asked how long a new claim takes and whether she should take a lump sum her employer mentioned. Priya didn't advise and booked a call with Elena Ruiz.",
    excerpt: { who: "Priya Shah", at: "14:02", text: "That's a question for your attorney — I'll set up a call with Elena Ruiz this week." },
    actions: [{ text: "Book a call with Elena Ruiz about the lump sum offer", at: "14:02" }],
  },
  "cl-506": {
    summary: "Linda confirmed the SSA award letter arrived and was uploaded. Nothing else to do.",
    excerpt: { who: "Linda Chen", at: "01:15", text: "It came Tuesday and I put it in the portal right away." },
    actions: [],
  },
  "cl-507": {
    summary: "Kevin moved. Sam took the new address after verifying his identity.",
    excerpt: { who: "Kevin O'Brien", at: "01:40", text: "We moved to the new place on the first, so please send everything there." },
    actions: [{ text: "Update Kevin's address on the client record and tell MetLife", at: "01:40" }],
  },
  "cl-508": {
    summary: "Tanya confirmed she signed the 2026 authorization in the portal.",
    excerpt: { who: "Tanya Brooks", at: "00:55", text: "I signed it last night, is that everything you need?" },
    actions: [],
  },
  "cl-509": {
    summary: "Elena walked Carlos through the appeal plan: new rheumatology records from Dr. Mehta and a vocational report. Carlos agreed.",
    excerpt: { who: "Elena Ruiz", at: "12:10", text: "The rheumatology records are the heart of this appeal, so let's get those first." },
    actions: [
      { text: "Request rheumatology records from Dr. Mehta since January 2026", at: "12:10" },
      { text: "Get a quote for a vocational report", at: "19:35" },
    ],
  },
};

const fu = (id: string, task: string, call: string, client: string, owner: string, due: string, status: string, heard: string): Rec => ({ id, task, call, client, owner, due, status, heard });

const FOLLOWUPS: Rec[] = [
  fu("fu-1", "Send the portal link again and check she can see all three items", "cl-501", "c-1042", "Maria Alvarez", "2026-10-13", "Proposed", "03:12"),
  fu("fu-2", "Add the new medication to the claimant statement draft", "cl-501", "c-1042", "Maria Alvarez", "2026-10-20", "Proposed", "07:48"),
  fu("fu-3", "Call Heartland Cardiology Group about the signed APS", "cl-502", "c-1036", "Sam Okafor", "2026-10-09", "Overdue", "02:40"),
  fu("fu-4", "Daniel Brooks to call Jerome about what to expect from the appeal", "cl-502", "c-1036", "Daniel Brooks", "2026-10-14", "Proposed", "06:21"),
  fu("fu-5", "Get the 2015 end date and finish the work history draft", "cl-504", "c-1050", "Maria Alvarez", "2026-10-16", "Open", "05:30"),
  fu("fu-6", "Book a call with Elena Ruiz about the lump sum offer", "cl-505", "c-1047", "Priya Shah", "2026-10-08", "Done", "14:02"),
  fu("fu-7", "Update Kevin's address and tell MetLife", "cl-507", "c-1044", "Sam Okafor", "2026-10-07", "Done", "01:40"),
  fu("fu-8", "Request rheumatology records from Dr. Mehta since January 2026", "cl-509", "c-1061", "Maria Alvarez", "2026-10-19", "Open", "12:10"),
  fu("fu-9", "Call Brenda back once Unum explains the October payment", "cl-503", "c-1052", "Karen Liu", "2026-10-16", "Open", ""),
];

function Summary({ rec }: { rec: Rec }) {
  const h = HEARD[rec.id];
  if (!h) {
    return (
      <Card title="Call summary" info="The phone system connection needs attention. The call is in the phone log but its recording never reached the workspace, so Alpha has nothing to summarize.">
        <p className="empty"><MicOff aria-hidden size={14} /> No recording arrived for this call. Alpha hasn't summarized or checked it.</p>
        {rec.notes ? <p className="quote">{String(rec.notes)}</p> : null}
      </Card>
    );
  }
  return (
    <Card title="Call summary" info="Written by Alpha from the recording. The full recording and transcript are kept with the call.">
      <p>{h.summary}</p>
      <p className="quote" style={{ marginTop: 10 }}>“{h.excerpt.text}” — {h.excerpt.who} <span className="cite">at {h.excerpt.at}</span></p>
    </Card>
  );
}

function Actions({ rec }: { rec: Rec }) {
  const w = useWorld();
  const tasks = w.rows("calls", "followups").filter((f) => f.call === rec.id);
  const h = HEARD[rec.id];
  if (!h && !tasks.length) return null;
  return (
    <Card title="Action items" info="Alpha lists what was promised on the call and when it was said. Each becomes a follow-up only after a person approves it.">
      {tasks.length ? (
        <table className="mini">
          <thead><tr><th>Action</th><th>Heard at</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td><a href={href.record("calls", "followups", t.id)}>{String(t.task)}</a></td>
                <td className="meta">{t.heard ? <span className="cite">heard at {String(t.heard)}</span> : "Not recorded"}</td>
                <td className="meta">{String(t.owner)}</td>
                <td><Pill tone={FU_STATUS.find((s) => s.value === t.status)?.tone}>{String(t.status)}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">Nothing to follow up from this call.</p>
      )}
    </Card>
  );
}

function Compliance({ rec }: { rec: Rec }) {
  const has = (k: string, id: string) => Array.isArray(rec[k]) && (rec[k] as string[]).includes(id);
  const missing = rec.review === "Recording missing";
  return (
    <Card title="Compliance check" info="Alpha checks each call against the firm's phone rules. A flag goes to an attorney; Alpha never decides whether advice was given.">
      <ul className="steps">
        {CHECKS.map((c) => {
          if (has("passed", c.id)) return <li key={c.id} className="ok"><CircleCheck aria-hidden /><span>{c.label}</span></li>;
          if (has("flagged", c.id)) return <li key={c.id}><TriangleAlert aria-hidden /><span>{c.label}</span> <Pill tone="yellow">Attorney to review</Pill></li>;
          if (has("na", c.id)) return <li key={c.id} className="ok"><ShieldCheck aria-hidden /><span>{c.label} — the call was with an attorney</span></li>;
          return <li key={c.id}><CircleDashed aria-hidden /><span>{c.label} — {missing ? "can't check without the recording" : "Unknown"}</span></li>;
        })}
      </ul>
    </Card>
  );
}

export const calls: Project = {
  id: "calls",
  name: "Call reviews",
  icon: PhoneCall,
  summary: "Recorded client calls summarized, action items pulled out with when they were said, and checked against the firm's phone rules.",
  collections: [
    {
      id: "calls",
      label: "Calls",
      word: "Call",
      icon: PhoneCall,
      titleKey: "title",
      boardBy: "review",
      dateKey: "at",
      fields: [
        { key: "title", label: "Call", type: "text", width: 300 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "staff", label: "Staff", type: "person" },
        { key: "at", label: "Date", type: "datetime" },
        { key: "minutes", label: "Minutes", type: "number", width: 100, computed: true },
        { key: "topic", label: "Topic", type: "choice", options: [{ value: "Ongoing benefits", tone: "blue" }, { value: "Appeal", tone: "blue" }, { value: "New claim", tone: "blue" }, { value: "Finance", tone: "gray" }, { value: "Contact details", tone: "gray" }] },
        { key: "sentiment", label: "Sentiment", type: "choice", options: SENTIMENT, computed: true },
        { key: "followUp", label: "Follow-up needed", type: "check" },
        { key: "review", label: "Review", type: "status", options: REVIEW, width: 200 },
      ],
      records: CALLS,
      lists: [
        { id: "review", name: "Needs a person", filter: (r) => r.review !== "Reviewed", star: true },
        { id: "followup", name: "Follow-up needed", filter: (r) => r.followUp === true },
      ],
      metrics: [
        { label: "Needs review", icon: CircleDashed, value: (r) => r.filter((x) => x.review === "Needs review").length, basis: (r) => `of ${r.length} calls this month`, filter: (x) => x.review === "Needs review" },
        { label: "Flagged for attorney", icon: TriangleAlert, value: (r) => r.filter((x) => x.review === "Flagged for attorney").length, basis: () => "possible compliance issue", attention: (r) => r.some((x) => x.review === "Flagged for attorney"), filter: (x) => x.review === "Flagged for attorney" },
        { label: "Recording missing", icon: MicOff, value: (r) => r.filter((x) => x.review === "Recording missing").length, basis: () => "phone system needs attention", attention: (r) => r.some((x) => x.review === "Recording missing"), filter: (x) => x.review === "Recording missing" },
      ],
      notice: "Phone system connection needs attention: the recording for Brenda Foster's call on 9 Oct 2026 never arrived.",
      noAdd: "Calls arrive from the phone system; they can't be added by hand",
      sections: (r) => (<><Summary rec={r} /><Actions rec={r} /><Compliance rec={r} /></>),
    },
    {
      id: "followups",
      label: "Follow-ups",
      word: "Follow-up",
      icon: ListChecks,
      titleKey: "task",
      boardBy: "status",
      dateKey: "due",
      fields: [
        { key: "task", label: "Follow-up", type: "text", width: 360 },
        { key: "call", label: "From call", type: "relation", to: { project: "calls", collection: "calls" }, width: 260 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "owner", label: "Owner", type: "person" },
        { key: "due", label: "Due", type: "date" },
        { key: "status", label: "Status", type: "status", options: FU_STATUS },
        { key: "heard", label: "Heard at", type: "text", width: 100, computed: true },
      ],
      records: FOLLOWUPS,
      view: "board",
      lists: [{ id: "open", name: "Not done", filter: (r) => r.status !== "Done", star: true }],
    },
  ],
  agents: [
    {
      id: "listener",
      name: "Call reviewer",
      does: "Reads each new call recording, writes a short summary, pulls out what was promised with the moment it was said, and checks the call against the firm's phone rules.",
      skills: ["Summaries a paralegal can read in 20 seconds", "Action items with timestamps", "Compliance check: identity, disclosure, advice, promises, medical details"],
      runs: [
        { when: "12 Oct, 06:15", what: "Looked for new recordings", result: "0 new · 1 still missing", tone: "red" },
        { when: "9 Oct, 18:00", what: "Reviewed 4 calls", result: "3 summarized · 1 recording missing", tone: "yellow" },
        { when: "8 Oct, 18:00", what: "Reviewed 1 call", result: "1 flagged for attorney", tone: "yellow" },
      ],
      may: ["Summarize a call and list action items", "Propose follow-ups for staff to approve", "Flag a call for an attorney"],
      mayNot: ["Decide whether legal advice was given", "Contact a client", "Mark a call reviewed without a recording"],
    },
  ],
  automations: [
    { id: "call-review", sentence: "Every evening at 18:00, review the day's recorded calls", trigger: "Daily at 18:00", next: "12 Oct, 18:00", on: true, agent: "listener" },
    { id: "flag-attorney", sentence: "When a call is flagged, add it to the assigned attorney's review list", trigger: "When a call is flagged for attorney", next: "On the next flag", on: true },
  ],
  allowed: [
    { text: "Alpha may summarize recorded calls and list what was promised.", why: "Every summary links back to the moment in the recording." },
    { text: "Alpha may propose follow-ups from a call.", why: "Staff approve each one before it becomes a task." },
    { text: "Alpha may flag a call for an attorney's review.", why: "A flag reaches only the firm; an attorney decides." },
  ],
  denied: [
    { text: "Alpha may not decide whether a call broke a rule.", why: "That's a legal judgement; an attorney makes it." },
    { text: "Alpha may not contact a client about a call.", why: "Nothing leaves the firm without a person's Approve." },
    { text: "Alpha may not treat a call with no recording as checked.", why: "A missing recording is a gap, not a pass." },
  ],
  kept: [
    { what: "Recordings and transcripts", where: "Write-once storage, kept unchanged with a fingerprint" },
    { what: "Read from", where: "The firm's phone system, via its recording export — connection needs attention" },
    { what: "Follow-ups", where: "This project, linked to the call and the moment it was heard" },
  ],
  files: [
    { name: "Call review summary — week of 5 Oct 2026.pdf", by: "Alpha", when: "9 Oct, 18:05", size: "84 KB" },
    { name: "Phone rules checklist (2026).docx", by: "Jordan Hale", when: "14 Sep, 11:20", size: "28 KB" },
  ],
  about: "Call reviews turn recorded client calls into a short summary, a list of follow-ups with the moment each was promised, and a check against the firm's phone rules. Possible issues go to an attorney. The phone system connection currently needs attention: one recording from 9 Oct is missing, and that call is marked as not checked.",
};

export const callsExtras: Extras = {
  proposals: [
    {
      id: "pr-calls-fu-501",
      project: "calls",
      task: "Create 2 follow-ups from Angela Morrison's call on 9 Oct",
      outcome: "Maria Alvarez gets two tasks: resend the portal link (due 13 Oct) and add the new medication to the claimant statement draft (due 20 Oct).",
      judged: "Both were said on the call, at 03:12 and 07:48.",
      reaches: "Stays in the firm; reaches nobody.",
      undo: "Delete the follow-ups from their pages.",
      roles: ["assistant", "owner"],
      recordLink: href.record("calls", "calls", "cl-501"),
      state: "open",
    },
    {
      id: "pr-calls-flag-502",
      project: "calls",
      task: "Ask Daniel Brooks to review Sam Okafor's call with Jerome Washington",
      outcome: "The call goes on Daniel's review list with the moment at 06:21, and a follow-up for him to call Jerome.",
      judged: "Daniel marks the call reviewed after listening.",
      reaches: "Stays in the firm; reaches nobody.",
      undo: "Remove it from Daniel's review list.",
      roles: ["owner"],
      recordLink: href.record("calls", "calls", "cl-502"),
      state: "open",
    },
  ],
  due: [
    { id: "d-calls-fu3", title: "Call Heartland Cardiology Group about Jerome Washington's APS", when: "9 Oct 2026", bucket: "overdue", link: href.record("calls", "followups", "fu-3"), roles: ["assistant"] },
    { id: "d-calls-fu1", title: "Resend the portal link to Angela Morrison", when: "13 Oct 2026", bucket: "upcoming", link: href.record("calls", "followups", "fu-1"), roles: ["assistant"] },
  ],
  activity: [
    { id: "a-c1", when: "12 Oct, 06:15", who: "Alpha", what: "Recording for Brenda Foster's 9 Oct call still missing — phone system needs attention", link: href.record("calls", "calls", "cl-503"), failed: true },
    { id: "a-c2", when: "8 Oct, 18:05", who: "Alpha", what: "Flagged Jerome Washington's call for an attorney", link: href.record("calls", "calls", "cl-502") },
    { id: "a-c3", when: "9 Oct, 18:05", who: "Alpha", what: "Proposed 2 follow-ups from Angela Morrison's call", link: href.record("calls", "calls", "cl-501") },
  ],
  conversation: [
    { who: "you", text: "What came out of Angela's call on Friday?" },
    { who: "alpha", text: "She couldn't find the Unum items in her portal — she said so at 03:12. She also mentioned a new medication since September, which belongs in her claimant statement. One more thing: Brenda Foster's call that afternoon has no recording, so I haven't checked it.", source: "Read call cl-501 · 14 min recording · Call reviewer agent" },
    { who: "alpha", proposal: "pr-calls-fu-501" },
  ],
};
