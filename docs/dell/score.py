# Requirement fit matrix: Dell Disability blueprint v1.5 + Vision deck vs Alpha Brain.
# Y=1, P=0.5, N=0. Fix = low-effort build (letter key) that lifts the row.
import sys
R = [
# module, requirement, status, fix
("Intake","Website form capture, normalized fields, immutable original","P","B,D"),
("Intake","Fallback: parse owner's Outlook form-notification emails","P","C"),
("Intake","Auto-create lead + notify owner (Outlook/mobile)","P","D"),
("Intake","Duplicate/prior-client check, fuzzy + confidence, no auto-merge","P","F"),
("Intake","Owner actions: assign / ask / hold / decline, AI draft approved","P","B"),
("Intake","Phone lead form + auditable random attorney rotation","P","B,J"),
("Intake","Contact attempt vs contact vs consultation logged separately","Y",""),
("Intake","Shared intake work queue (2 staff)","N",""),
("Intake","Secure prospect upload link","N",""),
("Intake","Attorney consultation briefing summary","Y",""),
("Intake","12-stage model, owner + next step/due date, stale warnings","P","B,I"),
("Intake","Configured follow-up cadence + escalation","P","D,I"),
("Intake","E-signature send + status tracking","N",""),
("Intake","Prospect to client conversion without rekeying","P","B"),
("Intake","Owner / attorney / intake dashboards","P","B"),
("Intake","Management analytics (unique people, conversion, aging)","P","B"),
("Intake","Immutable audit of merges/assignments/overrides","Y",""),
("Benefits","Capture Outlook mailboxes incl. threads + attachments","N","C"),
("Benefits","Match email to case; ambiguous to review queue","P","C,D"),
("Benefits","Classify attachments (blank/signed form, records, EOB)","P","A"),
("Benefits","Parse request into parent + per-document obligations + deadlines","P","B,D"),
("Benefits","One consolidated client-portal assignment","N",""),
("Benefits","Reminders + escalation before insurer deadline","P","I"),
("Benefits","Outbound package via verified email/fax","N",""),
("Benefits","Sent / delivered / acknowledged statuses + proof retained","P","B"),
("APS","Retrieve prior signed APS + new blank form","P","A"),
("APS","Portal change questionnaire for claimant","N",""),
("APS","Map answers into insurer PDF form, flag unknown fields","N","E"),
("APS","Field-level provenance (historical/client/record/physician)","Y",""),
("APS","Legal-assistant approval before release","Y",""),
("APS","Returned signed APS completeness check","N","A"),
("APS","Claimant statement / authorization templates + history","N","E"),
("Portal","Authenticated client portal","N",""),
("Portal","Two-way business SMS","N",""),
("Portal","Unified communication log","P","C"),
("Portal","Publish approved final docs to portal + notify","N",""),
("Portal","Portable case assignment between assistants","N",""),
("Medical","90-120 day check-in schedule per client","P","I"),
("Medical","Post-appointment prompts","P","I"),
("Medical","Provider / record-status dashboard","Y",""),
("Medical","SMART-on-FHIR patient connections","N",""),
("Workspace","Case workspace: overview/tasks/comms/docs/financials","P","B"),
("Workspace","Notes with categories + AI-proposed tasks","Y",""),
("Workspace","Nextiva lookup / screen-pop / call metadata","N",""),
("Workspace","Call recording transcription + summary","N",""),
("Workspace","PLAUD transcript import + reviewed summary","Y",""),
("Workspace","Recording consent workflow","N",""),
("Appeals","Ingest 10k+ page PDF: hash, page count, Bates, page map","N","G"),
("Appeals","OCR + per-page quality flags","N","A"),
("Appeals","Segment record into documents + classify","N","A,G"),
("Appeals","Medical + claim chronology with page citations","P","G"),
("Appeals","Insurer review analysis (IME, peer, vocational)","P","G"),
("Appeals","Evidence development plan","P",""),
("Appeals","Appeal drafting workspace, versions, redlines","P",""),
("Appeals","Record-grounded Q&A with source pages, no fake cites","P","G"),
("Appeals","Deadline proposal + attorney validation","P",""),
("Appeals","Physician-specific functional questionnaire drafts","Y",""),
("Appeals","Known-answer testing at 500/2.5k/10k pages","P","G"),
("Finance","Match receipts to client / benefit period","P","H"),
("Finance","Deterministic fee/cost calculation rules","N","H"),
("Finance","Draft client statements for review","P","H"),
("Finance","Missing payment / zero-dollar EOB tracking","P","I"),
("Finance","Trust subledgers, 3-way reconciliation, dual control","N",""),
("Finance","Bank / CashPro integration","N",""),
("Migration","Extract + map Total Office data with integrity checks","P","K"),
("Migration","Parallel run, rollback, read-only legacy","N",""),
("Security","Multi-user, matter-level RBAC","N",""),
("Security","MFA / SSO","N",""),
("Security","Encryption at rest","N",""),
("Security","Immutable audit logs","Y",""),
("Security","Retention policies","N",""),
("Security","Prompt-injection isolation for insurer content","P",""),
("Security","Vendor/BAA-appropriate AI processing","N",""),
("Security","Backup / restore","P",""),
("Metrics","Acceptance metrics (match rate, time saved, etc.)","P","B"),
]
V = {"Y":1,"P":.5,"N":0}
def pct(rows): return 100*sum(V[s] for *_,s,_ in rows)/len(rows)
mods = dict.fromkeys(m for m,*_ in R)
lines = ["| Module | Reqs | Y | P | N | Coverage |","|---|---|---|---|---|---|"]
for m in mods:
    rs=[r for r in R if r[0]==m]
    lines.append(f"| {m} | {len(rs)} | "+" | ".join(str(sum(r[2]==s for r in rs)) for s in "YPN")+f" | {pct(rs):.0f}% |")
lines.append(f"| **Total** | {len(R)} | "+" | ".join(str(sum(r[2]==s for r in R)) for s in "YPN")+f" | **{pct(R):.0f}%** |")
# what-if: each fix lifts its rows one notch (N->P, P->Y)
up={"N":"P","P":"Y","Y":"Y"}
def lifted(keys): return [(m,q,up[s] if set(f.split(","))&set(keys) and f else s,f) for m,q,s,f in R]
out="\n".join(lines)+"\n\n| After fixes | Coverage |\n|---|---|\n"
acc=[]
for k in "DBACGIFEHJK":
    acc.append(k); out+=f"| +{k} | {pct(lifted(acc)):.0f}% |\n"
out+="\n| Module | Requirement | Status | Lifted by |\n|---|---|---|---|\n"+"\n".join(f"| {m} | {q} | {s} | {f} |" for m,q,s,f in R)
assert len(R)==75 and 0<pct(R)<100
print(out)
