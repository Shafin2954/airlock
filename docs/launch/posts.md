# Launch posts

Links assume the repo stays `Shafin2954/anything` and Pages is enabled. If you rename or split the repo, replace every link first.

- Repo: https://github.com/Shafin2954/anything
- Airlock site: https://shafin2954.github.io/anything/
- imok: https://github.com/Shafin2954/anything/tree/main/imok

---

## 1. Show HN — Airlock

**Title:** Show HN: Airlock – see what you've told ChatGPT/Claude, and redact secrets before you paste

**URL:** https://shafin2954.github.io/anything/

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

Install: `npm i -g github:Shafin2954/anything`

**2. Footprint: what have I already told Claude?** Export your data (Settings → Privacy → Export data), drop the zip into the page, and it lists secrets, identifiers and sensitive topics across chats, projects and attachments, with links to each chat so you can delete it. It runs entirely in the browser tab; the page can't make network requests.

There's also a web version of Scrub (paste, redact, paste the answer back, restore) and a token treemap for deciding what code to put in context.

Site: https://shafin2954.github.io/anything/
Code (MIT): https://github.com/Shafin2954/anything

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

https://shafin2954.github.io/anything/jsonl-lens/ · MIT · https://github.com/Shafin2954/anything

Regex + checksums, not a model. I'd like to hear about misses on real datasets.

---

## 4. Show HN — imok

**Title:** Show HN: imok – open-source "Are You Dead?" check-in that runs free in your Google account

**URL:** https://github.com/Shafin2954/anything/tree/main/imok

**First comment:**

In January a Chinese app called "Are You Dead?" went viral: one button, tap it daily, and if you don't, your emergency contact gets an email. Then it started charging. The idea seemed too simple and too important to sit behind a subscription, so I built an open-source version you own.

How it works: you tap "I'm OK" at least every N hours. Before the deadline you get a reminder (ntfy push with a one-tap check-in button, email or Telegram). Miss it and, after a grace period, your contacts get an alert with your last check-in time and a note you wrote (address, who has a key). Still nothing 12 hours later, it escalates to backup contacts. When you check in, everyone alerted gets an all-clear. There's also "I need help" (alert everyone now) and "Going away" (pause).

Two ways to run it:
- Paste one file into Google Apps Script. Google runs the timer, Gmail sends the email, and there's no server to keep alive. About 10 minutes.
- Self-host: zero-dependency Node server or Docker image, one JSON state file, email over SMTP, ntfy, Telegram, webhooks.

Design choices HN might care about:
- The logic is a pure state machine shared by both versions. The Apps Script file is tested by running the built file in a VM with fake Google services over simulated days.
- Opening a link never checks you in. Only a POST does, because email link scanners GET every link, and a scanner shouldn't be able to say you're fine.
- Contacts never receive your check-in link, and the page never shows their addresses.
- The README has a "How safe is this, really?" section. It isn't an emergency service, alerts are hours late by design, and messages and servers fail. There's a heartbeat URL so you find out if imok itself dies.

Feedback I'd most like: failure modes I haven't thought of.

---

## 5. r/selfhosted — imok

**Title:** imok: self-hosted daily check-in that alerts your contacts if you stop responding (Docker, zero deps, ntfy/email/Telegram/webhook)

**Body:**

For people who live alone: tap "I'm OK" once a day. Miss it and you get reminders, then your contacts are alerted, then backups. Everyone gets an all-clear when you check in. Basically the "Are You Dead?" app that went viral this year, but self-hosted and free.

- Docker image or plain Node 18+, no npm dependencies, state in one JSON file
- Channels: SMTP email (STARTTLS/465), ntfy (own server supported, with a one-tap "I'm OK" action on reminders), Telegram, generic webhook (Home Assistant, SMS gateways, whatever)
- Mobile check-in page you can add to the home screen, behind a random 40-char token path
- Failed sends retry for about 1.5h and show on the page
- `/healthz` plus an optional `heartbeatUrl` (e.g. healthchecks.io), because a dead watcher is the obvious failure mode
- Secrets via env vars if you don't want them in config.json

```sh
mkdir -p data && cp server/config.example.json data/config.json   # edit it
docker compose up -d
docker compose logs imok   # prints your private link
```

If you'd rather not run a server for this (fair, uptime matters here), the same project runs as a single Google Apps Script file.

https://github.com/Shafin2954/anything/tree/main/imok · MIT

Not an emergency service. The README spells out the limits.

---

## 6. Non-technical communities — imok (r/LivingAlone, r/AgingParents, etc.)

**Title:** I made a free "I'm OK" daily check-in that alerts family if you don't respond. No app, no subscription.

**Body:**

Living alone, I've wondered how long it would take anyone to notice if something happened. There's a paid app for this now. I made a free one.

You get a big "I'm OK" button on your phone's home screen. Tap it once a day. If you forget, it reminds you. If you still don't tap it, the people you choose get a message saying you haven't checked in, with a note you wrote (your address, who has a spare key). As soon as you tap the button, they get an "all OK".

It runs on your own Google account, so it's free and there's no company holding your data. Setup takes about 10 minutes and needs some copy-pasting; the guide walks through every step. If that's too technical for a parent, someone in the family can set it up for them.

Guide: https://github.com/Shafin2954/anything/tree/main/imok

It's not an emergency service. If something happens, the alert can take hours. It's for "nobody noticed for days", not for emergencies.
