# One header everywhere, Settings in sections, ChatGPT on a model the account offers — 4 October 2026

Asked by Vikas.

- **ChatGPT didn't work:** Alpha passed Codex the model in `~/.codex/config.toml` (`gpt-6-astra`), which
  the account doesn't offer, so every run failed. `codex_account.models()` now reads the models the
  account offers from Codex's own picker list (`~/.codex/models_cache.json`, visible ones, Codex's
  order); the config's model is used only while offered, else the first offered (now GPT-5.6-Sol).
  The person can pick another in Settings → Thinks with (`PUT /api/thinking/model`, kept as the
  `codex_model` preference, journaled); a pick the account stops offering falls back the same way.
  The preference read for runs moved to `world/preferences.read` so `codex_account` and `route`
  share it.
- **No descriptions:** a page or row says what it is for behind an ⓘ (`InfoTip`), never in text.
- **One header** (`ui/PageHeader`): left, the two places above (small, each opens) and the page's
  name large with its ⓘ; right, the page's toggles and actions. Used by Home, Activity (its filters
  as a toggle), People & Companies, a person's page, Intelligence (the tabs as a toggle, the title
  is the tab), a skill's and an automation's page (no more back buttons), a module's page, Tools'
  interviews and Settings.
- **Settings in sections:** Thinks with, Appearance, Your data, Defaults, switched by the toggle
  in the header (the last one remembered in this window), instead of one long scroll.

## What ran

- Core: ruff, mypy clean; `test_codex.py` with a new test (only offered models used; the pick,
  a vanished pick, no list known). On this Mac the chosen model is `gpt-5.6-sol`.
- Desktop: typecheck clean; all tests pass (three wrapped in `TooltipProvider` for the ⓘ).
- The window: see the session's screenshots; a real ChatGPT turn not run here.
