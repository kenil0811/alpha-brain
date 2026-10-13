import { Banknote, Calculator, FileText, HandCoins, Landmark, Receipt, TriangleAlert } from "lucide-react";
import { Card, Pill } from "../kit";
import { fmtDate, money } from "../data/format";
import { href } from "../data/route";
import { useWorld } from "../data/store";
import type { Project, Rec } from "../data/types";
import type { Extras } from "./extras";

/* Finance: fees on ongoing benefits. Insurer pays the client's benefit into the trust account →
   Alpha matches it and works out the fee → a monthly statement → disbursements out.
   Sample data — invented. The rule that matters: money never moves without a person's Approve. */

const MATCH = [
  { value: "Matched", tone: "green" as const, done: true },
  { value: "Amount differs", tone: "yellow" as const },
];

const ST_STATUS = [
  { value: "Draft", tone: "yellow" as const },
  { value: "Approved", tone: "blue" as const },
  { value: "Sent", tone: "green" as const, done: true },
];

const DS_STATUS = [
  { value: "Waiting for approval", tone: "yellow" as const },
  { value: "Held", tone: "yellow" as const },
  { value: "Approved", tone: "blue" as const },
  { value: "Paid", tone: "green" as const, done: true },
];

const NAMES: Record<string, string> = {
  "c-1042": "Angela Morrison", "c-1003": "Gregory Patel", "c-1017": "Marcus Hill", "c-1020": "Linda Chen", "c-1031": "Tanya Brooks",
  "c-1039": "Sofia Ramirez", "c-1044": "Kevin O'Brien", "c-1050": "Howard Kim", "c-1052": "Brenda Foster", "c-1058": "Michelle Davis",
};

/** Expected monthly benefit (same as the client record), the gross before offsets, and what is offset. */
const rc = (client: string, insurer: string, date: string, amount: number, expected: number, gross: number, offset: number, offsetWhat: string, rate: number, extra: Partial<Rec> = {}): Rec => ({
  id: `rc-${client.slice(2)}-10`, title: `October benefit — ${NAMES[client]}`, client, insurer, date, amount, expected, gross, offset, offsetWhat, rate,
  match: amount === expected ? "Matched" : "Amount differs", fee: Math.round(amount * rate) / 100, ...extra,
});

const RECEIPTS: Rec[] = [
  rc("c-1042", "ins-unum", "2026-10-01", 4850, 4850, 6700, 1850, "Social Security disability (SSDI)", 25, { _prov: { offset: { kind: "source", note: "SSA award letter, 2024, in Angela Morrison's case file" }, rate: { kind: "source", note: "Fee agreement signed 14 Mar 2023: 25% of each monthly benefit payment" } } }),
  rc("c-1003", "ins-metlife", "2026-10-01", 3920, 3920, 5400, 1480, "Social Security disability (SSDI)", 25),
  rc("c-1017", "ins-hartford", "2026-10-02", 5310, 5310, 7100, 1790, "Social Security disability (SSDI)", 25),
  rc("c-1020", "ins-prudential", "2026-10-01", 2760, 2760, 4300, 1540, "Social Security disability (SSDI)", 25),
  rc("c-1031", "ins-sunlife", "2026-10-03", 3175, 3175, 4600, 1425, "Social Security disability (SSDI)", 25),
  rc("c-1039", "ins-guardian", "2026-10-02", 2490, 2490, 2490, 0, "None — SSDI claim still pending", 25),
  rc("c-1044", "ins-metlife", "2026-10-01", 4120, 4120, 5900, 1780, "Social Security disability (SSDI)", 25),
  rc("c-1050", "ins-lincoln", "2026-10-05", 3640, 3640, 5200, 1560, "Social Security disability (SSDI)", 20, { _prov: { rate: { kind: "source", note: "Older fee agreement signed 2 Dec 2019: 20% of each monthly benefit payment" } } }),
  rc("c-1052", "ins-unum", "2026-10-05", 2480, 2980, 4200, 1220, "Social Security disability (SSDI)", 25, {
    explain: "Unum may have started recovering an overpayment at $500 a month. The October explanation of benefits is in the Mailroom but not yet matched to Brenda Foster.",
    _prov: {
      explain: { kind: "estimated", note: "Alpha's best guess from the $500 gap and the unmatched Unum EOB (m-904). Not confirmed with Unum or the client." },
      fee: { kind: "estimated", note: "25% of what actually arrived. Held until a person confirms why the payment is short." },
    },
  }),
  rc("c-1058", "ins-newyorklife", "2026-10-02", 4460, 4460, 6100, 1640, "Social Security disability (SSDI)", 25),
];

