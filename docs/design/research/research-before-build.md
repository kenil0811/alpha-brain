# Research before a build: the evidence (9 October 2026)

Why this was looked at: the "Car Wash Site Scoring" module of 9 October (plan in two minutes,
build in fourteen; five tables, one worked example, a recipe in the note, no skill or
automation; a weighted average with no gates that called a site with nine washes within 2.7
miles "Favorable"). Alpha wrote the spec itself from a one-line ask and four one-word answers,
and the person said yes to Alpha's own proposal. Kenil's direction: a research pass before any
build, which suggests what such a thing could have, how well each piece can be built, and asks
what matters, so the person keeps, skips or defers each piece and then one build runs.

Four passes, each by a subagent with web search, reading pages and papers (not titles). Marks:
**V** the page or paper was read; **S** a secondary source or a search excerpt; **R** recalled,
unverified.

## 1. Agents under-ask, and silent assumptions are the default failure

- LLMs silently fill unspecified requirements about 41% of the time; such prompts are twice as
  likely to regress when the model or prompt changes (What Prompts Don't Say, arXiv 2505.13360,
  V). On underspecified SWE-bench issues, interaction gives up to a 74% gain, and models
  "struggle to distinguish" clear issues from vague ones (Ambig-SWE, 2502.13069, V).
- Seventeen models score 13.7% on ambiguous questions against 71.5% with full context;
  "systematic overconfidence"; over fifteen months search skill rose about 7x and interaction
  skill stayed flat (InteractComp, 2510.24668, V). The under-clarification bias is consistent
  across ten LLMs and worsens with dialogue depth (ClarifyMT-Bench, 2512.21120; Knowing-but-
  Not-Showing, 2605.25284, V).
- When a spec arrives over several turns, performance drops 39% on average; the cause is early
  assumptions, premature commitment and no recovery (LLMs Get Lost, 2505.06120, V). This is the
  8 October car wash conversation exactly.
- A research step before generating measurably helps: Paper2Code's plan-and-analyse first lifts
  scores 3.28→3.72 (2504.17192, V); reusing existing repositories lifts a task benchmark
  40.7→62.9% with 95% fewer tokens (RepoMaster, 2505.21577, V). But a lookup step helps only if
  its output is checked: the AI Scientist's novelty check labelled known techniques novel
  (2502.14297, V).

## 2. Over-asking is real; the right questions, in the right window

- 52% of 300 unscripted agent sessions over-asked, and no frontier model asks in the optimal
  window (Ask Early/Late/Right, 2605.07937, V). Proactive models "fail to stay silent"
  (ProactiveBench, 2410.12361, V). Rewarding relevance and answerability matches GPT-5's resolve
  rate with 41% fewer questions (CLARITI, 2604.14624, V). Gating questions on measured
  disagreement (sampled programs disagreeing on test inputs) flagged a third of tasks and lifted
  Pass@1 71→81 (ClarifyGPT, 2310.10996, V).
- Timing: goal-level clarification loses nearly all its value once about 10% of the work is
  done; input-level questions stay useful to about half; asking past mid-run is worse than never
  asking (2605.07937, V).
- Human tolerance: 1,025 conversations, a median of 7 answers per target, about half of people
  tolerate 6–10; stop reasons were fatigue and irrelevant questions, both rising when the
  system's answers were poor (Zou et al. 2020, 2008.00279, V). High-quality questions raise
  success and satisfaction; low and mid-quality ones harm: no question beats a bad one (Zou et
  al. TOIS 2023, V abstract). Specific questions ("Who are you shopping for?") get up to five
  times the engagement of generic ones; 3–5 options beat 2 (Bing logs, 2006.00166, V; Rahmani,
  2402.01934, V). Claude Code's AskUserQuestion: 1–4 questions a call, 2–4 options each, plus
  "Other" (code.claude.com/docs/en/agent-sdk/user-input, V).

## 3. How the deep-research products do it, and where they fail

- OpenAI Deep Research: 5–30 minutes; in ChatGPT an intermediate model clarifies intent first;
  the API skips that, and the cookbook recommends a clarifier that picks "the 3–6 questions that
  would most reduce ambiguity or scope creep" and a rewriter that marks unstated dimensions as
  open rather than inventing them (developers.openai.com/cookbook/…/introduction_to_deep_research_api,
  V). Gemini Deep Research shows "a multi-step research plan for you to either revise or
  approve" before running, 5–10 minutes (blog.google, support.google.com/gemini/answer/15719111,
  V).
- Anthropic's multi-agent research system (anthropic.com/engineering/multi-agent-research-system,
  V): a lead agent plans and spawns subagents with explicit briefs (objective, output format,
  sources, boundaries; vague briefs duplicated work); breadth scaled by rule (a simple fact: one
  agent, 3–10 calls; a comparison: 2–4 subagents; early versions spawned fifty for simple
  queries); "start wide, then narrow"; a separate citation pass at the end; multi-agent costs
  about 15x a chat's tokens and token use explains 80% of the benchmark variance; one LLM-judge
  call scoring accuracy, citation accuracy, completeness, source quality and tool efficiency.
