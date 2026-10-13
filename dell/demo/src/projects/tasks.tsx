import { CalendarClock, FileText, Hourglass, ListChecks, Mail, TriangleAlert, Users } from "lucide-react";
import { Card, Pill } from "../kit";
import { fmtDate } from "../data/format";
import { href } from "../data/route";
import { useWorld } from "../data/store";
import type { Project, Rec } from "../data/types";
import type { Extras } from "./extras";

/* Task manager: the firm's daily work queue across every module. Sample data — invented.
   Tasks are how work gets done, never proof that it was done: closing a task never counts
   as a submission. Overdue means the internal target has passed (today is 12 Oct 2026). */

const TODAY = "2026-10-12";
const WEEK_END = "2026-10-18";

const STATUS = [
  { value: "To do", tone: "gray" as const },
  { value: "In progress", tone: "blue" as const },
  { value: "Waiting", tone: "yellow" as const },
  { value: "Blocked", tone: "red" as const },
  { value: "Done", tone: "green" as const, done: true },
];

const KIND = [
  { value: "Benefits", tone: "blue" as const },
  { value: "Intake", tone: "green" as const },
  { value: "Appeal", tone: "yellow" as const },
  { value: "Finance", tone: "gray" as const },
  { value: "Medical", tone: "blue" as const },
  { value: "Call", tone: "gray" as const },
];

const PRIORITY = [
  { value: "Urgent", tone: "red" as const },
  { value: "High", tone: "yellow" as const },
  { value: "Normal", tone: "gray" as const },
];

const open = (r: Rec) => r.status !== "Done";
const overdue = (r: Rec) => open(r) && String(r.target) < TODAY;
const thisWeek = (r: Rec) => open(r) && String(r.target) <= WEEK_END;

const task = (id: string, title: string, client: string, kind: string, owner: string, priority: string, target: string, deadline: string, status: string, source: string, extra: Partial<Rec> = {}): Rec => ({ id, title, client, kind, owner, priority, target, deadline, status, source, ...extra });

