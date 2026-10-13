import { Building2, Stethoscope, Users } from "lucide-react";
import type { Project, Rec } from "../data/types";
import type { Extras } from "./extras";

/* Network: the people and organizations every other project links to.
   Sample data — every person, claim number and amount is invented. Insurer names are real
   carriers used only as labels; no claim here is real. */

const STAGE = [
  { value: "Ongoing benefits", tone: "green" as const },
  { value: "Appeal", tone: "yellow" as const },
  { value: "Litigation", tone: "red" as const },
  { value: "New claim", tone: "blue" as const },
  { value: "Closed", tone: "gray" as const, done: true },
];

const c = (id: string, name: string, insurer: string, claim: string, stage: string, assistant: string, attorney: string, monthly: number | null, since: string, brand: string, lastUpdate: string, extra: Partial<Rec> = {}): Rec => ({
  id, name, insurer, claim, stage, assistant, attorney, monthly, since, brand, lastUpdate, ...extra,
});

export const CLIENTS: Rec[] = [
  c("c-1042", "Angela Morrison", "ins-unum", "UNM-77310452", "Ongoing benefits", "Maria Alvarez", "Daniel Brooks", 4850, "2023-03-14", "Brand A", "2026-10-03", { phone: "(314) 555-0142", email: "a.morrison@example.com", condition: "Multiple sclerosis; chronic fatigue", definition: "Any occupation (after 24 months)" }),
  c("c-1003", "Gregory Patel", "ins-metlife", "MET-4402917", "Ongoing benefits", "Maria Alvarez", "Daniel Brooks", 3920, "2021-08-02", "Brand A", "2026-07-21", { phone: "(314) 555-0103", email: "g.patel@example.com", condition: "Lumbar degenerative disc disease", definition: "Any occupation" }),
  c("c-1011", "Denise Walker", "ins-lincoln", "LFG-2209351", "Appeal", "Sam Okafor", "Elena Ruiz", null, "2026-06-18", "Brand B", "2026-09-29", { phone: "(636) 555-0111", email: "d.walker@example.com", condition: "Fibromyalgia; major depressive disorder", definition: "Own occupation" }),
  c("c-1017", "Marcus Hill", "ins-hartford", "HIG-9930128", "Ongoing benefits", "Maria Alvarez", "Daniel Brooks", 5310, "2022-01-10", "Brand A", "2026-06-30", { phone: "(314) 555-0117", email: "m.hill@example.com", condition: "Post-concussion syndrome", definition: "Any occupation" }),
  c("c-1020", "Linda Chen", "ins-prudential", "PRU-5571006", "Ongoing benefits", "Sam Okafor", "Elena Ruiz", 2760, "2020-11-23", "Brand B", "2026-09-12", { phone: "(618) 555-0120", email: "l.chen@example.com", condition: "Rheumatoid arthritis", definition: "Any occupation" }),
  c("c-1024", "Robert Nguyen", "ins-unum", "UNM-77452210", "Litigation", "Sam Okafor", "Elena Ruiz", null, "2025-02-04", "Brand A", "2026-08-15", { phone: "(314) 555-0124", email: "r.nguyen@example.com", condition: "Cervical radiculopathy", definition: "Own occupation" }),
  c("c-1031", "Tanya Brooks", "ins-sunlife", "SLF-3018847", "Ongoing benefits", "Maria Alvarez", "Daniel Brooks", 3175, "2022-05-17", "Brand A", "2026-05-02", { phone: "(314) 555-0131", email: "t.brooks@example.com", condition: "Lupus (SLE)", definition: "Any occupation" }),
  c("c-1036", "Jerome Washington", "ins-reliance", "RSL-6624019", "Appeal", "Sam Okafor", "Daniel Brooks", null, "2026-08-27", "Brand B", "2026-10-07", { phone: "(636) 555-0136", email: "j.washington@example.com", condition: "Congestive heart failure", definition: "Own occupation" }),
  c("c-1039", "Sofia Ramirez", "ins-guardian", "GRD-1182243", "Ongoing benefits", "Maria Alvarez", "Elena Ruiz", 2490, "2023-09-05", "Brand A", "2026-08-28", { phone: "(314) 555-0139", email: "s.ramirez@example.com", condition: "Crohn's disease", definition: "Any occupation" }),
  c("c-1044", "Kevin O'Brien", "ins-metlife", "MET-4417730", "Ongoing benefits", "Sam Okafor", "Daniel Brooks", 4120, "2021-03-29", "Brand B", "2026-04-18", { phone: "(618) 555-0144", email: "k.obrien@example.com", condition: "Bipolar I disorder", definition: "Any occupation (mental-nervous limit reviewed)" }),
  c("c-1047", "Patricia Young", "ins-aetna", "AET-8820194", "New claim", "Maria Alvarez", "Elena Ruiz", null, "2026-09-30", "Brand A", "2026-10-06", { phone: "(314) 555-0147", email: "p.young@example.com", condition: "Breast cancer, in treatment", definition: "Own occupation" }),
  c("c-1050", "Howard Kim", "ins-lincoln", "LFG-2241876", "Ongoing benefits", "Maria Alvarez", "Daniel Brooks", 3640, "2019-12-02", "Brand A", "2026-09-22", { phone: "(314) 555-0150", email: "h.kim@example.com", condition: "Parkinson's disease", definition: "Any occupation" }),
  c("c-1052", "Brenda Foster", "ins-unum", "UNM-77511094", "Ongoing benefits", "Sam Okafor", "Elena Ruiz", 2980, "2024-04-15", "Brand B", "2026-07-08", { phone: "(636) 555-0152", email: "b.foster@example.com", condition: "Long COVID; POTS", definition: "Own occupation" }),
  c("c-1055", "Anthony Russo", "ins-hartford", "HIG-9955402", "Closed", "Maria Alvarez", "Daniel Brooks", null, "2018-06-11", "Brand A", "2025-12-19", { phone: "(314) 555-0155", email: "a.russo@example.com", condition: "Spinal stenosis", definition: "—" }),
  c("c-1058", "Michelle Davis", "ins-newyorklife", "NYL-7106653", "Ongoing benefits", "Sam Okafor", "Daniel Brooks", 4460, "2022-10-24", "Brand B", "2026-09-30", { phone: "(618) 555-0158", email: "m.davis@example.com", condition: "Epilepsy, refractory", definition: "Any occupation" }),
  c("c-1061", "Carlos Mendoza", "ins-prudential", "PRU-5590871", "Appeal", "Maria Alvarez", "Elena Ruiz", null, "2026-07-13", "Brand A", "2026-10-09", { phone: "(314) 555-0161", email: "c.mendoza@example.com", condition: "Ankylosing spondylitis", definition: "Any occupation" }),
];