const st = (id: string, client: string, period: string, benefit: number, fee: number, costs: number, status: string, sent: string, receipt = ""): Rec => ({
  id, title: `${period} statement — ${NAMES[client]}`, client, period, benefit, fee, costs, net: benefit - fee - costs, status, sent, receipt,
});

const STATEMENTS: Rec[] = [
  st("st-1042-10", "c-1042", "October 2026", 4850, 1212.5, 0, "Draft", "", "rc-1042-10"),
  st("st-1003-10", "c-1003", "October 2026", 3920, 980, 0, "Approved", "", "rc-1003-10"),
  st("st-1017-10", "c-1017", "October 2026", 5310, 1327.5, 45, "Draft", "", "rc-1017-10"),
  st("st-1020-10", "c-1020", "October 2026", 2760, 690, 0, "Approved", "", "rc-1020-10"),
  st("st-1031-10", "c-1031", "October 2026", 3175, 793.75, 0, "Draft", "", "rc-1031-10"),
  { ...st("st-1052-10", "c-1052", "October 2026", 2480, 620, 0, "Draft", "", "rc-1052-10"), _prov: { fee: { kind: "estimated", note: "Based on the short October payment; held until the $500 gap is explained" } } },
  st("st-1042-09", "c-1042", "September 2026", 4850, 1212.5, 0, "Sent", "2026-09-14"),
  st("st-1003-09", "c-1003", "September 2026", 3920, 980, 0, "Sent", "2026-09-14"),
  st("st-1017-09", "c-1017", "September 2026", 5310, 1327.5, 0, "Sent", "2026-09-15"),
  st("st-1052-09", "c-1052", "September 2026", 2980, 745, 0, "Sent", "2026-09-15"),
];

const ds = (id: string, title: string, payee: string, client: string, amount: number, method: string, status: string, approver: string, paid: string, extra: Partial<Rec> = {}): Rec => ({ id, title, payee, client, amount, method, status, approver, paid, ...extra });

const DISBURSEMENTS: Rec[] = [
  ds("ds-201", "September net benefit", "Angela Morrison", "c-1042", 3637.5, "ACH", "Paid", "Karen Liu", "2026-09-15"),
  ds("ds-202", "Records copy fee — Marcus Hill", "Gateway Neurology Associates", "c-1017", 45, "Check", "Paid", "Karen Liu", "2026-10-02"),
  ds("ds-203", "October net benefit", "Gregory Patel", "c-1003", 2940, "ACH", "Approved", "Karen Liu", ""),
  ds("ds-204", "October net benefit", "Linda Chen", "c-1020", 2070, "ACH", "Approved", "Karen Liu", ""),
  ds("ds-205", "October net benefit", "Angela Morrison", "c-1042", 3637.5, "ACH", "Waiting for approval", "", ""),
  ds("ds-206", "October net benefit", "Marcus Hill", "c-1017", 3937.5, "ACH", "Waiting for approval", "", ""),
  ds("ds-207", "October net benefit", "Tanya Brooks", "c-1031", 2381.25, "Check", "Waiting for approval", "", ""),
  ds("ds-208", "October net benefit", "Brenda Foster", "c-1052", 1860, "ACH", "Held", "", "", { _prov: { amount: { kind: "estimated", note: "October payment arrived $500 short; amount may change once the gap is explained" } } }),
  ds("ds-209", "October fees to the operating account", "Dell Disability Lawyers — operating account", "", 8499.25, "Transfer", "Waiting for approval", "", "", { _prov: { amount: { kind: "source", note: "Sum of the 9 matched October fees. Brenda Foster's $620 is left out until it's confirmed." } } }),
];

