import type { Activity, Due, Proposal, Role, Tone } from "./types";
import { EXTRAS } from "../projects/registry";
import type { Turn } from "../projects/extras";

export type { Turn };

/* Everything Home, the assistant and Intelligence show, gathered from the projects' extras.
   Sample data — invented. */

const all = Object.values(EXTRAS);
export const PROPOSALS: Proposal[] = all.flatMap((e) => e.proposals);
export const DUE: Due[] = all.flatMap((e) => e.due);
export const ACTIVITY: Activity[] = all.flatMap((e) => e.activity).sort((a, b) => b.when.localeCompare(a.when));

const overdue = DUE.filter((d) => d.bucket === "overdue").length;
const firstOpen = (roles: Role[]) => PROPOSALS.find((p) => p.roles.some((r) => roles.includes(r)));

export const CONVERSATIONS: Record<string, Turn[]> = {
  ...Object.fromEntries(Object.entries(EXTRAS).map(([k, e]) => [k, e.conversation])),
  home: [
    { who: "alpha", text: `Good morning. ${PROPOSALS.length} things are waiting for a person across the workspace, and ${overdue} ${overdue === 1 ? "item is" : "items are"} past their internal target.`, source: "Read every project · Home" },
    { who: "alpha", text: "The most urgent is the cardiology APS for Jerome Washington: Reliance Standard's deadline is tomorrow and Dr. Lindqvist's office hasn't signed yet. I've drafted a call script for the office.", source: "Read Ongoing benefits › Obligations · Forms and APS" },
    ...(firstOpen(["assistant"]) ? [{ who: "alpha" as const, proposal: firstOpen(["assistant"])!.id }] : []),
  ],
};

export const COMING_UP: Record<Role, string> = {
  assistant: "Unum package for Angela Morrison — client items due 23 Oct",
  attorney: "Walker appeal brief — draft due 2 Nov",
  owner: "Monthly firm review — 2 Nov",
  intake: "3 consultations booked for tomorrow",
  finance: "October statement run — 15 Oct",
};

export const CONNECTIONS: { name: string; what: string; state: string; tone: Tone }[] = [
  { name: "Microsoft 365 — Outlook", what: "Reads the legal assistants' mailboxes (read-only) and sends approved emails", state: "Connected", tone: "green" },
  { name: "Microsoft Entra ID", what: "Staff sign-in and roles", state: "Connected", tone: "green" },
  { name: "Total Office", what: "Case records, read nightly during the move", state: "Read-only", tone: "blue" },
  { name: "Electronic fax", what: "Sends approved packages to insurers who need fax", state: "Connected", tone: "green" },
  { name: "E-signature", what: "Client and physician signatures", state: "Connected", tone: "green" },
  { name: "Phone system", what: "Call recordings for Call reviews", state: "Needs attention", tone: "yellow" },
  { name: "Bank feed (trust account)", what: "Client benefit receipts for Finance", state: "Connected", tone: "green" },
  { name: "Model provider", what: "Covered by a business associate agreement; no data is kept for training", state: "Connected", tone: "green" },
];

export const FACTS: { fact: string; source: string }[] = [
  { fact: "Internal targets are set 14 days before the insurer's deadline", source: "Firm policy · set by Jordan Hale, 2 Mar 2026" },
  { fact: "A request closes only when every obligation has a documented submission", source: "Firm policy · Ongoing benefits" },
  { fact: "Clients are reminded about open portal items every 5 days, never with medical details", source: "Firm policy · approved 14 Apr 2026" },
  { fact: "Fee on ongoing benefits is 25% of each monthly payment unless the agreement says otherwise", source: "Standard fee agreement, 2024 version" },
  { fact: "Prudential, Reliance Standard and New York Life have no claimant portal; send by verified email or fax", source: "Insurer records · Network" },
  { fact: "Medical updates are due every 120 days for every ongoing-benefits client", source: "Firm policy · Medical monitoring" },
];