const ins = (id: string, name: string, email: string, fax: string, portal: string, open: number, avgDays: number): Rec => ({ id, name, email, fax, portal, open, avgDays });

export const INSURERS: Rec[] = [
  ins("ins-unum", "Unum", "ltdclaims@unum.example", "(800) 555-0190", "Yes", 14, 38),
  ins("ins-metlife", "MetLife", "disability@metlife.example", "(800) 555-0191", "Yes", 9, 41),
  ins("ins-lincoln", "Lincoln Financial", "ltd@lfg.example", "(800) 555-0192", "Yes", 7, 45),
  ins("ins-hartford", "The Hartford", "absence@thehartford.example", "(800) 555-0193", "Yes", 6, 33),
  ins("ins-prudential", "Prudential", "groupdisability@prudential.example", "(800) 555-0194", "No", 5, 52),
  ins("ins-sunlife", "Sun Life", "ltdclaims@sunlife.example", "(800) 555-0195", "Yes", 3, 36),
  ins("ins-reliance", "Reliance Standard", "claims@reliancestandard.example", "(800) 555-0196", "No", 4, 58),
  ins("ins-guardian", "Guardian", "disability@guardian.example", "(800) 555-0197", "Yes", 3, 40),
  ins("ins-aetna", "Aetna", "disabilityclaims@aetna.example", "(800) 555-0198", "Yes", 2, 47),
  ins("ins-newyorklife", "New York Life", "gbs.claims@newyorklife.example", "(800) 555-0199", "No", 3, 44),
];