const TASKS: Rec[] = [
  task("t-101", "Check Angela Morrison's portal answers for the updated APS", "c-1042", "Benefits", "Maria Alvarez", "High", "2026-10-23", "2026-11-15", "In progress", "Created by Alpha from request rq-10245", {
    request: "rq-10245", obligation: "ob-1", _prov: { deadline: { kind: "source", note: "Quoted from Unum's email of 8 Oct 2026: “please provide by November 15, 2026”" }, target: { kind: "assumed", note: "Set one week before the obligation's internal target so the physician has time to sign" } },
  }),
  task("t-102", "Review claimant statement changes — Angela Morrison", "c-1042", "Benefits", "Maria Alvarez", "Normal", "2026-10-16", "2026-11-15", "Waiting", "Created by Alpha from request rq-10245", { request: "rq-10245", obligation: "ob-2", waitingOn: "Angela Morrison (portal)" }),
  task("t-103", "Confirm Angela Morrison signed the medical authorization", "c-1042", "Benefits", "Maria Alvarez", "Normal", "2026-10-14", "2026-11-15", "Waiting", "Created by Alpha from request rq-10245", { request: "rq-10245", obligation: "ob-3", waitingOn: "Angela Morrison (portal)" }),
  task("t-104", "Get the cardiology APS signed — Jerome Washington", "c-1036", "Medical", "Sam Okafor", "Urgent", "2026-10-06", "2026-10-13", "Blocked", "Created by Alpha from request rq-10238", {
    request: "rq-10238", obligation: "ob-5", waitingOn: "Dr. Peter Lindqvist's office", blockedBy: "The prefilled APS was faxed 2 Oct; the office has not returned it signed",
  }),
  task("t-105", "Approve and send the signed authorization to Sun Life — Tanya Brooks", "c-1031", "Benefits", "Maria Alvarez", "High", "2026-10-12", "2026-10-15", "To do", "Created by Alpha from request rq-10233", { request: "rq-10233", obligation: "ob-10" }),
  task("t-106", "Draft appeal outline — Denise Walker (Lincoln)", "c-1011", "Appeal", "Elena Ruiz", "High", "2026-10-09", "2026-10-30", "In progress", "Created by Alpha from the appeal deadline on Denise Walker's case", {
    _prov: { deadline: { kind: "source", note: "180 days from Lincoln's denial letter dated 3 May 2026, as stated in the letter" } },
  }),
  task("t-107", "Request the full claim file from Lincoln — Denise Walker", "c-1011", "Appeal", "Sam Okafor", "Normal", "2026-10-05", "2026-10-30", "Done", "Created by Alpha from the appeal deadline on Denise Walker's case"),
  task("t-108", "Confirm appeal deadline and calendar it — Carlos Mendoza (Prudential)", "c-1061", "Appeal", "Daniel Brooks", "High", "2026-10-16", "2026-12-04", "To do", "Created by Alpha from Prudential's denial letter, filed 9 Oct 2026", {
    _prov: { deadline: { kind: "estimated", note: "Alpha counted 180 days from the letter date; an attorney confirms the date" } },
  }),
  task("t-109", "Run October fee statements", "", "Finance", "Karen Liu", "Normal", "2026-10-15", "", "In progress", "Created by Alpha from the monthly statement schedule"),
  task("t-110", "Intake consult — Patricia Young (Aetna)", "c-1047", "Intake", "Priya Shah", "High", "2026-10-13", "", "To do", "Created by Alpha from the intake form sent 10 Oct 2026"),
  task("t-111", "Return Gregory Patel's call about his MetLife records", "c-1003", "Call", "Maria Alvarez", "Normal", "2026-10-12", "", "To do", "Created by Alpha from a call on 9 Oct 2026, 16:20"),
  task("t-112", "Build the medical records index — Gregory Patel", "c-1003", "Benefits", "Maria Alvarez", "High", "2026-10-16", "2026-10-20", "In progress", "Created by Alpha from request rq-10251", { request: "rq-10251", obligation: "ob-4" }),
  task("t-113", "Review the AI-drafted work history form — Howard Kim", "c-1050", "Benefits", "Maria Alvarez", "Normal", "2026-10-22", "2026-11-06", "To do", "Created by Alpha from request rq-10247", { request: "rq-10247", obligation: "ob-8" }),
  task("t-114", "Check Marcus Hill's ADL questionnaire when it comes in", "c-1017", "Benefits", "Maria Alvarez", "Normal", "2026-10-21", "2026-10-28", "Waiting", "Created by Alpha from request rq-10240", { request: "rq-10240", obligation: "ob-6", waitingOn: "Marcus Hill (portal)" }),
];

/* Workload is counted from the queue above so the two never disagree. */
const staff = (id: string, person: string, role: string, capacity: number, note: string): Rec => {
  const mine = TASKS.filter((t) => t.owner === person);
  return { id, person, role, open: mine.filter(open).length, overdue: mine.filter(overdue).length, capacity, _prov: { capacity: { kind: "estimated", note } } };
};

const WORKLOAD: Rec[] = [
  staff("w-maria", "Maria Alvarez", "Legal assistant", 112, "Open tasks weighted by priority and remaining steps, against a 40-hour week"),
  staff("w-sam", "Sam Okafor", "Legal assistant", 68, "Open tasks weighted by priority and remaining steps, against a 40-hour week"),
  staff("w-elena", "Elena Ruiz", "Attorney", 74, "Includes 2 hearing days on her calendar this week"),
  staff("w-daniel", "Daniel Brooks", "Attorney", 61, "Includes the Robert Nguyen litigation filings on his calendar"),
  staff("w-priya", "Priya Shah", "Intake", 55, "Open tasks plus booked consults this week"),
  staff("w-karen", "Karen Liu", "Finance", 80, "Statement run usually takes two working days"),
  staff("w-jordan", "Jordan Hale", "Owner", 40, "Tasks only; client meetings are not counted"),
];