function FeeBreakdown({ rec }: { rec: Rec }) {
  const prov = rec._prov ?? {};
  const short = rec.match === "Amount differs";
  const row = (label: string, v: string, note?: string) => (
    <tr><td>{label}</td><td className="meta">{note ?? ""}</td><td className="td--num">{v}</td></tr>
  );
  return (
    <Card title="How the fee was worked out" info="The fee is a share of the benefit the client actually receives, after offsets like Social Security disability. Alpha works it out; Finance approves it before anything moves.">
      <table className="mini">
        <tbody>
          {row("Gross monthly benefit", money(Number(rec.gross)), "From the policy and the insurer's last explanation of benefits")}
          {row("Offset", `− ${money(Number(rec.offset))}`, prov.offset?.note ?? String(rec.offsetWhat))}
          {row("Expected payment", money(Number(rec.expected)), "Matches the monthly benefit on the client record")}
          {row("Received in trust", money(Number(rec.amount)), `Deposited ${fmtDate(String(rec.date))}`)}
          {row("Fee rate", `${String(rec.rate)}%`, prov.rate?.note ?? "Fee agreement: 25% of each monthly benefit payment")}
          <tr><td><strong>Fee due</strong></td><td>{short ? <Pill tone="yellow">Estimated — held</Pill> : <Pill tone="green">Matched</Pill>}</td><td className="td--num"><strong>{money(Number(rec.fee))}</strong></td></tr>
        </tbody>
      </table>
      {short ? (
        <>
          <p className="meta" style={{ marginTop: 10 }}><TriangleAlert aria-hidden size={14} /> {money(Number(rec.expected) - Number(rec.amount))} less than expected. Alpha's explanation (estimated):</p>
          <p className="quote">{String(rec.explain)}</p>
          <p className="meta" style={{ marginTop: 10 }}><a href={href.record("benefits", "mailroom", "m-904")}>See the unmatched Unum EOB →</a></p>
        </>
      ) : null}
    </Card>
  );
}

function LineItems({ rec }: { rec: Rec }) {
  const w = useWorld();
  const receipt = w.rows("finance", "receipts").find((r) => r.id === rec.receipt);
  const costs = Number(rec.costs);
  return (
    <Card title="Statement lines" info="What the client sees on their monthly statement. Only an approved statement is sent, through the client portal.">
      <table className="mini">
        <thead><tr><th>Line</th><th className="td--num">Amount</th></tr></thead>
        <tbody>
          <tr><td>Benefit received from the insurer{receipt ? <> · <a href={href.record("finance", "receipts", receipt.id)}>{fmtDate(String(receipt.date))}</a></> : null}</td><td className="td--num">{money(Number(rec.benefit))}</td></tr>
          <tr><td>Attorney fee</td><td className="td--num">− {money(Number(rec.fee))}</td></tr>
          {costs ? <tr><td>Case costs — medical records copy fee</td><td className="td--num">− {money(costs)}</td></tr> : null}
          <tr><td><strong>Paid to you</strong></td><td className="td--num"><strong>{money(Number(rec.net))}</strong></td></tr>
        </tbody>
      </table>
      {receipt?.match === "Amount differs" ? (
        <p className="meta" style={{ marginTop: 10 }}><Pill tone="yellow">Amount differs</Pill> The October payment was {money(Number(receipt.expected) - Number(receipt.amount))} short. This statement stays a draft until someone confirms why.</p>
      ) : null}
    </Card>
  );
}

const sum = (rows: Rec[], key: string) => rows.reduce((n, r) => n + Number(r[key] ?? 0), 0);

