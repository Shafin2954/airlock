/*!
 * Airlock JSONL Lens core — schema inference, path access, filters, stats.
 * Zero dependencies. MIT.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JsonlLensCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const IDENT = /^[A-Za-z_$][\w$]*$/;

  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v; // string number boolean object
  }

  // ---------------------------------------------------------------- schema
  //
  // Paths are arrays of keys; "[]" stands for "every element of an array".
  // Returns [{path, key, types:{t:n}, count, coverage, values:Map|null, numeric}]

  function inferSchema(records, opts) {
    const o = Object.assign({ maxDepth: 5, maxKeys: 400, maxDistinct: 50 }, opts || {});
    const fields = new Map();
    const n = records.length;

    function visit(v, path, depth, seen) {
      const key = path.join("\u0000");
      let f = fields.get(key);
      if (!f) {
        if (fields.size >= o.maxKeys) return;
        f = { path: path.slice(), key: displayPath(path), types: {}, count: 0, values: new Map(), overflow: false, _last: -1 };
        fields.set(key, f);
      }
      const t = typeOf(v);
      f.types[t] = (f.types[t] || 0) + 1;
      if (f._last !== seen) {
        f.count++;
        f._last = seen;
      }
      if ((t === "string" || t === "boolean" || t === "number") && !f.overflow) {
        const k = t === "string" && v.length > 80 ? null : v;
        if (k === null) f.overflow = true;
        else {
          f.values.set(k, (f.values.get(k) || 0) + 1);
          if (f.values.size > o.maxDistinct) f.overflow = true;
        }
      }
      if (depth >= o.maxDepth) return;
      if (t === "object") for (const k of Object.keys(v)) visit(v[k], path.concat(k), depth + 1, seen);
      else if (t === "array") for (let i = 0; i < Math.min(v.length, 50); i++) visit(v[i], path.concat("[]"), depth + 1, seen);
    }

    records.forEach((r, i) => {
      if (r && typeof r === "object" && !Array.isArray(r)) for (const k of Object.keys(r)) visit(r[k], [k], 1, i);
      else visit(r, [], 0, i);
    });

    const out = [];
    for (const f of fields.values()) {
      if (!f.path.length) continue;
      delete f._last;
      f.coverage = n ? f.count / n : 0;
      f.numeric = !!f.types.number && Object.keys(f.types).every((t) => t === "number" || t === "null");
      if (f.overflow) f.values = null;
      delete f.overflow;
      f.inArray = f.path.includes("[]");
      out.push(f);
    }
    // stable order: by first-seen depth then insertion
    return out;
  }

  function displayPath(path) {
    let s = "";
    for (const k of path) {
      if (k === "[]") s += "[]";
      else if (IDENT.test(k)) s += (s ? "." : "") + k;
      else s += "[" + JSON.stringify(k) + "]";
    }
    return s;
  }

  // JS accessor usable inside a filter expression: r.a?.b?.["x-y"]
  function accessor(path) {
    let s = "r";
    path.forEach((k, i) => {
      const opt = i === 0 ? "" : "?";
      if (IDENT.test(k)) s += (opt ? "?." : ".") + k;
      else s += (opt ? "?." : "") + "[" + JSON.stringify(k) + "]";
    });
    return s;
  }

  function get(obj, path) {
    let v = obj;
    for (const k of path) {
      if (v == null) return undefined;
      if (k === "[]") return undefined;
      v = v[k];
    }
    return v;
  }

  // all values at a path that may traverse arrays
  function getAll(obj, path, out) {
    out = out || [];
    (function rec(v, i) {
      if (v === undefined) return;
      if (i === path.length) {
        out.push(v);
        return;
      }
      const k = path[i];
      if (k === "[]") {
        if (Array.isArray(v)) for (const x of v) rec(x, i + 1);
      } else if (v != null && typeof v === "object") rec(v[k], i + 1);
    })(obj, 0);
    return out;
  }

  // ---------------------------------------------------------------- filter

  // Compile a user expression over record `r`. Returns {fn, error}.
  function compileFilter(expr) {
    const src = String(expr || "").trim();
    if (!src) return { fn: null, error: null };
    try {
      // eslint-disable-next-line no-new-func
      const inner = new Function("r", "has", "get", "\"use strict\"; return (" + src + "\n);");
      const has = (o, p) => get(o, String(p).split(".")) !== undefined;
      const g = (o, p) => get(o, String(p).split("."));
      const fn = (r) => {
        try {
          return !!inner(r, has, g);
        } catch {
          return false;
        }
      };
      return { fn, error: null };
    } catch (e) {
      return { fn: null, error: e.message };
    }
  }

  function literal(v) {
    return typeof v === "string" ? JSON.stringify(v) : String(v);
  }

  // filter clause for "field equals value"
  function equalsClause(path, value) {
    return accessor(path) + " === " + literal(value);
  }

  // ---------------------------------------------------------------- stats

  function numericStats(values) {
    const xs = values.filter((v) => typeof v === "number" && isFinite(v)).sort((a, b) => a - b);
    const n = xs.length;
    if (!n) return null;
    const q = (p) => {
      const i = (n - 1) * p;
      const lo = Math.floor(i);
      const hi = Math.ceil(i);
      return xs[lo] + (xs[hi] - xs[lo]) * (i - lo);
    };
    let sum = 0;
    for (const x of xs) sum += x;
    return { n, min: xs[0], max: xs[n - 1], sum, mean: sum / n, p50: q(0.5), p90: q(0.9), p99: q(0.99) };
  }

  // equal-width histogram
  function histogram(values, bins) {
    const xs = values.filter((v) => typeof v === "number" && isFinite(v));
    if (!xs.length) return [];
    let min = Infinity, max = -Infinity;
    for (const x of xs) {
      if (x < min) min = x;
      if (x > max) max = x;
    }
    bins = bins || 24;
    if (min === max) return [{ lo: min, hi: max, n: xs.length }];
    const w = (max - min) / bins;
    const out = Array.from({ length: bins }, (_, i) => ({ lo: min + i * w, hi: min + (i + 1) * w, n: 0 }));
    for (const x of xs) out[Math.min(bins - 1, Math.floor((x - min) / w))].n++;
    return out;
  }

  // ---------------------------------------------------------------- parsing

  // Split a chunked text stream into lines; call push(line) for each complete line.
  function lineSplitter(push) {
    let rest = "";
    return {
      write(chunk) {
        const text = rest + chunk;
        let start = 0;
        let i;
        while ((i = text.indexOf("\n", start)) !== -1) {
          let line = text.slice(start, i);
          if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
          push(line);
          start = i + 1;
        }
        rest = text.slice(start);
      },
      end() {
        if (rest) push(rest.charCodeAt(rest.length - 1) === 13 ? rest.slice(0, -1) : rest);
        rest = "";
      },
    };
  }

  function formatCell(v, max) {
    max = max || 120;
    if (v === undefined) return "";
    if (v === null) return "null";
    if (typeof v === "string") return v.length > max ? v.slice(0, max) + "…" : v;
    if (typeof v === "object") {
      const s = JSON.stringify(v);
      return s.length > max ? s.slice(0, max) + "…" : s;
    }
    return String(v);
  }

  function formatNumber(x) {
    if (!isFinite(x)) return String(x);
    const a = Math.abs(x);
    if (a !== 0 && (a < 0.001 || a >= 1e15)) return x.toExponential(2);
    if (Number.isInteger(x)) return x.toLocaleString("en-US");
    return x.toLocaleString("en-US", { maximumFractionDigits: a < 10 ? 3 : 1 });
  }

  return {
    typeOf,
    inferSchema,
    displayPath,
    accessor,
    get,
    getAll,
    compileFilter,
    equalsClause,
    numericStats,
    histogram,
    lineSplitter,
    formatCell,
    formatNumber,
  };
});
