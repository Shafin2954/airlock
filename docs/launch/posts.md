# Launch posts

Links assume the repo is `Shafin2954/airlock` and Pages is enabled.

- Repo: https://github.com/Shafin2954/airlock
- Airlock site: https://shafin2954.github.io/airlock/

---

## 1. Show HN — Airlock

**Title:** Show HN: Airlock – see what you've told ChatGPT/Claude, and redact secrets before you paste

**URL:** https://shafin2954.github.io/airlock/

**First comment (post right after submitting):**

I kept pasting stack traces and .env snippets into chat windows and only noticing the API key afterwards. Airlock is a set of static pages for the space between you and an AI chat. Nothing you load leaves the tab: the pages ship with a CSP of `connect-src 'none'`, so they can't make network requests even if they wanted to.

- Footprint: drop in your ChatGPT or Claude data export (.zip) and it lists every API key, password, account number and sensitive topic you've shared, chat by chat, with links so you can delete them. It reads the zip's central directory and only inflates the JSON entries, so multi-GB exports with images are fine.
- Scrub: paste text, and keys/tokens/emails/IPs become placeholders like [STRIPE_KEY_1]. Paste the model's answer back and the real values are restored. It also reveals hidden Unicode "tag" text that can carry prompt injections. Same engine as a zero-dependency CLI and a Claude Code hook that blocks prompts and tool calls containing credentials.
- Context Map: drop a project folder, see a treemap sized by tokens, drop the lockfile eating half your budget, copy the rest as one prompt.
- JSONL Lens: open JSONL files your editor chokes on, get a schema, stats and JS filters, and scan a whole dataset for secrets before you fine-tune on it.

Detection is regex plus checksums (Luhn, IBAN mod-97) and context hints, not ML, so it will miss things. Issues with real false positives/negatives are very welcome. MIT.

---

## 2. r/ClaudeAI — Airlock (Claude angle)

**Title:** I made a Claude Code hook that blocks prompts and tool calls containing API keys, plus a page that audits your Claude data export

**Body:**

Two things I wanted for myself:

**1. A hook that stops keys reaching the model.** `scrub hook` runs on UserPromptSubmit and PreToolUse (Bash/Write/Edit). If a prompt or tool call contains a credential (Anthropic/OpenAI/AWS/GitHub/Stripe keys, private keys, JWTs…) or hidden Unicode tag text, it's blocked with a message saying what was found.

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "scrub hook" }] }],
    "PreToolUse": [{ "matcher": "Bash|Write|Edit", "hooks": [{ "type": "command", "command": "scrub hook" }] }]
  }
}
```

Install: `npm i -g github:Shafin2954/airlock`

**2. Footprint: what have I already told Claude?** Export your data (Settings → Privacy → Export data), drop the zip into the page, and it lists secrets, identifiers and sensitive topics across chats, projects and attachments, with links to each chat so you can delete it. It runs entirely in the browser tab; the page can't make network requests.

There's also a web version of Scrub (paste, redact, paste the answer back, restore) and a token treemap for deciding what code to put in context.

Site: https://shafin2954.github.io/airlock/
Code (MIT): https://github.com/Shafin2954/airlock

It's pattern-based, so it will miss things and flag some things it shouldn't. Tell me which.

---

## 3. r/LocalLLaMA — Airlock (datasets angle)

**Title:** Browser tool to open huge JSONL datasets and scan them for leaked keys and PII before fine-tuning (local, no uploads)

**Body:**

If you build fine-tuning sets from real logs or chat exports, secrets and personal data get in. JSONL Lens is a static page that streams a JSONL file of any size into a virtualized table, infers a schema, shows top values and histograms per field, and lets you filter with plain JS (`r.messages.some(m => m.role === "tool")`).

"Scan for secrets" runs every string in every record through a detector (API keys, private keys, JWTs, emails, IPs, IBANs, card numbers with Luhn, hidden Unicode text), reports counts by type and by field, filters to the affected records, and exports the dataset redacted with consistent placeholders, so the same email becomes the same `[EMAIL_3]` everywhere.

Nothing leaves your machine. The page's CSP is `connect-src 'none'`, and you can save it and use it offline.

Same repo has Context Map (codebase treemap by token count) and a scrub CLI for pipelines:
`cat data.jsonl | scrub check --secrets-only` exits non-zero on a hit.

https://shafin2954.github.io/airlock/jsonl-lens/ · MIT · https://github.com/Shafin2954/airlock

Regex + checksums, not a model. I'd like to hear about misses on real datasets.