export const finance: Project = {
  id: "finance",
  name: "Finance",
  icon: Landmark,
  summary: "Benefit payments received in trust, fees worked out, monthly statements and payments out.",
  collections: [
    {
      id: "receipts",
      label: "Receipts",
      word: "Receipt",
      icon: Receipt,
      titleKey: "title",
      boardBy: "match",
      dateKey: "date",
      fields: [
        { key: "title", label: "Receipt", type: "text", width: 280 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "insurer", label: "Insurer", type: "relation", to: { project: "network", collection: "insurers" } },
        { key: "amount", label: "Amount", type: "money", width: 130 },
        { key: "date", label: "Received", type: "date" },
        { key: "match", label: "Match", type: "status", options: MATCH, width: 160, computed: true },
        { key: "fee", label: "Fee due", type: "money", width: 130, computed: true },
        { key: "expected", label: "Expected", type: "money", hidden: true, computed: true },
        { key: "rate", label: "Fee rate", type: "percent", hidden: true },
        { key: "gross", label: "Gross benefit", type: "money", hidden: true },
        { key: "offset", label: "Offset", type: "money", hidden: true },
        { key: "explain", label: "Alpha's explanation", type: "longtext", hidden: true, computed: true },
      ],
      records: RECEIPTS,
      lists: [
        { id: "oct", name: "October 2026", filter: (r) => String(r.date).startsWith("2026-10"), star: true },
        { id: "check", name: "Amount differs", filter: (r) => r.match === "Amount differs" },
      ],
      metrics: [
        { label: "Received in trust", icon: Banknote, value: (r) => money(sum(r, "amount")), basis: (r) => `${r.length} benefit payments in October` },
        { label: "Fees due", icon: HandCoins, value: (r) => money(sum(r.filter((x) => x.match === "Matched"), "fee")), basis: () => "matched payments only" },
        { label: "Amount differs", icon: TriangleAlert, value: (r) => r.filter((x) => x.match === "Amount differs").length, basis: () => "payment not what we expected", attention: (r) => r.some((x) => x.match === "Amount differs"), filter: (x) => x.match === "Amount differs" },
      ],
      notice: "Deposits are read from the trust account statement each morning. Alpha never moves money.",
      noAdd: "Receipts come from the trust account statement; they can't be added by hand",
      sections: (r) => <FeeBreakdown rec={r} />,
    },
    {
      id: "statements",
      label: "Statements",
      word: "Statement",
      icon: FileText,
      titleKey: "title",
      boardBy: "status",
      fields: [
        { key: "title", label: "Statement", type: "text", width: 300 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "period", label: "Period", type: "text", width: 140 },
        { key: "benefit", label: "Benefit", type: "money", width: 120 },
        { key: "fee", label: "Fee", type: "money", width: 120 },
        { key: "net", label: "To client", type: "money", width: 120, computed: true },
        { key: "status", label: "Status", type: "status", options: ST_STATUS },
        { key: "sent", label: "Sent", type: "date" },
        { key: "costs", label: "Case costs", type: "money", hidden: true },
        { key: "receipt", label: "Receipt", type: "relation", to: { project: "finance", collection: "receipts" }, hidden: true },
      ],
      records: STATEMENTS,
      lists: [{ id: "unsent", name: "Not sent yet", filter: (r) => r.status !== "Sent", star: true }],
      sections: (r) => <LineItems rec={r} />,
    },
    {
      id: "disbursements",
      label: "Disbursements",
      word: "Disbursement",
      icon: Calculator,
      titleKey: "title",
      boardBy: "status",
      fields: [
        { key: "title", label: "Payment", type: "text", width: 280 },
        { key: "payee", label: "Payee", type: "text", width: 260 },
        { key: "client", label: "Client", type: "relation", to: { project: "network", collection: "clients" } },
        { key: "amount", label: "Amount", type: "money", width: 130 },
        { key: "method", label: "Method", type: "choice", options: [{ value: "ACH", tone: "blue" }, { value: "Check", tone: "gray" }, { value: "Transfer", tone: "gray" }] },
        { key: "status", label: "Approval", type: "status", options: DS_STATUS, width: 200 },
        { key: "approver", label: "Approved by", type: "person" },
        { key: "paid", label: "Paid", type: "date" },
      ],
      records: DISBURSEMENTS,
      lists: [{ id: "approve", name: "Needs approval", filter: (r) => r.status === "Waiting for approval", star: true }],
      noAdd: "Disbursements are made from an approved statement",
    },
  ],
  agents: [
    {
      id: "ledger",
      name: "Trust ledger",
      does: "Reads each morning's trust deposits, matches them to clients, checks them against the expected monthly benefit, works out the fee and drafts statements and payments for Finance to approve.",
      skills: ["Matching deposits to clients by insurer, claim number and amount", "Fee calculation from the signed fee agreement", "Spotting payments that don't match and suggesting why"],
      runs: [
        { when: "10 Oct, 06:30", what: "Drafted 6 October statements", result: "6 drafts · 1 held", tone: "yellow" },
        { when: "5 Oct, 06:30", what: "Read 2 new deposits", result: "1 matched · 1 amount differs", tone: "yellow" },
        { when: "3 Oct, 06:30", what: "Read 1 new deposit", result: "1 matched", tone: "green" },
      ],
      may: ["Match a deposit when insurer, client and amount all agree", "Work out the fee from the signed agreement", "Draft statements and payments"],
      mayNot: ["Approve or send a payment", "Send a statement to a client", "Change a fee rate"],
    },
  ],
  automations: [
    { id: "deposit-read", sentence: "Every morning at 06:30, read new trust deposits and work out the fee", trigger: "Daily at 06:30", next: "13 Oct, 06:30", on: true, agent: "ledger" },
    { id: "statement-draft", sentence: "On the 10th of each month, draft statements for every matched payment", trigger: "Monthly on the 10th", next: "10 Nov, 06:30", on: true, agent: "ledger" },
  ],
  allowed: [
    { text: "Alpha may match a trust deposit to a client when insurer, claim and amount agree.", why: "Each match is checked again when Finance approves the statement." },
    { text: "Alpha may work out fees from the signed fee agreement.", why: "The rate is read from the agreement, never guessed." },
    { text: "Alpha may draft statements and payments.", why: "Drafts move no money and reach nobody." },
  ],
  denied: [
    { text: "Alpha may not approve or send any payment.", why: "Trust money moves only on a person's Approve." },
    { text: "Alpha may not take a fee from a payment that doesn't match.", why: "The fee stays held until someone confirms why the amount changed." },
    { text: "Alpha may not send a statement to a client.", why: "Statements go out only after Finance approves them." },
  ],
  kept: [
    { what: "Trust deposits", where: "Read from the trust account bank feed (read-only)" },
    { what: "Fee agreements", where: "Each client's case file, signed copy" },
    { what: "Statements and payments", where: "The trust ledger, with who approved and when" },
  ],
  files: [
    { name: "Trust reconciliation — September 2026.pdf", by: "Karen Liu", when: "2 Oct, 16:10", size: "248 KB" },
    { name: "October statements — drafts.zip", by: "Alpha", when: "10 Oct, 06:35", size: "1.1 MB" },
  ],
  about: "Finance tracks the monthly benefit payments that arrive in trust for ongoing-benefits clients, works out the firm's fee from each client's agreement, and drafts statements and payments. Finance approves every one; Alpha flags any payment that isn't what the client record expects.",
};

