# Open-source alternatives to the platforms in the Dell fit map

12 October 2026. This goes through every commercial platform listed in `Case management Platform/Dell Disability - Requirements Fit Map.html` and `ref docs/Competitive_Research_Aderant_Clio.md`. Each one gets its open-source alternative. If no open-source equivalent exists, the row names the closest open-source project, or a working pattern from another industry worth copying.

**How this was checked.** Six research passes on 12 Oct 2026, one per category. License, stars and last push were checked against GitHub or web sources where marked. **(U)** means unverified: from memory, or from a source that conflicts with another. Read the repo's LICENSE file before adopting anything.

**License key:**

| Mark | Meaning |
|---|---|
| ✅ | Permissive: MIT, Apache-2.0, BSD |
| ⚠️ copyleft | GPL/AGPL. Fine to run unmodified behind an API. Changing the code and serving it over a network triggers AGPL source-sharing. |
| ⛔ | Source-available, not OSI-approved, or the project is archived |

---

## A. Whole platform, case management and workflow engines

There is **no mature open-source legal practice-management system**. The searches found nothing usable: the legal-specific GitHub projects have between 0 and 20 stars. The platform has to be assembled from a general CRM plus a workflow engine plus custom legal logic.

| Commercial | Open-source alternative | License | Repo / maturity | Fit for this firm |
|---|---|---|---|---|
| Aderant Total Office | **No equivalent.** Closest: Twenty or EspoCRM for matters, plus ERPNext for billing | Twenty ⚠️ AGPL-3.0 core with a commercial `ee` dir. ERPNext ⚠️ GPL-3.0 | twentyhq/twenty ~58k★, pushed 13 Oct 2026. frappe/erpnext ~40k★, active | Matters, deadlines, trust and LEDES are all custom. Don't treat ERPNext as the replacement. |
| Clio Manage / Clio Operate (ShareDo) | **Twenty** (custom objects, Kanban, API); **EspoCRM** (entity manager, BPM, mature roles and ACLs) | Both ⚠️ AGPL-3.0 | espocrm/espocrm ~3.5k★, pushed 12 Oct 2026 | Neither has legal features. Espo is more mature on per-record access, Twenty is more modern. |
| Filevine | Twenty + a workflow engine | as above | — | Copy Filevine's model: project types → phases → auto-tasks → portal. |
| Litify (Salesforce) | **Twenty**, the closest Salesforce-style open-source CRM | ⚠️ AGPL | — | Its workflow engine is young. |
| SmartAdvocate, Neos, Eve/EveOS, MyCase | None legal-specific | — | — | Copy the pattern: case-type templates → auto-tasks → deadline rules. |
| Prevail (the only LTD-specific CMS) | None | — | — | Use it as the **reference data model** for LTD stages and fields: claim → evidence → appeal → outcome, policy/insurer/benefit, payment monitoring. |
| Chronicle Legal / Atlasware / Dibcase (SSD) | None | — | — | SSA-only. Use custom entities with field-level encryption for SSNs. |
| AbacusLaw ERISA | None | — | — | Write the ERISA deadline rules as deterministic code (180-day appeal, 45+45 decision periods, tolling, contractual limitation period). |
| FINEOS Claims for Disability (carrier side) | **openIMIS**, health-insurance claims administration | ⚠️ AGPL-3.0 | openimis-be_py, small community | It sits on the insurer's side, so use it only as a reference for the benefit-schedule, offset and overpayment data model. |
| Salesforce Service / Health Cloud | Twenty or EspoCRM | ⚠️ AGPL | — | Self-hosting removes Salesforce's BAA, so the firm carries compliance itself. |
| Dynamics 365 + Power Automate approvals | **Windmill**; **Appsmith** or **ToolJet** for approval UIs; **n8n** | Windmill ⚠️ AGPLv3 plus proprietary EE code. Appsmith ✅ Apache-2.0 core (U). ToolJet ⚠️ AGPL (U). n8n ⛔ Sustainable Use License | n8n ~207k★ | n8n is the easiest, but it is fair-code. Check whether internal use fits the SUL. Staying on M365 Power Automate Approvals is also reasonable. |
| Pega / Appian (case + SLA engines) | **Flowable** (CMMN + BPMN, timers/SLAs); **Temporal** (durable timers, code-first) | Flowable ✅ Apache-2.0 (its design tooling is commercial). Temporal ✅ MIT | flowable-engine ~9.6k★, v8.0.0 Feb 2026. temporal ~23.6k★ | Flowable is the only true open-source CMMN case engine. Temporal suits long-running timers such as 1,500 benefit-review calendars. |
| Camunda | Camunda 7 CE ⛔ community end-of-life Oct 2025 (fork: OrqueIO). Camunda 8 ⛔ Camunda License 1.0, production use needs a paid license | — | — | Avoid. |
| ArkCase CE | Government case platform (FOIA, complaints) | License unclear (LGPL per a directory; the repo shows none) | 21★ | Heavy Alfresco stack with a tiny community. Not recommended. |
| Directus (low-code backend) | — | ⛔ BSL 1.1 (U) | — | Avoid. Baserow ✅ MIT core (U) or NocoDB ⚠️ AGPL (U) if a data UI is needed. |

