# Handoff for a local Claude Code session

Split out of `Shafin2954/anything` on 2026-10-19 (history kept). Read this first. Delete it once the work below is done.

## Starter prompt

Paste this into Claude Code from the repo root:

> Read HANDOFF.md, run the test suites listed there, and tell me what passes. Then help me with "Next steps", one at a time. Ask before merging or pushing.

## The repo

`Shafin2954/airlock`: local-first browser tools for working with AI. Footprint (audit ChatGPT/Claude data export), Scrub (redact secrets, restore after; CLI + Claude Code hook), Context Map (token treemap), JSONL Lens (big JSONL viewer + secret scan). Static pages, CSP `connect-src 'none'`. Vanilla JS, UMD cores, MIT, no runtime dependencies.

The README has an honest limits section. Read it before changing behavior.

## Tests

Workflow: `.github/workflows/ci.yml`.

```sh
npm test                                   # Airlock unit tests (57)
npm run e2e                                # Airlock browser checks (needs Playwright)
```

Playwright: `npm install --no-save playwright@1.56.1 && npx playwright install chromium`. Add `--screenshots` to the e2e script to regenerate the images in `docs/`.

## Conventions

- No dependencies in shipped code. Logic lives in pure, testable cores; UI and adapters stay thin.
- Fake secrets in tests are built at runtime by string concatenation, so the repo never contains a real-looking key and secret scanners stay quiet.
- READMEs say plainly what each tool can't do. Keep that.

## Known issues

- Topic detection in Footprint is a keyword heuristic.

## Next steps (owner's decisions)

1. **GitHub Pages:** Settings → Pages → Source: GitHub Actions. `.github/workflows/pages.yml` deploys the Airlock site from `main`.
2. **Launch.** Drafts in `docs/launch/posts.md`: Show HN, r/ClaudeAI, r/LocalLLaMA. Check each subreddit's rules first (self-promotion, AI-assistance disclosure). One Show HN per day at most.

## Ideas researched but not built

Crowded already: subscription finders, dead man's switches, Google Takeout fixers, data-broker removal, Postman alternatives, a Linux WhatCable (official port underway). Avoid unless there's a sharp new angle.
