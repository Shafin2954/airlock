const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "scrub", "cli.js");
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: "utf8" });
const token = ["ghp_", "Zx8Kq2Lm9Vb4Nc7Hj3Gf6Ds1Pw5Rt0Ya8Ue2Io"].join("");

test("redact → restore round trip through a map file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scrub-"));
  const map = path.join(dir, "map.json");
  const r = run(["--map", map], `mail bob@corp.io key ${token}\n`);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "mail [EMAIL_1] key [GITHUB_TOKEN_1]\n");
  if (process.platform !== "win32") assert.equal(fs.statSync(map).mode & 0o777, 0o600);
  const back = run(["restore", "--map", map], "Wrote to [EMAIL_1].");
  assert.equal(back.stdout, "Wrote to bob@corp.io.");
});

test("check exits 1 on findings, 0 when clean", () => {
  assert.equal(run(["check"], `t=${token}`).status, 1);
  assert.equal(run(["check"], "nothing here").status, 0);
  assert.equal(run(["check", "--pii-only"], `t=${token}`).status, 0);
});

test("hook blocks secrets in prompts and tool input, ignores PII", () => {
  const p = run(["hook"], JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: `use ${token}` }));
  assert.equal(p.status, 2);
  assert.match(p.stderr, /GitHub token/);
  assert.doesNotMatch(p.stderr, new RegExp(token)); // never echo the secret
  const t = run(["hook"], JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { content: { nested: [`k=${token}`] } } }));
  assert.equal(t.status, 2);
  assert.equal(run(["hook"], JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "mail a@corp.io" })).status, 0);
  assert.equal(run(["hook"], "not json").status, 0);
});

test("unknown rule ids are rejected", () => {
  assert.equal(run(["--enable", "nope"], "").status, 2);
});