- Failures: deep-research agents hallucinate or dead-link 10.7% of URLs against 4.8% for a
  search-augmented single model, while emitting far more citations (2604.03173, V). In
  multi-agent research 84.7% of final-report errors originate at the orchestrator's merge; only
  single-document summarisers are reliable (2608.24306, V abstract). Length correlates weakly
  with quality (r≈0.25) and Gemini's longest reports scored lowest, with content "recycled
  across sections" (ResearchRubrics 2511.07685; ReportEval 2510.07861, V); failures are mostly
  implicit reasoning and synthesis, not retrieval. Bullet structure scored highest on coherence
  (DeepResearch Bench, 2506.11763, V).
- Research consumed by a downstream step rather than a reader: constraints as a JSON list with a
  confidence equal to constraints satisfied ÷ total (ODR+, 2508.10152, V); parallel hypothesis
  branches compared on evidence before commitment (HypoSearch, 2609.01294, V); a findings graph
  with a verification gate that drops thin-evidence sections (VeriTrace, 2605.26081, V).

## 4. How the builder agents handle a vague "build me X"

- Kiro: drafts requirements.md "WITHOUT asking sequential questions first", "MAY ask targeted
  questions", then needs approval before design; design "MUST identify areas where research is
  needed", codebase only (kiro.dev/docs/specs, V). GitHub Spec Kit: /specify makes "informed
  guesses based on context and industry standards" logged under Assumptions, at most three
  [NEEDS CLARIFICATION] markers; /clarify asks exactly one question at a time, at most five,
  recommended option first, 2–5 options; /plan turns each unknown into a research task written
  as Decision / Rationale / Alternatives (github.com/github/spec-kit templates, V).
- Claude Code plan mode: "If you could describe the diff in one sentence, skip the plan";
  "Interview me in detail using AskUserQuestion, then write a complete spec"; complaints about a
  60 s timeout that continued without an answer (V, S). Cursor, Replit, Lovable, Devin, Manus:
  an editable plan (markdown or a view with key decisions, data models, steps) with
  Approve/Skip, versions kept; Lovable may conclude the change isn't worth making; Devin waits
  thirty seconds then proceeds (docs, V/S). Only Bolt documents web research while planning
  (support.bolt.new/best-practices/plan-mode, V). No builder researches competitors or open
  alternatives before proposing; no product publishes a measurement of any of this.

## 5. How good product people scope from a vague ask

- The job, not the feature list: the switch interview reconstructs one real episode backwards
  ("when did you first start thinking about this?", "and then what happened?"), captures events
  not generalisations (jobstobedone.org, V); the Mom Test: specifics in the past, "why do you
  want that?" on every feature request (S). Stark's first meeting learns why this, why now, the
  desired outcome and how success is judged, "note the glaring lack of questions about features
  or scope" (jonathanstark.com/fighting-butterflies, V); Weiss: objectives, metrics and value
  before any proposal (V).
- Torres' opportunity solution tree: outcome → opportunities → at least three solutions each →
  assumption tests; a disguised solution is caught by "is there more than one way to address
  this?" (producttalk.org, V).
- Prioritisation: DSDM's MoSCoW, Must = minimum usable subset, "if a workaround exists, even a
  manual one, it is not a Must", Musts at most 60% of effort, Won't-haves "this time" and
  recorded; everything-is-a-Must means insufficient decomposition (agilebusiness.org, V). Kano:
  must-be features disqualify by absence and earn nothing by presence; delighters decay into
  basics (V). Shape Up: appetite first ("start with a number and end with a design"), a default
  soft no to raw ideas, a pitch of problem / appetite / solution / rabbit holes / no-gos
  (basecamp.com/shapeup, V). Competitive teardown in practice is Kano-shaped: table stakes vs
  differentiators (S); "it's a mistake to assume that your competitors are in any way smarter"
  (Traynor, intercom.com, V).
- Choice: the jam study's overload replicates only under set complexity, task difficulty,
  preference uncertainty and an effort-minimising goal (Chernev et al. 2015, 99 observations,
  V), which is a non-technical person facing a feature list; the meta-analysis of 50 experiments
  found a mean effect near zero otherwise (Scheibehenne 2010, V). Defaults: 58 studies,
  n=73,675, d=0.68, strongest when the default reads as the designer's recommendation
  (Jachimowicz 2019, V abstract).

## What this means for Alpha (the rules a design should follow)

1. Look up before asking; ask only what cannot be known; never fill silently: every assumption
   is shown and reversible (§1, §4 Spec Kit's Assumptions).
2. The questions that change the goal come first, before any work; input questions after the
   research; nothing during the build (§2 timing).
3. A round is few, specific, with 3–4 options and Alpha's pick first; a bad question is worse
   than none; a question is earned by a real disagreement (products differ on it and the answer
   depends on the person), not by habit (§2).
4. The research scales to the ask by explicit rule, starts wide then narrows, has each sub-run
   summarise single sources, verifies every URL by code, attributes citations in a separate
   pass, and checks the merge: the merge is where errors come from (§3).
5. The output is structured for the next step, not a report: pieces with evidence (quote and a
   resolved URL), how each would be built here, buildability and a recommendation; ranked, short,
   bulleted (§3).
6. Present it as a consultant would: the job's questions answered first; table stakes pre-kept
   as one block; differentiators as the real choices, 3–5 at a time, each tied to the job with
   why you might and might not; won't-haves named "not this time" and kept; a recommended
   default on every choice; the plan after the person's choices, as one editable thing with one
   yes (§4, §5).
7. Say how long it takes and let the person skip it; never proceed on a timeout (§4).
