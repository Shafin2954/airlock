const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../context-map/core.js");

test("token estimate is in the right ballpark", () => {
  assert.equal(C.estimateTokens(""), 0);
  const prose = "The quick brown fox jumps over the lazy dog. ".repeat(20);
  const t = C.estimateTokens(prose); // o200k: 10 tokens per sentence → 200
  assert.ok(t > 170 && t < 240, String(t));
  const code = "function add(a, b) {\n  return a + b;\n}\n".repeat(10); // o200k ≈ 13 per copy
  const c = C.estimateTokens(code);
  assert.ok(c > 100 && c < 180, String(c));
});

test("gitignore basics", () => {
  const gi = [C.compileGitignore("# comment\n*.log\n/build\nsecret/\n!keep.log\ndocs/**/*.tmp\n**/cache\n\\#notacomment", "")];
  const ig = (p, d = false) => C.isIgnored(gi, p, d);
  assert.ok(ig("a.log"));
  assert.ok(ig("deep/x/a.log"));
  assert.ok(!ig("keep.log"));
  assert.ok(ig("build", true));
  assert.ok(!ig("src/build", true), "anchored pattern only matches at root");
  assert.ok(ig("secret", true));
  assert.ok(ig("x/secret", true));
  assert.ok(!ig("secret", false), "dir-only pattern skips files");
  assert.ok(ig("docs/a/b/c.tmp"));
  assert.ok(ig("docs/c.tmp"));
  assert.ok(!ig("other/c.tmp"));
  assert.ok(ig("a/b/cache", true));
  assert.ok(ig("#notacomment"));
});

test("nested gitignore applies to its subtree only", () => {
  const stack = [C.compileGitignore("*.tmp", ""), C.compileGitignore("*.gen.ts\n!x.tmp", "pkg")];
  assert.ok(C.isIgnored(stack, "pkg/a.gen.ts", false));
  assert.ok(!C.isIgnored(stack, "a.gen.ts", false));
  assert.ok(!C.isIgnored(stack, "pkg/x.tmp", false));
  assert.ok(C.isIgnored(stack, "y.tmp", false));
});

test("binary and noise detection", () => {
  assert.ok(C.isBinaryPath("a/logo.PNG"));
  assert.ok(!C.isBinaryPath("a/main.go"));
  assert.ok(C.isNoise("package-lock.json"));
  assert.ok(C.isNoise("web/dist/app.min.js"));
  assert.ok(!C.isNoise("src/index.js"));
  assert.ok(C.looksBinary(new Uint8Array([65, 0, 66])));
  assert.ok(!C.looksBinary(new TextEncoder().encode("hello\nworld\t!")));
});

test("squarify covers the rectangle exactly with no overlaps", () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ value: v, i }));
  const rects = C.squarify(items, 0, 0, 600, 400);
  assert.equal(rects.length, items.length);
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 240000) < 1e-6);
  for (const r of rects) {
    assert.ok(Math.abs(r.w * r.h - (r.item.value / 24) * 240000) < 1e-6);
    assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 600 + 1e-9 && r.y + r.h <= 400 + 1e-9);
  }
  for (let a = 0; a < rects.length; a++)
    for (let b = a + 1; b < rects.length; b++) {
      const A = rects[a], B = rects[b];
      const ov = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > 1e-6 && Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 1e-6;
      assert.ok(!ov, `rects ${a} and ${b} overlap`);
    }
});

test("buildTree sums tokens and layoutTree returns every node", () => {
  const files = [
    { path: "src/a.js", tokens: 100 },
    { path: "src/lib/b.js", tokens: 50 },
    { path: "README.md", tokens: 30 },
  ];
  const root = C.buildTree(files, "repo");
  assert.equal(root.tokens, 180);
  assert.equal(root.children[0].name, "src");
  assert.equal(root.children[0].tokens, 150);
  const rects = C.layoutTree(root, 800, 600);
  assert.equal(rects.length, 6); // root, src, src/a, src/lib, src/lib/b, README
});

test("ascii tree and pack formats", () => {
  const tree = C.asciiTree(["src/a.js", "src/lib/b.js", "README.md"], "repo");
  assert.equal(tree, "repo/\n├── src/\n│   ├── lib/\n│   │   └── b.js\n│   └── a.js\n└── README.md");
  const files = [{ path: "a.md", text: "has ``` fence\n" }, { path: "b.py", text: "print(1)" }];
  const xml = C.pack(files, { format: "xml" });
  assert.match(xml, /<file path="a.md">\nhas ``` fence\n<\/file>/);
  const md = C.pack(files, { format: "markdown", tree: false });
  assert.match(md, /### a.md\n\n````markdown\nhas ``` fence\n````/);
  assert.match(md, /```python\nprint\(1\)\n```/);
});

test("fitToBudget drops largest files first", () => {
  const files = [
    { path: "a", tokens: 500, included: true },
    { path: "b", tokens: 300, included: true },
    { path: "c", tokens: 100, included: true },
    { path: "d", tokens: 900, included: false },
  ];
  const r = C.fitToBudget(files, 450, 0);
  assert.deepEqual(r.dropped.map((f) => f.path), ["a"]);
  assert.equal(r.total, 400);
  assert.equal(files[3].included, false);
});

test("formatTokens", () => {
  assert.equal(C.formatTokens(950), "950");
  assert.equal(C.formatTokens(1500), "1.5K");
  assert.equal(C.formatTokens(128000), "128K");
  assert.equal(C.formatTokens(1000000), "1M");
  assert.equal(C.formatTokens(1250000), "1.25M");
});

test("sensitive files", () => {
  for (const p of [".env", "api/.env.local", ".env.production", "certs/server.key", "deploy/id_ed25519", ".npmrc", "config/credentials.json", "secrets.yaml"])
    assert.ok(C.isSensitive(p), p);
  for (const p of [".env.example", ".env.sample", "src/env.ts", "keyboard.js", "docs/secrets-management.md"]) assert.ok(!C.isSensitive(p), p);
});
