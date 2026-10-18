<div align="center">

# Airlock

**Local-first tools for the space between you and your AI.**

See what you've already told AI. Strip secrets before you paste. See your codebase in tokens. Open the JSONL file nothing else will.<br>
Static pages, zero dependencies, and your data never leaves the browser tab.

[**Open the tools →**](https://shafin2954.github.io/airlock/) &nbsp;·&nbsp; [Footprint](https://shafin2954.github.io/airlock/footprint/) &nbsp;·&nbsp; [Scrub](https://shafin2954.github.io/airlock/scrub/) &nbsp;·&nbsp; [Context Map](https://shafin2954.github.io/airlock/context-map/) &nbsp;·&nbsp; [JSONL Lens](https://shafin2954.github.io/airlock/jsonl-lens/) &nbsp;·&nbsp; [CLI & Claude Code hook](#scrub-cli)

[![CI](https://github.com/Shafin2954/airlock/actions/workflows/ci.yml/badge.svg)](https://github.com/Shafin2954/airlock/actions/workflows/ci.yml)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
![network: none](https://img.shields.io/badge/network%20requests-none-brightgreen)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<img src="docs/screenshots/context-map.png" alt="Context Map: a treemap of the express repository sized by tokens, with a 200K context budget meter" width="900">

</div>

---

Every day people paste `.env` files, stack traces with tokens in them, and whole repos into chat windows. Airlock is a small set of tools that sit in between:

| Tool | What it does | Why you'd use it |
| --- | --- | --- |
| [**Footprint**](#footprint) | Reads your **ChatGPT or Claude data export** and shows every key, password, account number, address and private topic you've shared, which chats to delete, and a redacted copy. | Find the API key you pasted into a chat two years ago, and rotate it. |
| [**Scrub**](#scrub) | Replaces API keys, passwords, emails, IPs and usernames with placeholders like `[STRIPE_KEY_1]`, then **puts the real values back** into the AI's answer. | Ask for help with a broken deploy without handing over your production credentials. |
| [**Context Map**](#context-map) | Drop a folder → treemap sized by **tokens**, a context-window budget, and one-click packing into a prompt (secrets scrubbed, `.env` left out). | Find out the lockfile is 40% of your prompt *before* you paste it. |
| [**JSONL Lens**](#jsonl-lens) | Streams huge `.jsonl` files, infers the schema, shows top values and histograms per field, filters with plain JavaScript, and **scans the whole dataset for secrets and personal data**. | Check a fine-tuning set or a log dump for leaked tokens and emails before you share it. |

**Nothing is uploaded.** Each page ships a Content-Security-Policy with `connect-src 'none'`, so the browser itself refuses to send data anywhere. Open DevTools → Network and check. You can also save any page and use it offline, or open the HTML files straight from a clone.

## Footprint

<img src="docs/screenshots/footprint.png" alt="Footprint report for a ChatGPT export: 3 secrets, 3 identifiers, 1 hidden-text finding and 7 chats with sensitive topics" width="900">

ChatGPT and Claude both let you download everything you've ever typed. People paste API keys, `.env` files, bank details, medical worries and work secrets into those chats and forget. Footprint reads your export **in your browser** and shows you what's in it:

- **Secrets to rotate:** API keys, tokens, passwords in URLs and the like (Scrub's 29 secret detectors). If one is listed, treat it as exposed, even after deleting the chat.
- **Personal identifiers:** emails, phone numbers, card numbers (Luhn-checked), IBANs (checksum-checked), US SSNs, IP addresses.
- **Hidden text:** invisible "smuggled" characters you pasted in (a prompt-injection vector), decoded so you can read them.
- **Sensitive topics:** health, money, legal, relationships, where you live, identity & documents, confidential work. Counted only in sentences where you talk about yourself ("I", "my"…); uploaded files and custom instructions count regardless. This part is keyword-based: expect some misses and some noise.
- **What to do:** chats ranked by exposure, each with a link to open it in ChatGPT or Claude and delete it, plus a checklist report (`.md`) and a **redacted copy** of your export with every finding replaced by a placeholder.

It reads the export `.zip` directly (only `conversations.json`, and `projects.json` for Claude; images are never read) via the zip's central directory, so multi-gigabyte exports are fine. In our test (Node), a 19 MB export with 40,000 messages was analysed in about a second. Values are never shown in full anywhere in the report, including excerpts.

How to get your export: **ChatGPT**: Settings → Data controls → Export data. **Claude**: Settings → Privacy → Export data. Both email you a download link. (Menu names change; look for "export data".) Deleting a chat removes it from your history; providers may keep data for a period under their own policies, and saved **memories** are separate from chats, so review those too.

## Scrub

<img src="docs/screenshots/scrub.png" alt="Scrub replacing secrets in an .env file and curl command with colour-coded placeholders" width="900">

- **Paste → redact → copy.** 41 detectors: OpenAI, Anthropic, AWS, GitHub, GitLab, Stripe, Slack, Google, Hugging Face, npm, PyPI, SendGrid, Twilio, Groq, Replicate, DigitalOcean, Shopify, Telegram, Azure, JWTs, private-key blocks, passwords in URLs, `Authorization` headers, `KEY=value` assignments, plus emails, IPv4/IPv6, MAC addresses, card numbers (Luhn-checked), IBANs (checksum-checked), US SSNs (only next to an "SSN"-type hint), phone numbers (opt-in), and usernames in `/Users/…` / `C:\Users\…` paths.
- **Hidden text.** Invisible Unicode "tag" characters (ASCII smuggling), long runs of zero-width characters and text-direction overrides (Trojan Source) are replaced with a visible marker like `[HIDDEN TEXT: "ignore previous instructions…"]`, so you see what was hidden instead of passing it to the model. Emoji that legitimately use these characters (flags, family emoji) are left alone.
- **Reversible.** The same value always gets the same placeholder. Paste the model's reply into *Restore* and every `[EMAIL_1]` turns back into the real address. The map lives in the tab's memory only.
- **Your words too.** Add client names or project codenames and they become `[TERM_1]`.
- **Few false positives.** Tested against real source trees (Go's `net/http`, CPython's stdlib, npm) to skip things like `password = get_password()`, `max_tokens: 4096`, `${API_KEY}`, RFC section numbers and `std::vector`.

## Context Map

- **Drop a folder** (or pick one). Respects `.gitignore` (nested ones too), skips binaries and `node_modules`/`dist`/`.venv`/…, and greys out lockfiles, minified bundles and source maps.
- **Treemap sized by tokens.** Hover for exact counts, click to include/exclude, click a folder name to zoom.
- **Budget meter** for 32K → 2M windows, and *Fit to budget* drops the largest files until it fits.
- **Paste-ready output** as XML (`<file path="…">`) or Markdown, with a directory tree and your instructions on top.
- **Safe by default.** `.env`, keys and credential files are excluded; anything secret-looking inside the selected files is replaced via Scrub's engine.

> Token counts are an estimate. The estimator is calibrated against OpenAI's `o200k_base` on ~800 real source files: overall bias ≈ 0%, average per-file error ≈ 8%. Other models' tokenizers differ, so leave some headroom.

## JSONL Lens

<img src="docs/screenshots/jsonl-lens.png" alt="JSONL Lens filtering 20,000 API log records by status and latency, with a latency histogram and a record inspector" width="900">

- **Big files.** Streams the file and virtualizes the table. In our test a 1,000,000-line / 156 MB file loaded in under 3 s, filtered in about 1 s and sorted in half a second (headless Chromium).
- **Schema for free.** Every field path with its types and how often it's present. Click a field for top values, or for numbers, min/p50/p90/p99/max and a histogram.
- **Filter in JavaScript.** `r.status >= 500 && r.user?.plan === "pro"`, `r.messages?.some(m => m.role === "tool")`. Click a value to add it as a filter.
- **Sort, inspect, export.** Sort any column, step through records with <kbd>j</kbd>/<kbd>k</kbd>, export the filtered slice as `.jsonl`.
- **Scan for secrets.** Runs Scrub over every string in every record and reports how many records contain secrets, personal data or hidden text, by type and by field. Click a row to see those records; export the whole dataset redacted, with consistent placeholders.
- Handles a top-level JSON array as well, and flags lines that aren't valid JSON.

Try it with the built-in sample: 20,000 synthetic API log lines, with a few leaked emails and bearer tokens for the scan to find.

## Scrub CLI

The same engine as a zero-dependency Node CLI (Node 18+).

```bash
npm i -g github:Shafin2954/airlock     # installs the `scrub` command

# redact clipboard, keep a map, restore the reply later
pbpaste | scrub --map .scrub.json | pbcopy
pbpaste | scrub restore --map .scrub.json

# fail a CI job or a git hook if a diff contains a secret
git diff --cached | scrub check --secrets-only

# hide your own words too
scrub --term "Acme Corp" --term Bluebird notes.md
```

`scrub rules` lists every detector; `--enable phone`, `--disable email`, `--allow <value>`, `--redact-private-ips`, `--secrets-only`, `--pii-only` and `--hidden-only` tune them. Map files are written with `0600` permissions because they contain the original values.

### Claude Code hook

`scrub hook` reads a [Claude Code hook](https://code.claude.com/docs/en/hooks) event from stdin and blocks it (exit code 2) when a prompt or tool call contains a credential **or hidden smuggled text** (so a prompt injection hiding in pasted content, or in content an agent is about to write, gets stopped). The message names what it found but never echoes a secret.

```jsonc
// .claude/settings.json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "scrub hook" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash|Write|Edit", "hooks": [{ "type": "command", "command": "scrub hook" }] }
    ]
  }
}
```

### As a library

```js
const scrub = require("airlock-tools"); // or <script src="scrub/core.js"> → window.ScrubCore

const { text, vault } = scrub.redact("mail jane@corp.io from 203.0.113.9");
// text: "mail [EMAIL_1] from [IP_1]"
scrub.restore("I wrote to [EMAIL_1]", vault).text; // "I wrote to jane@corp.io"
```

## Run it yourself

No build step. Clone and open `index.html`, or serve the folder:

```bash
git clone https://github.com/Shafin2954/airlock && cd airlock
npx serve .            # or python3 -m http.server
```

To host your own copy, enable **Settings → Pages → Source: GitHub Actions**; [`pages.yml`](.github/workflows/pages.yml) deploys on every push to `main`.

## Development

```bash
npm test               # unit tests (node:test, no dependencies)
npm run e2e            # browser tests (needs: npm i --no-save playwright && npx playwright install chromium)
node tests/e2e.mjs --screenshots --repo <some-folder>   # regenerate README screenshots
```

```
scrub/        core.js (detection engine, browser + Node), cli.js, index.html
context-map/  core.js (tokens, .gitignore, treemap, packing), index.html
jsonl-lens/   core.js (schema, filters, stats), index.html
footprint/    core.js (zip reader, ChatGPT/Claude parsers, topics, report), index.html
assets/       shared CSS + tiny helpers
tests/        unit tests and Playwright checks
```

## Limits, honestly

- Scrub uses patterns plus heuristics. It catches the common cases well; it can't promise to catch everything (a password with no telling key name next to it looks like any other word). Glance at the output before you send it.
- Token counts are estimates (see above).
- JSONL Lens keeps lines in memory, so multi-gigabyte files need a machine with the RAM to match.
- Footprint's topic detection is a keyword heuristic, not an AI classifier: it will miss things said indirectly and occasionally flag harmless sentences. Secrets and identifiers use Scrub's validated detectors. Export formats are undocumented and change; if your export isn't recognised, open an issue (with fake data).

## Roadmap

Ideas, roughly in order. PRs welcome.

- [ ] Scrub as a browser extension that warns inside ChatGPT / Claude / Gemini text boxes
- [ ] Exact tokenizers (optional download) for Context Map
- [ ] Footprint: Gemini (Google Takeout) and Copilot exports
- [ ] Agent-transcript view in JSONL Lens (Claude Code, Codex, OpenAI/Anthropic message formats)
- [ ] Context Map: load a public GitHub repo by URL
- [ ] More detectors. [Open an issue](https://github.com/Shafin2954/airlock/issues/new?template=detector.md) with a format and a fake example.

## License

[MIT](LICENSE). If Airlock kept a key out of a chat log, a ⭐ helps other people find it.