## B. Intake, CRM, lead rotation, e-signature, client portal, messaging

| Commercial | Open-source alternative | License | Repo / maturity | Fit / HIPAA notes |
|---|---|---|---|---|
| Lawmatics, Lead Docket, Law Ruler, Intaker, Captorra, Clio Grow | **EspoCRM** (built-in web-to-lead) or **Twenty**; **SuiteCRM 8** if needed | ⚠️ AGPL-3.0 (all verified) | SuiteCRM 8.9.2, Jan 2026 | Intake stages, conflicts and brand attribution must be configured. |
| Lawmatics campaigns / nurture | **Mautic** | ⚠️ GPL-3 | Mature; the bundled Froala editor's license is a concern | Must respect the firm's written follow-up protocol. No invented cadences. |
| Website intake forms | **OpnForm** (Tally-like); **Formbricks**; **HeyForm** | ⚠️ AGPL-3 cores; OpnForm `Enterprise/` and Formbricks `ee` are proprietary | — | For the immutable copy of the original submission, store the raw POST in WORM storage before parsing it. |
| Conversational intake | **Typebot** | ⛔ FSL (becomes Apache-2.0 after 2 years) | — | Likely fine for internal use, but don't treat it as OSS. |
| Applied Indio / TaxCaddy (prefilled questionnaires) | **Docassemble**: guided interviews, save/resume, PDF output | ✅ MIT (calls GPL Pandoc/pdftk as subprocesses) | jhpyle/docassemble ~1k★ | **Best fit** for the APS "what changed since last time" questionnaire and the 90–120-day medical check-in. Its Python interview language has a learning curve. |
| Chili Piper / Follow Up Boss (round-robin) | **No open-source router.** Use a CRM rule (EspoCRM lead capture reportedly does round-robin (U)) or a few dozen lines of code | — | — | The audit log and exception queue are the real work. Copy the real-estate pattern: first-to-claim with a timeout, and an unclaimed-lead pool. |
| Calendly-style scheduling | **Easy!Appointments** (GPL-3 (U)); Cal.com's OSS edition is now "Cal.diy" | Cal.diy ✅ MIT, but Teams, round-robin, workflows and the v1 API were removed in April 2026 | — | Don't depend on Cal.com for routing. Microsoft Graph free/busy works for attorney availability. |
| DocuSign, Anvil Etch | **DocuSeal** (templates + PDF field fill); **Documenso** (cleaner signing UX); OpenSign; LibreSign (Nextcloud) | ⚠️ AGPL-3.0 each, with commercial editions. DocuSeal's API and embedding may be paywalled when self-hosted | DocuSeal ~17.5k★ | Status must come from the signature provider. Check DocuSeal's API terms before you rely on its webhooks. |
| Hona, Case Status, Clio for Clients, Moxo, Copilot.com (Assembly) | **No open-source client portal product.** Build a thin portal on the chassis API with **Keycloak** for client identities | Keycloak ✅ Apache-2.0 (CNCF) | keycloak/keycloak | This is the real build gap. Authentik has an enterprise-licensed folder, so prefer Keycloak. |
| Floify (mortgage needs-list) | No open-source equivalent. Docassemble upload fields, or a custom checklist | — | — | **Pattern to copy:** a needs-list per case, with accept/reject + reason per item, a deadline, and auto-reminders. |
| Power Pages secure upload | **Nextcloud** File drop / File requests; Seafile and Pydio Cells (open-core) | ⚠️ AGPL (U) | nextcloud/server | Nextcloud says HIPAA depends on the host, so get a BAA with whoever hosts it. |
| Twilio / SendGrid | **Novu** (notification orchestration); **Postal** (mail server); **Jasmin** (SMPP gateway) | Novu ✅ MIT core. Postal ✅ MIT (U). Jasmin ✅ Apache-2.0 | — | **The carrier is still required.** Twilio signs a BAA only on HIPAA Editions with designated HIPAA projects. Other BAA-capable carriers (U): Telnyx, Bandwidth, Azure Communication Services, AWS SES/SNS. Keep PHI out of SMS bodies. |
| Spruce (HIPAA texting) | **Chatwoot**: shared inbox for SMS, email and chat | ✅ MIT core; `/enterprise` proprietary (audit logs, SLAs) | chatwoot/chatwoot | Audit logs are paid, so check them against HIPAA needs. Zammad ⚠️ AGPL is the ticket-style alternative. |
| Luma Health / Artera (patient recall) | No open-source product. Use a scheduled CRM workflow + Novu | — | — | **Pattern:** a cohort ("last medical update > 90 days"), then a templated message, then auto-close when answered. |
| Bulk email | Listmonk ⚠️ AGPL | — | — | Not needed. Firm email goes through M365 under the Microsoft BAA. |