export const financeExtras: Extras = {
  proposals: [
    {
      id: "pr-finance-disb-oct",
      project: "finance",
      task: "Pay 3 October net benefits — Angela Morrison, Marcus Hill, Tanya Brooks",
      outcome: "$9,956.25 leaves the trust account: two ACH payments and one check. Each statement is marked ready to send.",
      judged: "Each payment matches its approved fee calculation and the bank confirms the transfer.",
      payload: "Angela Morrison · ACH · $3,637.50\nMarcus Hill · ACH · $3,937.50 (after $45 records fee)\nTanya Brooks · check · $2,381.25",
      reaches: "Reaches someone: it asks every time.",
      undo: "Cannot be undone once the bank sends it.",
      roles: ["finance", "owner"],
      recordLink: href.project("finance", "disbursements"),
      state: "open",
    },
    {
      id: "pr-finance-hold-1052",
      project: "finance",
      task: "Keep Brenda Foster's October fee on hold and ask Unum about the $500 gap",
      outcome: "The $620 fee and her payment stay held. Sam Okafor gets a task to match the Unum EOB and call Unum.",
      judged: "The gap is explained in writing by Unum and the amounts are updated.",
      reaches: "Stays in the firm; reaches nobody.",
      undo: "Release the hold from the receipt page.",
      roles: ["finance", "owner"],
      recordLink: href.record("finance", "receipts", "rc-1052-10"),
      state: "open",
    },
  ],
  due: [
    { id: "d-fin-1052", title: "Brenda Foster's October payment is $500 short", when: "12 Oct 2026", bucket: "today", link: href.record("finance", "receipts", "rc-1052-10"), roles: ["finance", "owner"] },
    { id: "d-fin-st", title: "Approve October client statements", when: "15 Oct 2026", bucket: "upcoming", link: href.project("finance", "statements"), roles: ["finance"] },
  ],
  activity: [
    { id: "a-fin1", when: "10 Oct, 06:35", who: "Alpha", what: "Drafted 6 October statements", link: href.project("finance", "statements") },
    { id: "a-fin2", when: "5 Oct, 06:30", who: "Alpha", what: "Flagged Brenda Foster's Unum payment — $500 less than expected", link: href.record("finance", "receipts", "rc-1052-10") },
    { id: "a-fin3", when: "9 Oct, 14:20", who: "Karen Liu", what: "Approved October payments for Gregory Patel and Linda Chen", link: href.project("finance", "disbursements") },
  ],
  conversation: [
    { who: "you", text: "Anything odd in October's trust deposits?" },
    { who: "alpha", text: "Ten benefit payments came in. Nine match the client record. Brenda Foster's Unum payment is $2,480, not $2,980. My guess is Unum started recovering an overpayment, but that's not confirmed — her October EOB isn't matched yet.", source: "Read Receipts · 10 deposits · Trust ledger agent" },
    { who: "alpha", proposal: "pr-finance-hold-1052" },
  ],
};