const doc = (id: string, name: string, specialty: string, practice: string, clients: string[], lastSigned: string, prefers: string, responds: number): Rec => ({ id, name, specialty, practice, clients, lastSigned, prefers, responds });

export const PHYSICIANS: Rec[] = [
  doc("dr-01", "Dr. Helen Ortiz", "Neurology", "Gateway Neurology Associates", ["c-1042", "c-1017"], "2026-04-02", "Prefilled APS", 9),
  doc("dr-02", "Dr. Samuel Reyes", "Pain management", "Midwest Spine & Pain", ["c-1042", "c-1003"], "2026-03-18", "Prefilled APS", 14),
  doc("dr-03", "Dr. Karen Holt", "Primary care", "Kirkwood Family Medicine", ["c-1042", "c-1031"], "2025-11-09", "Blank form", 21),
  doc("dr-04", "Dr. Anil Mehta", "Rheumatology", "River Bend Rheumatology", ["c-1020", "c-1031", "c-1061"], "2026-02-26", "Prefilled APS", 11),
  doc("dr-05", "Dr. Joan Whitaker", "Psychiatry", "Lakeside Behavioral Health", ["c-1011", "c-1044"], "2026-06-14", "Narrative letter", 18),
  doc("dr-06", "Dr. Peter Lindqvist", "Cardiology", "Heartland Cardiology Group", ["c-1036"], "2026-08-30", "Prefilled APS", 7),
  doc("dr-07", "Dr. Grace Adeyemi", "Gastroenterology", "Metro GI Partners", ["c-1039"], "2026-01-20", "Blank form", 16),
  doc("dr-08", "Dr. Thomas Bauer", "Neurology", "Gateway Neurology Associates", ["c-1050", "c-1058"], "2026-05-11", "Prefilled APS", 10),
  doc("dr-09", "Dr. Rachel Stein", "Oncology", "Central West End Oncology", ["c-1047"], "", "Unknown", 0),
  doc("dr-10", "Dr. Luis Carrillo", "Pulmonology", "West County Pulmonary", ["c-1052"], "2026-03-03", "Prefilled APS", 12),
];