## C. Email capture, document AI and OCR, PDF forms, document management, fax

| Commercial | Open-source alternative | License | Repo / maturity | Fit notes |
|---|---|---|---|---|
| Zero (zero.law email filing); M365 Copilot / Graph | **No open-source matter-matching tool.** Write a small **Graph delta-query + change-notification** service. imapsync and mbsync for bulk copy | imapsync NLPL (U); mbsync GPL (U) | — | DavMail (EWS) is legacy because Microsoft is retiring EWS in Exchange Online (U). Use Graph app-only `Mail.Read` scoped by RBAC for Applications. |
| Foundation AI, Indico, Tennr, Vooma (mailroom AI) | **Docling** for parsing, then an LLM classifier with structured output (Instructor / Outlines (U)) | Docling ✅ MIT | docling-project/docling ~69k★ | Expect weak results on handwriting. Send low-confidence items to human review. |
| Azure Document Intelligence / AWS Textract | **OCRmyPDF** (Tesseract) for the text layer; **Docling** for layout and tables; **olmOCR** (VLM) for hard pages | OCRmyPDF MPL-2.0 ✅. Tesseract Apache-2.0 (U). olmOCR code ✅ Apache-2.0, model license unchecked | OCRmyPDF ~35k★. olmOCR ~20k★, v0.4.0 | Reliable on print. Tesseract is weak on faxes and handwriting. olmOCR needs a GPU. |
| Reducto, Sensible (extraction with coordinates) | **Google LangExtract**: every extraction carries a character span, and ungrounded output gets `char_interval=None` | ✅ Apache-2.0 (health use also under Google's HAI-DEF terms) | google/langextract ~39k★ | **This is the provenance primitive.** Map character spans back to page and bounding box through Docling's layout elements. Reject ungrounded values. |
| Marker / Surya (parsers) | — | ⛔ code Apache-2.0, but the **weights are under a modified RAIL-M license: commercial use above $5M revenue/funding is paid** | — | Avoid. Use Docling. |
| MinerU | — | ⚠️ AGPL (U) | — | Optional. |
| Hyperscience / Instabase (confidence-threshold review) | **Label Studio Community** (bbox review); Argilla (U) | ✅ Apache-2.0 | HumanSignal/label-studio ~28.5k★ | You build the threshold routing. A built-in review queue in the platform is enough for operations; keep Label Studio for building gold sets. |
| Gavel / Instafill / Anvil (PDF form automation) | **commonforms** (FFDNet models turn flat PDFs into fillable forms and detect text, checkbox and signature fields), then fill with **pypdf** or **pdf-lib** | commonforms license unconfirmed. pypdf BSD (U). pdf-lib MIT (U) | jbarrow/commonforms ~1k★, pushed ~Aug 2026 | Per-field provenance goes in a sidecar you build. No open-source tool does this. |
| PyMuPDF | — | ⚠️ AGPL (needs a commercial license in a closed network service) | — | Use pypdf instead. |
| NetDocuments / iManage (DMS) | **Paperless-ngx**; Mayan EDMS, Papermerge, OpenKM, Alfresco CE (U) | ⚠️ GPL-3.0 | paperless-ngx ~47k★ | Fine for archive and search. It has no matter workspaces or ethical walls. A simpler option is to keep documents in the chassis plus WORM blob storage. |
| Documo / eFax Corporate / Sfax (HIPAA fax API) | **HylaFAX+**, or **ICTFax** (FreeSWITCH, T.38, REST) | License not confirmed | — | You still need a T.38 SIP trunk with a BAA. Delivery confirmation is weaker than a commercial API's. **Recommendation: buy the fax API.** It's cheap, and proof matters. |
| RMail (registered email) | No open-source equivalent | — | — | Send through Graph and keep the sent message ID, the DSN or read receipt, and the full headers with a file hash in the submission register. |
| Draftable (document diff) | diff-pdf (U); a text diff of the Docling output | — | — | See section E for draft versioning. |

## D. Telephony and transcription

| Commercial | Open-source alternative | License | Fit notes |
|---|---|---|---|
| Nextiva / RingCentral | **Asterisk** + **FreePBX**; **Wazo** (REST APIs and webhooks); FreeSWITCH/FusionPBX | Asterisk GPLv2 (U). FreePBX ⚠️ GPLv3 core (some Sangoma modules are commercial). Wazo GPLv3. FreeSWITCH MPL-1.1 | The Cisco SIP phones could be re-provisioned, but the firm would then own SIP trunking, E911, failover and fax. **Not recommended for a 25-person firm.** |
| Clio–Nextiva CTI / screen-pop | EspoCRM VoIP extension (paid; Asterisk AMI); Odoo OCA `connector-telephony` | Espo core ⚠️ AGPL; Odoo's official VoIP app is OPL-1 (proprietary) | All of these assume Asterisk. **Nextiva runs on BroadWorks**, so the path is **BroadWorks XSI-Events** (call events) → lookup in the person index → pop. Access is sales-gated; ask Nextiva in writing. |
| Ringfree / LegalMate / CallCabinet (legal call logging) | No open-source equivalent. Asterisk MixMonitor + a CRM connector if self-hosted | — | The recording export from Nextiva is the **biggest unknown**: no documented recording API was found. Ask about SIPREC. Gong captures Nextiva calls, so a capture path exists. |
| AssemblyAI (diarized transcription) | **WhisperX** (Whisper + pyannote); **faster-whisper**; **whisper.cpp** (Metal/Core ML on Apple Silicon) | WhisperX BSD (license header disputed, check). faster-whisper ✅ MIT. whisper.cpp ✅ MIT (~50k★) | Use large-v3. 8 kHz phone audio is the accuracy risk, so pilot on 20 real calls. pyannote models are gated on Hugging Face; check each model card's license. |
| NVIDIA NeMo / Parakeet; Vosk; SpeechBrain | — | NeMo Apache; Parakeet weights CC-BY-4.0 (U); Vosk Apache (U) | Parakeet is fast and needs a GPU. |
| PLAUD | Hardware stays. Import exports into the same transcription pipeline | — | PLAUD's developer API (beta) and its BAA scope are unconfirmed. Plan on a watched export folder. |
| Nextiva native AI summaries | Local LLM, or an LLM under a BAA, plus a staff approval queue | model-dependent | Task extraction is a small custom piece. |
| CallRail Healthcare | None; not needed | — | — |
| Car Wars / VinSolutions (unmatched-call bucket) | Pattern only | — | Unmatched calls go to a review queue where staff link them to a case. |

## E. Appeals, administrative-record AI, legal research and drafting

**No open-source medical-chronology or appeals product exists.** Build it from parts. The one rule to copy from every good implementation: **the page citation on a row comes from stored page metadata, never from the model's output.**

| Commercial | Open-source alternative | License | Repo / maturity | Fit at 10k pages / citation accuracy |
|---|---|---|---|---|
| Wisedocs, DigitalOwl, InPractice, Supio, EvenUp, Eve, Superinsight, Dodonai, Tavrn | None. Assemble: **Docling/OCRmyPDF** (page OCR) → segmentation → **LangExtract** (events with spans) → **OpenContracts** (human review) | — | — | Segment into documents first, then extract per document. Never give the model one 10k-page context. |
| Filevine MedChron, CaseFleet (timeline) | vis-timeline / TimelineJS for display (U) | MIT/Apache (U); MPL-2.0 (U) | — | Render the timeline from the structured events table. |
| Record ingest + Q&A (InPractice Case Chat, Nomad Data Doc Chat) | **RAGFlow** (DeepDoc layout/OCR, grounded citations); **PaperQA2** (strongest citation grounding); **Kotaemon** (in-PDF citation highlights) | ✅ Apache-2.0 each | RAGFlow ~92k★, 1.0.0-rc1 Sep 2026. PaperQA2 ~9.4k★. Kotaemon ~26k★ | Verify citations in code. Refuse to answer when no evidence is retrieved. PaperQA2 needs adapting to Bates and page metadata. |
| R2R, Onyx | — | R2R ✅ MIT. Onyx ✅ MIT CE | — | Lower fit. |
| Clearbrief (citation-linked drafting) | None. **OpenContracts** + a citation-check script | OpenContracts ✅ MIT, v3 beta | ~1.5k★ | Each cited sentence stores a Bates/page reference, and a script checks that the quote exists on that page. |
| Harvey, Legora, CoCounsel / Lexis Practical Guidance | LLM under a BAA (or local) + **CourtListener / Free Law Project API** for case law | CourtListener data and API open; read the terms | — | Keep drafting separate from facts. ERISA authorities (Glenn, Nord, §2560.503-1) come only from retrieved sources. Send only public queries, never claimant data. |
| Anterior / Sixfold (criteria → evidence → met / not met) | LangExtract with a checklist schema + the OpenContracts extraction grid | ✅ | — | One row per ERISA checklist criterion: status, supporting span, reviewer sign-off. |
| SmarterDx / Waystar (denial appeals) | None | — | — | **Pattern:** denial reason → required proof → rebuttal paragraph with citations. |
| VBMS Reviewer (VA claim files) | None | — | — | **Pattern:** segment → label document type → extract → cite. |
| John Snow Labs (clinical NLP, de-identification) | **Microsoft Presidio** (de-id); **medspaCy** (negation, sections); **MedCAT** → now CogStack/cogstack-nlp; scispaCy, cTAKES (U) | Presidio ✅ MIT. medspaCy ✅ MIT (v1.3.1, Nov 2024; slow). MedCAT ⛔ repo **archived Jul 2025**, use the successor; UMLS needs a license | Presidio ~11k★ | Presidio needs custom recognizers for HIPAA identifiers. Keep a reversible token map in a protected store. |
| Draftable / Relativity (versions and diffs) | diff-match-patch; OnlyOffice / Collabora for tracked changes (U) | diff-match-patch ⛔ **archived Aug 2024** (still works) | — | Store every draft as a version and diff by sentence. When the record changes, mark analyses whose page hashes changed as stale. |
| Physician functional-capacity questionnaires | **Docassemble** | ✅ MIT | — | Generates DOCX/PDF. Physician fields stay blank; answers are never scripted. |
| Known-answer testing (500 / 2.5k / 10k pages) | **promptfoo**; Ragas, DeepEval (U); Alpha Brain's own journey suite | ✅ MIT | promptfoo ~26k★ | Gold questions with known pages. Fail the build if a citation is wrong. |
| Local medical LLMs | MedGemma (⛔ HAI-DEF terms, not Apache; counsel must read them); Qwen, Llama, gpt-oss (check each license) | — | — | Test long-context recall yourself. Chunk per document. |

## F. Finance and trust, banking, migration, identity matching, FHIR, BI

| Commercial | Open-source alternative | License | Repo / maturity | Fit notes |
|---|---|---|---|---|
| Clio Accounting, TrustBooks, LeanLaw, CosmoLex (IOLTA) | **No open-source trust-accounting product.** Closest: Formance Ledger + a custom client-ledger and three-way-reconciliation layer | Formance ✅ MIT | formancehq/ledger ~1.4k★, active | **Buy this one** (see below). |
| Modern Treasury (ledgers, Expected Payments) | **Formance**; **Blnk** (ledger + reconciliation matching rules) | ✅ MIT; ✅ Apache-2.0 | Blnk ~550★, active | Neither has maker-checker built in. **Pattern:** an expected-payment row (client, period, amount, window) matched against BAI2 lines; missing, changed and zero-dollar items are "expected but unmatched / variance". |
| Modern Treasury payment orders, Bill.com, Confido Legal, Litify Digital Disbursements | None. **moov-io/ach** (NACHA file builder) + your own approval workflow | ✅ Apache-2.0 | ~570★, active | Maker ≠ checker, dual release above a threshold, 48-hour cool-off when bank details change. |
| Accounting Seed (GL) | **ERPNext** or **Odoo Community**; LedgerSMB; Beancount/hledger (single-user plain text) | ⚠️ GPL-3.0; LGPL-3 (U); Akaunting ⛔ custom license | — | Full GL, but no fiduciary concept. Odoo's trust module is paid (OPL-1). |
| TigerBeetle, Apache Fineract, Kill Bill | — | ✅ Apache-2.0 | — | Overkill, or the wrong model. Skip. |
| BofA CashPro API / BAI2 over SFTP | SFTP pull → Python `bai2` parser (U) / `ofxtools` (U) → ledger | check licenses | — | Never automate CashPro browser clicks with staff credentials. |
| AppFolio (rent into trust → fee → owner statement) | No open-source equivalent | — | — | **The closest analogy to LTD benefits.** One ledger account per client; on each receipt, post the client credit and the fee debit by contract rule; the statement is a date-range query. Recompute on reversals. |
| Curve (royalties), MD Clarity RevFind (contract vs remit) | No open-source equivalent | — | — | Same pattern: contract % rule → postings → variance worklist. |
| CaptivateIQ (commissions) | None needed | — | — | A rules table + SQL on the operating account. Never touches trust. |
| Universal Migrator (Total Office connector) | **dlt** or **pgloader** + **Great Expectations** for integrity checks; Airbyte | dlt ✅ Apache-2.0 (~6k★). pgloader (U). Great Expectations ✅ Apache-2.0 (~12k★). Airbyte ⛔ ELv2 core | — | No open-source Total Office connector exists, so map the schema by hand. **Universal Migrator (~$3.5k+) is still worth buying** for the extraction. |
| Senzing, Verato, NextGate (EMPI identity matching) | **Splink** (Fellegi-Sunter scoring with per-field match weights, so matches are explainable); dedupe; Zingg | Splink ✅ MIT (~2.5k★, active, UK Ministry of Justice). dedupe ✅ MIT (slower). Zingg ⚠️ AGPL | — | Emits scored pairs only, so it never auto-merges. **Pattern from EMPI:** auto-link above one threshold, human review in the middle band. |
| Fasten Health / 1upHealth (patient FHIR) | **Medplum** (full FHIR platform with auth); **HAPI FHIR** (server/client library) | ✅ Apache-2.0 each | Medplum ~2.7k★, active. Fasten OnPrem ⛔ **archived Feb 2026** | Only patient-directed access. Explicitly deferred in the Blueprint. |
| Datavant / ChartSwap (records retrieval) | None. It's a service, not software | — | — | Client upload stays the default. |
| Power BI | **Apache Superset**; Metabase | Superset ✅ Apache-2.0 (~75k★). Metabase ⚠️ AGPL + commercial EE | — | Superset has the cleanest license. Keeping Power BI is also fine in an M365 shop. |

### Where buying is still safer than open source
1. **Trust / IOLTA ledger.** No open-source project knows IOLTA rules: no negative client balances, monthly three-way reconciliation, audit-ready records. A bar audit lands on the firm. Buy CosmoLex, Clio Accounting or TrustBooks as the book of record, and build the expected-receipt matching and fee engine around it. Whether those products expose the API hooks this needs is **unverified**; check during discovery.
2. **Fax, SMS and email transport.** Open source can't replace the carrier. Buy BAA-covered transports: a Documo/eFax fax API, Twilio HIPAA or Azure Communication Services, and M365 for email.
3. **Total Office extraction.** Universal Migrator already has the connector.
4. **E-signature status.** DocuSeal or Documenso work, but if their self-hosted APIs are paywalled, keeping DocuSign is simpler.

### License risk register
| Risk | Items | Action |
|---|---|---|
| AGPL network copyleft | Twenty, EspoCRM, SuiteCRM, DocuSeal, Documenso, Nextcloud, Zammad, Metabase, Zingg, PyMuPDF | Run unmodified behind APIs, or publish your changes. Never vendor-modify them inside a closed service without counsel's review. |
| Source-available, not OSS | n8n (SUL), Camunda 8, Typebot (FSL), Directus (BSL), Airbyte (ELv2), Akaunting | Avoid, or get legal sign-off. |
| Model-weight licenses | Marker/Surya (RAIL-M, paid above $5M), MedGemma (HAI-DEF), pyannote (gated), Parakeet (CC-BY-4.0) | Check each model card before production use. |
| Archived / end-of-life | Camunda 7 CE, Fasten OnPrem, MedCAT (moved), diff-match-patch | Use the successor projects named above. |
| Open-core paywalls | Chatwoot audit logs, DocuSeal API, OpnForm SSO, Cal.com round-robin | Confirm the free tier covers the requirement. |

### Sources (from the research passes)
GitHub repo pages and API for every repo named above · camunda.com/blog/2024/04/licensing-update-camunda-8-self-managed · forum.camunda.io (Camunda 7 CE end-of-life) · isitreallyfoss.com/projects/windmill · soldevelo.com/blog/openimis-insurance-management · docs.documenso.com/docs/policies/licenses · docassemble.org/docs/license.html · typebot.io/blog/typebot-is-now-fair-source · cal.com/blog/calcom-v6-4 · chatwoot.com/docs/product/others/enterprise-edition · twilio.com/en-us/changelog/programmable-voice--sip--and-sms-are-now-hipaa-eligible · nextcloud.com/gdpr · espocrm.com/blog/espocrm-license · marmelab.com/blog/2026/01/09/open-source-crm-benchmark-2026.html · help.nextiva.com/article/third-party-api-integration · developer.cisco.com/docs/broadworks · help.gong.io/docs/nextiva.md · docs.espocrm.com/extensions/voip-integration/asterisk-integration-setup · docs.jambonz.org/open-source/commitment/oss-we-use · huggingface.co/jbarrow/FFDNet-L · developers.google.com/health-ai-developer-foundations/terms · apps.odoo.com (legal_trust_retainer_accounting) · beancount.io/blog/2026/07/30/law-firm-trust-accounting-iolta-three-way-reconciliation-guide