function WhyTask({ rec }: { rec: Rec }) {
  const req = rec.request ? String(rec.request) : "";
  const obl = rec.obligation ? String(rec.obligation) : "";
  return (
    <Card title="Why this task exists" info="Every task Alpha creates points back to where it came from. A task is how the work gets done, not proof that it was done: closing a task never counts as a submission.">
      <ul className="steps">
        <li className="ok"><Mail aria-hidden /><span><strong>Source</strong> — {req ? <a href={href.record("benefits", "requests", req)}>{String(rec.source)}</a> : String(rec.source)}</span></li>
        {obl && <li className="ok"><FileText aria-hidden /><span><strong>Obligation</strong> — <a href={href.record("benefits", "obligations", obl)}>{obl}</a>, insurer deadline {fmtDate(String(rec.deadline))}</span></li>}
        <li><ListChecks aria-hidden /><span><strong>This task</strong> — {String(rec.title)}, target {fmtDate(String(rec.target))}</span></li>
        {rec.blockedBy && <li><TriangleAlert aria-hidden /><span><strong>Blocked</strong> — {String(rec.blockedBy)}</span></li>}
        {rec.waitingOn && <li><Hourglass aria-hidden /><span><strong>Waiting on</strong> — {String(rec.waitingOn)}</span></li>}
      </ul>
      <p className="meta" style={{ marginTop: 10 }}>{obl ? "Marking this task done does not close the obligation. Only a documented submission does." : "When this task is done, the record it came from is updated by a person, not by the task."}</p>
    </Card>
  );
}

