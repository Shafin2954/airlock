const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../jsonl-lens/core.js");

const rows = [
  { id: 1, status: 200, user: { plan: "pro", "first-name": "A" }, tags: ["a", "b"], msgs: [{ role: "user" }] },
  { id: 2, status: 500, user: { plan: "free" }, tags: [], err: null },
  { id: 3, status: 200, user: null, msgs: [{ role: "assistant" }, { role: "tool" }] },
];

test("schema: paths, coverage, types, values", () => {
  const s = L.inferSchema(rows);
  const by = Object.fromEntries(s.map((f) => [f.key, f]));
  assert.equal(by.id.coverage, 1);
  assert.ok(by.id.numeric);
  assert.deepEqual(by.user.types, { object: 2, null: 1 });
  assert.equal(by["user.plan"].count, 2);
  assert.ok(by['user["first-name"]'], "non-identifier keys use bracket notation");
  assert.equal(by["msgs[].role"].count, 2, "coverage counts records, not array elements");
  assert.equal(by["msgs[].role"].types.string, 3);
  assert.ok(by["msgs[].role"].inArray);
  assert.deepEqual([...by.status.values.entries()], [[200, 2], [500, 1]]);
});

test("accessor + filters", () => {
  assert.equal(L.accessor(["user", "plan"]), "r.user?.plan");
  assert.equal(L.accessor(["user", "first-name"]), 'r.user?.["first-name"]');
  const { fn } = L.compileFilter(L.equalsClause(["user", "plan"], "pro") + " || r.status >= 500");
  assert.deepEqual(rows.filter(fn).map((r) => r.id), [1, 2]);
  assert.match(L.compileFilter("r.status >>> ==").error, /./);
  assert.equal(L.compileFilter("").fn, null);
  // runtime errors are just "no match"
  assert.deepEqual(rows.filter(L.compileFilter("r.user.plan === 'pro'").fn).map((r) => r.id), [1]);
  assert.deepEqual(rows.filter(L.compileFilter("has(r, 'err')").fn).map((r) => r.id), [2]); // present, even if null
  assert.deepEqual(rows.filter(L.compileFilter("r.msgs?.some(m => m.role === 'tool')").fn).map((r) => r.id), [3]);
});

test("get / getAll", () => {
  assert.equal(L.get(rows[0], ["user", "plan"]), "pro");
  assert.equal(L.get(rows[2], ["user", "plan"]), undefined);
  assert.deepEqual(L.getAll(rows[2], ["msgs", "[]", "role"]), ["assistant", "tool"]);
});

test("stats and histogram", () => {
  const s = L.numericStats([5, 1, 3, null, "x", 2, 4]);
  assert.deepEqual([s.n, s.min, s.max, s.sum, s.mean, s.p50], [5, 1, 5, 15, 3, 3]);
  const h = L.histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
  assert.equal(h.length, 5);
  assert.equal(h.reduce((a, b) => a + b.n, 0), 11);
  assert.equal(L.numericStats([]), null);
});

test("line splitter handles chunks, CRLF and no trailing newline", () => {
  const got = [];
  const sp = L.lineSplitter((l) => got.push(l));
  sp.write('{"a":1}\r\n{"b"');
  sp.write(':2}\n\n{"c":3}');
  sp.end();
  assert.deepEqual(got, ['{"a":1}', '{"b":2}', "", '{"c":3}']);
});

test("formatting", () => {
  assert.equal(L.formatCell(null), "null");
  assert.equal(L.formatCell({ a: 1 }), '{"a":1}');
  assert.equal(L.formatCell("x".repeat(10), 4), "xxxx…");
  assert.equal(L.formatNumber(1234567), "1,234,567");
  assert.equal(L.formatNumber(3.14159), "3.142");
});
