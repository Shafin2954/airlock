# Handoff for a local Claude Code session

Written at the end of a cloud session on branch `ccr-c4e884df-op7idu`. Read this first. Delete it once the work below is done.

## Starter prompt

Paste this into Claude Code from the repo root:

> Read HANDOFF.md. Check out `ccr-c4e884df-op7idu`, run every test suite listed there, and tell me what passes. Then help me with "Next steps", one at a time. Ask before merging, pushing, renaming or creating repos.

## The repo

`Shafin2954/anything`. Goal: projects that earn GitHub stars. The name is a placeholder. It holds five independent projects, all MIT, no runtime dependencies.

| Folder | What | Stack |
|---|---|---|
| root: `index.html`, `assets/`, `scrub/`, `context-map/`, `jsonl-lens/`, `footprint/` | **Airlock**: local-first browser tools for working with AI. Footprint (audit ChatGPT/Claude data export), Scrub (redact secrets, restore after; CLI + Claude Code hook), Context Map (token treemap), JSONL Lens (big JSONL viewer + secret scan). Static pages, CSP `connect-src 'none'`. | Vanilla JS, UMD cores |
| `peekbar/` | Chromium MV3 extension: Firefox-style reveal-on-hover toolbar in F11 full screen. | Vanilla JS |
| `cloak/` | Chromium MV3 extension: decoy new tab; passphrase in the search box reveals an AES-GCM encrypted link vault. | Vanilla JS, WebCrypto |
| `cloak-vault/` | Desktop launcher: blank decoy Chrome by default, real profile encrypted at rest (scrypt + AES-256-GCM). | Python 3, `cryptography` |
| `imok/` | Daily "I'm OK" check-in; alerts contacts if you go silent. Open-source take on the viral "Are You Dead?" app. Runs as one Google Apps Script file or a Node/Docker server. | Vanilla JS, Node 18+ |

Each folder has its own README with an honest limits section. Read those before changing behavior.

## Tests

All green in CI run #10 (commit `d434db3`, 10 jobs). Workflow: `.github/workflows/ci.yml`.

```sh
npm test                                   # Airlock unit tests (57)
npm run e2e                                # Airlock browser checks (needs Playwright)
node peekbar/tests/e2e.mjs                 # extension e2e (headed Chromium with --load-extension)
node --test cloak/tests/crypto.test.js && node cloak/tests/e2e.mjs
cd cloak-vault && python -m unittest discover -s tests -p 'test_*.py'
node --test imok/tests/*.test.js           # imok (42): core, delivery, Apps Script VM sim, server, SMTP
node imok/apps-script/build.js --check     # Code.gs must match its sources
node imok/tests/e2e.mjs                    # imok page in Chromium
```

Playwright: `npm install --no-save playwright@1.56.1 && npx playwright install chromium`. Add `--screenshots` to an e2e script to regenerate the images in that project's `docs/`.

## Conventions

- No dependencies in shipped code. Logic lives in pure, testable cores; UI and adapters stay thin.
- Fake secrets in tests are built at runtime by string concatenation, so the repo never contains a real-looking key and secret scanners stay quiet.
- READMEs say plainly what each tool can't do. Keep that.
- imok: after editing `imok/core.js`, `notify.js`, `page.html` or `apps-script/src.js`, run `node imok/apps-script/build.js` and commit `Code.gs`. CI fails otherwise.

## Known issues

- Scrub self-scan flags `"passwd": cmd_passwd` in `cloak-vault/cloak_vault.py` (a command table, not a secret). Left as-is.
- imok's Apps Script version is tested only in a simulated Google runtime. Nobody has run it on a real Google account yet: deploy, permissions screen, `doPost` from the ntfy one-tap button.
- imok's Docker image only built in CI. The cloud machine had no Docker daemon.
- Topic detection in Footprint is a keyword heuristic.

## Next steps (owner's decisions)

1. **Test imok for real.** Follow `imok/README.md` Option A on a real Google account. Use it on a phone for a day. Try the ntfy one-tap check-in.
2. **Merge** `ccr-c4e884df-op7idu` into `main`. No PR was opened.
3. **GitHub Pages:** Settings → Pages → Source: GitHub Actions. `.github/workflows/pages.yml` deploys the Airlock site from `main`.
4. **Rename or split.** `anything` is a weak name. Option: keep this repo as Airlock and move `imok/`, `peekbar/`, `cloak/`, `cloak-vault/` to their own repos (`git subtree split --prefix=imok` keeps history). After that, fix links in the READMEs, `index.html`, `package.json` (install command `npm i -g github:Shafin2954/anything`) and `docs/launch/posts.md`.
5. **Launch.** Drafts in `docs/launch/posts.md`: Show HN ×2, r/ClaudeAI, r/LocalLLaMA, r/selfhosted, and a plain-language imok post. Check each subreddit's rules first (self-promotion, AI-assistance disclosure). One Show HN per day at most. Post Airlock and imok on different days.

## Ideas researched but not built

Crowded already: subscription finders, dead man's switches, Google Takeout fixers, data-broker removal, Postman alternatives, a Linux WhatCable (official port underway). Avoid unless there's a sharp new angle.