function TaskMix({ rec }: { rec: Rec }) {
  const w = useWorld();
  const mine = w.rows("tasks", "queue").filter((t) => t.owner === rec.person && open(t));
  const counts = KIND.map((k) => ({ kind: k.value, tone: k.tone, n: mine.filter((t) => t.kind === k.value).length })).filter((c) => c.n);
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <Card title="Task mix" info="Open tasks in the queue by kind. Capacity is Alpha's estimate; the Planner uses it to suggest who should take new work.">
      {counts.length ? (
        <table className="mini">
          <tbody>
            {counts.map((c) => (
              <tr key={c.kind}>
                <td style={{ width: 120 }}><Pill tone={c.tone}>{c.kind}</Pill></td>
                <td><div className="bar"><div className="bar__fill" style={{ width: `${(c.n / max) * 100}%` }} /></div></td>
                <td className="td--num meta" style={{ width: 60 }}>{c.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">No open tasks.</p>
      )}
      <p className="meta" style={{ marginTop: 10 }}><a href={href.project("tasks", "queue")}>Open the queue →</a></p>
    </Card>
  );
}

export const tasks: Project = {
  id: "tasks",
  name: "Task manager",
  icon: ListChecks,
  summary: "The firm's daily work queue across every module, with owners, targets and where each task came from.",
  collections: [
    {
      id: "queue",
      label: "Queue",
      word: "Task",
      icon: ListChecks,
      titleKey: "title",
      view: "dashboard",
      boardBy: "status",
      dateKey: "target",
      fields: [
        { key: "title", label: "Task", type: "text", width: 360 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "kind", label: "Kind", type: "choice", options: KIND, width: 120 },
        { key: "status", label: "Status", type: "status", options: STATUS, width: 140 },
        { key: "owner", label: "Owner", type: "person" },
        { key: "priority", label: "Priority", type: "choice", options: PRIORITY, width: 110 },
        { key: "target", label: "Internal target", type: "date" },
        { key: "deadline", label: "Insurer or legal deadline", type: "date" },
        { key: "source", label: "Source", type: "text", width: 320, hidden: true, computed: true },
        { key: "request", label: "Request", type: "relation", to: { project: "benefits", collection: "requests" }, hidden: true },
        { key: "obligation", label: "Obligation", type: "relation", to: { project: "benefits", collection: "obligations" }, hidden: true },
      ],
      records: TASKS,
      lists: [
        { id: "mine", name: "My tasks", filter: (r) => r.owner === "Maria Alvarez" && open(r), star: true },
        { id: "week", name: "Due this week", filter: thisWeek },
        { id: "blocked", name: "Blocked", filter: (r) => r.status === "Blocked" },
      ],
      metrics: [
        { label: "Open", icon: ListChecks, value: (r) => r.filter(open).length, basis: (r) => `of ${r.length} tasks`, filter: open },
        { label: "Overdue", icon: TriangleAlert, value: (r) => r.filter(overdue).length, basis: () => "internal target before 12 Oct 2026", attention: (r) => r.some(overdue), filter: overdue },
        { label: "Due this week", icon: CalendarClock, value: (r) => r.filter(thisWeek).length, basis: () => "target on or before 18 Oct 2026", filter: thisWeek },
        { label: "Waiting on someone else", icon: Hourglass, value: (r) => r.filter((x) => x.status === "Waiting").length, basis: () => "clients, physicians or insurers", filter: (x) => x.status === "Waiting" },
      ],
      sections: (r) => <WhyTask rec={r} />,
    },
    {
      id: "workload",
      label: "Workload",
      word: "Person",
      icon: Users,
      titleKey: "person",
      fields: [
        { key: "person", label: "Person", type: "person", width: 200 },
        { key: "role", label: "Role", type: "text", width: 160 },
        { key: "open", label: "Open tasks", type: "number", width: 120, computed: true },
        { key: "overdue", label: "Overdue", type: "number", width: 110, computed: true },
        { key: "capacity", label: "Capacity", type: "percent", width: 130, computed: true },
      ],
      records: WORKLOAD,
      notice: "Counted from the queue each morning. Over 100% means more work than the week holds.",
      noAdd: "Staff are added in Settings; this list follows the people there",
      sections: (r) => <TaskMix rec={r} />,
    },
  ],
  agents: [
    {
      id: "planner",
      name: "Planner",
      does: "Turns confirmed obligations, deadlines and intake forms into tasks with an owner and an internal target, and watches workload so nobody is buried.",
      skills: ["Task creation from confirmed obligations, appeal deadlines and intake forms", "Internal targets set ahead of insurer and legal deadlines", "Workload balancing by capacity and role"],
      runs: [
        { when: "12 Oct, 06:10", what: "Checked the queue against workload", result: "Maria at 112% · 1 proposal", tone: "yellow" },
        { when: "9 Oct, 16:30", what: "Created 2 tasks from Prudential's letter and a client call", result: "2 created", tone: "green" },
        { when: "8 Oct, 09:25", what: "Created 3 tasks from Unum request #10245", result: "3 created · owner Maria Alvarez", tone: "green" },
      ],
      may: ["Create tasks from obligations a person has confirmed", "Set internal targets ahead of deadlines", "Propose reassignments"],
      mayNot: ["Reassign work without a person's Approve", "Mark a task done", "Count a closed task as a submission"],
    },
  ],
  automations: [
    { id: "morning-plan", sentence: "Every weekday at 06:10, check the queue against capacity and flag anyone over 100%", trigger: "Weekdays at 06:10", next: "13 Oct, 06:10", on: true, agent: "planner" },
    { id: "obligation-task", sentence: "When an obligation is confirmed, create a task for its owner with a target ahead of the deadline", trigger: "When an obligation is confirmed in Ongoing benefits", next: "On the next confirmation", on: true, agent: "planner" },
    { id: "overdue-alert", sentence: "When a task passes its internal target, tell its owner and the supervising attorney", trigger: "When a task becomes overdue", next: "13 Oct, 07:00", on: true },
  ],
  allowed: [
    { text: "Alpha may create a task from an obligation a person has confirmed.", why: "The obligation was already checked against the insurer's letter." },
    { text: "Alpha may set an internal target ahead of a deadline.", why: "Targets are internal and staff can move them at any time." },
    { text: "Alpha may propose moving tasks between people.", why: "The move only happens after a person Approves it." },
  ],
  denied: [
    { text: "Alpha may not reassign a task without a person's Approve.", why: "Who does the work is a supervisor's call." },
    { text: "Alpha may not treat a closed task as a submission.", why: "Only a documented submission closes an obligation." },
    { text: "Alpha may not set or change a legal deadline on its own.", why: "Deadlines are a legal judgement; an attorney confirms them." },
  ],
  kept: [
    { what: "Tasks and their history", where: "The firm's workspace, with every change and who made it" },
    { what: "Read from", where: "Ongoing benefits obligations, appeal deadlines, intake forms and call reviews" },
    { what: "Capacity estimates", where: "Recomputed each morning; never shared outside the firm" },
  ],
  files: [
    { name: "Workload summary — week of 12 Oct 2026.pdf", by: "Alpha", when: "12 Oct, 06:12", size: "84 KB" },
    { name: "Overdue tasks — 12 Oct 2026.csv", by: "Alpha", when: "12 Oct, 06:12", size: "3 KB" },
  ],
  about: "This is where everyone starts the day. Tasks come from every module — insurer requests, appeals, intake, finance and calls — each with an owner, an internal target and a link back to its source. The Planner keeps targets ahead of deadlines and suggests moving work when someone is over capacity.",
};

export const tasksExtras: Extras = {
  proposals: [
    {
      id: "pr-tasks-reassign",
      project: "tasks",
      task: "Move 2 tasks from Maria Alvarez to Sam Okafor",
      outcome: "Howard Kim's work history review and Angela Morrison's authorization check go to Sam. Maria drops to about 92%, Sam rises to about 86%.",
      judged: "Maria is at 112% this week; Sam is at 68% and handles the same kinds of tasks.",
      reaches: "Stays in the firm; reaches nobody.",
      undo: "Each task can be moved back from its page.",
      roles: ["assistant"],
      recordLink: href.record("tasks", "workload", "w-maria"),
      state: "open",
    },
    {
      id: "pr-tasks-escalate",
      project: "tasks",
      task: "Ask Daniel Brooks to call Reliance about an extension for Jerome Washington",
      outcome: "A call task goes to Daniel today. The cardiology APS is due 13 Oct 2026 and Dr. Lindqvist's office hasn't signed it.",
      judged: "The task is 6 days past its target and blocked on the physician; asking for more time is an attorney's call.",
      reaches: "Stays in the firm; Daniel decides whether to call.",
      undo: "The new task can be deleted.",
      roles: ["owner", "attorney"],
      recordLink: href.record("tasks", "queue", "t-104"),
      state: "open",
    },
  ],
  due: [
    { id: "d-t106", title: "Appeal outline — Denise Walker", when: "9 Oct 2026", bucket: "overdue", link: href.record("tasks", "queue", "t-106"), roles: ["attorney", "owner"] },
    { id: "d-t109", title: "October fee statements", when: "15 Oct 2026", bucket: "upcoming", link: href.record("tasks", "queue", "t-109"), roles: ["finance"] },
  ],
  activity: [
    { id: "a-t1", when: "12 Oct, 06:10", who: "Alpha", what: "Flagged Maria Alvarez at 112% capacity this week", link: href.record("tasks", "workload", "w-maria") },
    { id: "a-t2", when: "9 Oct, 16:30", who: "Alpha", what: "Created a deadline task for Carlos Mendoza's appeal", link: href.record("tasks", "queue", "t-108") },
    { id: "a-t3", when: "8 Oct, 09:25", who: "Alpha", what: "Created 3 tasks from Unum request #10245", link: href.record("benefits", "requests", "rq-10245") },
    { id: "a-t4", when: "7 Oct, 11:02", who: "Sam Okafor", what: "Marked the Lincoln claim file request done", link: href.record("tasks", "queue", "t-107") },
  ],
  conversation: [
    { who: "you", text: "What should I worry about this week?" },
    { who: "alpha", text: "Two tasks are overdue: Jerome Washington's cardiology APS is blocked on Dr. Lindqvist's signature, and Denise Walker's appeal outline passed its target on 9 Oct. You're also at 112% with 8 open tasks.", source: "Read Queue · 14 tasks · Workload · Planner agent" },
    { who: "alpha", proposal: "pr-tasks-reassign" },
  ],
};
