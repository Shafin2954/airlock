#!/usr/bin/env node
// Airlock Scrub CLI — redact secrets & personal data from text, reversibly.
"use strict";

const fs = require("fs");
const S = require("./core.js");

process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

const HELP = `airlock-scrub — redact secrets & personal data before text reaches an AI

Usage
  scrub [file...]                  redact files (or stdin) to stdout
  scrub restore --map <f> [file]   put original values back into an AI reply
  scrub check [file...]            exit 1 if anything sensitive is found
  scrub hook                       Claude Code hook (UserPromptSubmit / PreToolUse)
  scrub rules                      list detection rules

Options
  --map <file>        save placeholder → original map (JSON, mode 600); reused if it exists
  --json              print findings as JSON (redact/check)
  --secrets-only      skip personal data (emails, IPs, paths, cards…)
  --pii-only          skip secrets
  --enable <ids>      comma-separated rule ids to turn on (e.g. phone)
  --disable <ids>     comma-separated rule ids to turn off
  --term <text>       extra word/phrase to redact (repeatable)
  --allow <value>     value never to redact (repeatable)
  --redact-private-ips  also redact 10.x / 192.168.x / ::1 …
  -h, --help          show help

Examples
  pbpaste | scrub --map .scrub.json | pbcopy
  pbpaste | scrub restore --map .scrub.json
  git diff | scrub check --secrets-only
  scrub --term "Acme Corp" --term Bluebird notes.md
`;

function parse(argv) {
  const a = { cmd: "redact", files: [], terms: [], allow: [], enable: [], disable: [] };
  const cmds = new Set(["restore", "check", "hook", "rules", "redact"]);
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) die(`missing value for ${x}`);
      return argv[++i];
    };
    if (i === 0 && cmds.has(x)) a.cmd = x;
    else if (x === "-h" || x === "--help") a.help = true;
    else if (x === "--map") a.map = next();
    else if (x === "--json") a.json = true;
    else if (x === "--secrets-only") a.kinds = ["secret"];
    else if (x === "--pii-only") a.kinds = ["pii"];
    else if (x === "--enable") a.enable.push(...next().split(","));
    else if (x === "--disable") a.disable.push(...next().split(","));
    else if (x === "--term") a.terms.push(next());
    else if (x === "--allow") a.allow.push(next());
    else if (x === "--redact-private-ips") a.privateIps = true;
    else if (x === "-") a.files.push("-");
    else if (x.startsWith("-")) die(`unknown option ${x}`);
    else a.files.push(x);
  }
  return a;
}

function die(msg, code = 2) {
  process.stderr.write(`scrub: ${msg}\n`);
  process.exit(code);
}

function readInput(files) {
  if (!files.length || (files.length === 1 && files[0] === "-")) {
    try {
      return fs.readFileSync(0, "utf8");
    } catch (e) {
      if (e.code === "EAGAIN" || e.code === "EOF") return "";
      throw e;
    }
  }
  return files
    .map((f) => {
      try {
        return fs.readFileSync(f, "utf8");
      } catch (e) {
        die(e.code === "ENOENT" ? `no such file: ${f}` : `can't read ${f}: ${e.message}`);
      }
    })
    .join("");
}

function options(a) {
  const enabled = {};
  for (const id of a.enable) enabled[id.trim()] = true;
  for (const id of a.disable) enabled[id.trim()] = false;
  const known = new Set(S.rules().map((r) => r.id));
  for (const id of Object.keys(enabled)) if (!known.has(id)) die(`unknown rule "${id}" (see: scrub rules)`);
  return {
    kinds: a.kinds || ["secret", "pii"],
    enabled,
    customTerms: a.terms,
    allowlist: a.allow,
    keepPrivateIPs: !a.privateIps,
  };
}