export const network: Project = {
  id: "network",
  name: "Network",
  icon: Users,
  summary: "Clients, insurers and physicians — the people every case links to.",
  collections: [
    {
      id: "clients",
      label: "Clients",
      word: "Client",
      icon: Users,
      titleKey: "name",
      boardBy: "stage",
      dateKey: "lastUpdate",
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "stage", label: "Stage", type: "status", options: STAGE },
        { key: "insurer", label: "Insurer", type: "relation", to: { project: "network", collection: "insurers" } },
        { key: "claim", label: "Claim number", type: "text", width: 170 },
        { key: "monthly", label: "Monthly benefit", type: "money", width: 160 },
        { key: "assistant", label: "Legal assistant", type: "person" },
        { key: "attorney", label: "Attorney", type: "person" },
        { key: "lastUpdate", label: "Last medical update", type: "date", width: 190 },
        { key: "brand", label: "Brand", type: "choice", options: [{ value: "Brand A", tone: "blue" }, { value: "Brand B", tone: "gray" }], width: 120 },
        { key: "since", label: "Client since", type: "date", hidden: true },
        { key: "condition", label: "Conditions", type: "text", hidden: true },
        { key: "definition", label: "Disability definition", type: "text", hidden: true },
        { key: "phone", label: "Phone", type: "text", hidden: true },
        { key: "email", label: "Email", type: "text", hidden: true },
      ],
      records: CLIENTS,
      lists: [
        { id: "mine", name: "My clients", filter: (r) => r.assistant === "Maria Alvarez", star: true },
        { id: "stale", name: "No medical update in 120 days", filter: (r) => String(r.lastUpdate) < "2026-06-14" && r.stage === "Ongoing benefits" },
      ],
      metrics: [],
    },
    {
      id: "insurers",
      label: "Insurers",
      word: "Insurer",
      icon: Building2,
      titleKey: "name",
      fields: [
        { key: "name", label: "Insurer", type: "text" },
        { key: "email", label: "Verified claims email", type: "text", width: 280 },
        { key: "fax", label: "Verified fax", type: "text" },
        { key: "portal", label: "Has portal", type: "choice", options: [{ value: "Yes", tone: "green" }, { value: "No", tone: "gray" }], width: 120 },
        { key: "open", label: "Open requests", type: "number", width: 140 },
        { key: "avgDays", label: "Avg. days to decide", type: "number", width: 170 },
      ],
      records: INSURERS,
      notice: "Verified addresses are the only ones Alpha may send to. A new address must be verified by staff first.",
    },
    {
      id: "physicians",
      label: "Physicians",
      word: "Physician",
      icon: Stethoscope,
      titleKey: "name",
      fields: [
        { key: "name", label: "Physician", type: "text" },
        { key: "specialty", label: "Specialty", type: "text" },
        { key: "practice", label: "Practice", type: "text", width: 260 },
        { key: "clients", label: "Clients", type: "relation", to: { project: "network", collection: "clients" }, width: 280 },
        { key: "lastSigned", label: "Last signed APS", type: "date", width: 170 },
        { key: "prefers", label: "Prefers", type: "choice", options: [{ value: "Prefilled APS", tone: "blue" }, { value: "Blank form", tone: "gray" }, { value: "Narrative letter", tone: "gray" }, { value: "Unknown", tone: "gray" }] },
        { key: "responds", label: "Median days to sign", type: "number", width: 170 },
      ],
      records: PHYSICIANS,
    },
  ],
  agents: [
    {
      id: "matcher",
      name: "Identity matcher",
      does: "Checks every new lead, caller and email sender against clients, past clients and both brands; links only above the threshold and asks staff about the middle band.",
      skills: ["Exact and approximate matching on name, phone and email", "Explains each match with the evidence", "Never merges records"],
      runs: [
        { when: "12 Oct, 07:42", what: "Checked 3 overnight website inquiries", result: "1 possible duplicate", tone: "yellow" },
        { when: "11 Oct, 16:05", what: "Checked an inbound call from (636) 555-0136", result: "Matched Jerome Washington", tone: "green" },
      ],
      may: ["Link a record when the match is certain", "Flag possible duplicates for review"],
      mayNot: ["Merge two people", "Show privileged details of a past client in a duplicate alert"],
    },
  ],
  automations: [],
  allowed: [
    { text: "Alpha may link an email, call or lead to a client when the match is certain.", why: "Certain matches are exact on claim number, verified sender or thread." },
    { text: "Alpha may draft a client summary for staff.", why: "Drafts are read by staff before any use." },
  ],
  denied: [
    { text: "Alpha may not merge two people.", why: "Merging is permanent; staff link records instead and keep both histories." },
    { text: "Alpha may not reveal a past client's matter in a duplicate alert.", why: "Conflict checks must not expose privileged information." },
  ],
  kept: [
    { what: "Client records", where: "The firm's system of record (Postgres, encrypted, Azure under the Microsoft agreement)" },
    { what: "Legacy history", where: "Read-only copy of Total Office, migrated by cohort" },
  ],
  files: [
    { name: "Insurer address directory — verified 1 Oct 2026.xlsx", by: "Sam Okafor", when: "1 Oct 2026", size: "48 KB" },
  ],
  about: "Network holds every client, insurer and physician. Other projects link here, so a client's requests, appeals, payments and calls all meet on one record.",
};

export const networkExtras: Extras = {
  proposals: [],
  due: [],
  activity: [],
  conversation: [
    { who: "alpha", text: "16 clients, 10 insurers and 10 physicians. 3 ongoing-benefits clients have had no medical update in 120 days — the list “No medical update in 120 days” shows them.", source: "Read Network · Clients" },
  ],
};