function loadVault(file) {
  if (!file || !fs.existsSync(file)) return S.createVault();
  try {
    return S.createVault(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (e) {
    die(`could not read map ${file}: ${e.message}`);
  }
}

function saveVault(file, vault) {
  fs.writeFileSync(file, JSON.stringify(vault, null, 2) + "\n", { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}

function summary(findings) {
  const by = {};
  for (const f of findings) by[f.label] = (by[f.label] || 0) + 1;
  return Object.entries(by)
    .map(([k, n]) => `${n} × ${k}`)
    .join(", ");
}

function lineCol(text, idx) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) {
    line++;
    last = i;
  }
  return `${line}:${idx - last}`;
}

// ---------------------------------------------------------------- hook

function collectStrings(v, out, depth = 0) {
  if (depth > 20 || v == null) return out;
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out, depth + 1);
  else if (typeof v === "object") for (const k of Object.keys(v)) collectStrings(v[k], out, depth + 1);
  return out;
}

function runHook(a) {
  let input;
  try {
    input = JSON.parse(readInput([]) || "{}");
  } catch {
    process.exit(0); // never break the agent on malformed input
  }
  const event = input.hook_event_name;
  const opts = options(Object.assign({}, a, { kinds: a.kinds || ["secret"] }));
  let texts = [];
  if (event === "UserPromptSubmit") texts = [String(input.prompt || "")];
  else if (event === "PreToolUse") texts = collectStrings(input.tool_input, []);
  else process.exit(0);

  const findings = texts.flatMap((t) => S.scan(t, opts));
  if (!findings.length) process.exit(0);

  const list = findings
    .slice(0, 8)
    .map((f) => `  • ${f.label}: ${S.mask(f.value)}`)
    .join("\n");
  const more = findings.length > 8 ? `\n  • …and ${findings.length - 8} more` : "";
  const where = event === "UserPromptSubmit" ? "your prompt" : `this ${input.tool_name || "tool"} call`;
  process.stderr.write(
    `airlock-scrub blocked ${where}: it contains ${findings.length === 1 ? "a secret" : findings.length + " secrets"}.\n${list}${more}\n` +
      (event === "UserPromptSubmit"
        ? "Remove it (or run it through `scrub`) and send again. Rotate the credential if it was already shared.\n"
        : "Use an environment variable or a secrets manager instead of inlining the value.\n")
  );
  process.exit(2);
}

// ---------------------------------------------------------------- main

function main() {
  const a = parse(process.argv.slice(2));
  if (a.help) {
    process.stdout.write(HELP);
    return;
  }

  if (a.cmd === "rules") {
    const rows = S.rules();
    const w = Math.max(...rows.map((r) => r.id.length));
    for (const r of rows) {
      process.stdout.write(`${r.id.padEnd(w)}  ${r.kind.padEnd(6)}  ${r.defaultOn ? "on " : "off"}  ${r.label}\n`);
    }
    return;
  }

  if (a.cmd === "hook") return runHook(a);

  if (a.cmd === "restore") {
    if (!a.map) die("restore needs --map <file>");
    if (!fs.existsSync(a.map)) die(`map not found: ${a.map}`);
    const vault = loadVault(a.map);
    const r = S.restore(readInput(a.files), vault);
    process.stdout.write(r.text);
    process.stderr.write(`scrub: restored ${r.count} value${r.count === 1 ? "" : "s"}\n`);
    return;
  }

  const text = readInput(a.files);
  const opts = options(a);

  if (a.cmd === "check") {
    const findings = S.scan(text, opts);
    if (a.json) {
      process.stdout.write(
        JSON.stringify(findings.map((f) => ({ rule: f.ruleId, label: f.label, kind: f.kind, at: lineCol(text, f.start), preview: S.mask(f.value) })), null, 2) + "\n"
      );
    } else if (findings.length) {
      for (const f of findings) process.stderr.write(`${lineCol(text, f.start).padEnd(8)} ${f.label.padEnd(28)} ${S.mask(f.value)}\n`);
      process.stderr.write(`\nscrub: found ${summary(findings)}\n`);
    } else {
      process.stderr.write("scrub: clean\n");
    }
    process.exit(findings.length ? 1 : 0);
  }

  const vault = loadVault(a.map);
  const r = S.redact(text, opts, vault);
  if (a.json) {
    process.stdout.write(
      JSON.stringify({ text: r.text, findings: r.findings.map((f) => ({ rule: f.ruleId, label: f.label, kind: f.kind, placeholder: f.placeholder })) }, null, 2) + "\n"
    );
  } else {
    process.stdout.write(r.text);
  }
  if (a.map) saveVault(a.map, vault);
  if (r.findings.length) process.stderr.write(`scrub: redacted ${summary(r.findings)}${a.map ? ` (map: ${a.map})` : ""}\n`);
}

main();
