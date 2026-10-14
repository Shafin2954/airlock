/*!
 * Airlock Context Map core — token estimation, .gitignore matching,
 * squarified treemap layout and prompt packing. Zero dependencies. MIT.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ContextMapCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- tokens
  //
  // Heuristic modelled on GPT-style BPE pre-tokenisation. Calibrated against
  // o200k_base on ~800 real source files (js/ts/py/go/rs/md/html/json…):
  // total bias ≈ 0%, mean per-file error ≈ 8%. Other vendors' tokenizers
  // differ — treat the number as an estimate and leave headroom.

  const PIECE = /'(?:s|t|re|ve|m|ll|d)|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+/gu;
  const HAS_LETTER = /\p{L}/u;
  const NON_ASCII = /[^\x00-\x7f]/g;
  const BIAS = 1.075; // the piece model undercounts by ~7% overall

  function estimateTokens(text) {
    if (!text) return 0;
    let n = 0;
    PIECE.lastIndex = 0;
    let m;
    while ((m = PIECE.exec(text))) {
      const s = m[0];
      const c = s.charCodeAt(0);
      if (HAS_LETTER.test(s)) {
        const na = (s.match(NON_ASCII) || []).length;
        n += na ? Math.ceil(na + (s.length - na) / 8) : Math.ceil(s.length / 8);
      } else if (c === 32 || c === 9 || c === 10 || c === 13) {
        const t = s.trim();
        n += t ? Math.ceil(t.length / 2) : 1;
      } else if (c >= 48 && c <= 57) {
        n += 1;
      } else {
        n += Math.ceil(s.trim().length / 2) || 1;
      }
    }
    return Math.round(n * BIAS);
  }

  // ---------------------------------------------------------------- file classes

  const IGNORED_DIRS = new Set([
    ".git", ".hg", ".svn", "node_modules", "bower_components", "jspm_packages", ".next", ".nuxt", ".svelte-kit",
    ".turbo", ".vercel", ".netlify", ".cache", ".parcel-cache", "dist", "build", "out", "target", "coverage",
    ".nyc_output", ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
    ".gradle", ".idea", ".vscode", ".DS_Store", "Pods", "DerivedData", ".terraform", ".serverless", "vendor",
    ".dart_tool", ".pub-cache", "elm-stuff", "_build", "deps", ".expo", ".angular", "storybook-static",
  ]);

  const BINARY_EXT = new Set(
    (
      "png jpg jpeg gif webp avif bmp ico icns tif tiff psd ai sketch fig heic raw cr2 nef " +
      "mp3 wav flac ogg m4a aac opus mid midi mp4 mov avi mkv webm wmv flv m4v " +
      "zip tar gz tgz bz2 xz 7z rar zst lz4 jar war ear apk aab ipa dmg iso img deb rpm msi " +
      "exe dll so dylib a o obj lib bin dat class pyc pyo pyd wasm node " +
      "woff woff2 ttf otf eot pdf doc docx xls xlsx ppt pptx odt ods odp key numbers pages " +
      "sqlite sqlite3 db mdb parquet arrow feather npy npz pkl pickle h5 hdf5 onnx pt pth safetensors ckpt gguf tflite " +
      "glb gltf fbx blend stl 3ds dae unitypackage"
    ).split(/\s+/)
  );

  // Generated / low-signal files: listed, but excluded from the pack by default.
  const NOISE = [
    /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum|flake\.lock|pubspec\.lock|mix\.lock|packages\.lock\.json|gradle\.lockfile)$/,
    /\.min\.(js|css)$/,
    /\.(map|snap)$/,
    /(^|\/)(LICENSE|LICENCE|COPYING)(\.\w+)?$/i,
    /\.svg$/,
  ];

  // Files that usually hold credentials: listed, never packed unless you opt in.
  const SENSITIVE = [
    /(^|\/)\.env(?:\.(?!example$|sample$|template$|dist$|defaults?$)[\w.-]+)?$/i,
    /\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg|kdbx)$/i,
    /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/,
    /(^|\/)(\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.htpasswd|\.dockercfg)$/,
    /(^|\/)(credentials|secrets?|service[-_]?account)[\w.-]*\.(json|ya?ml|toml|ini|txt)$/i,
    /(^|\/)\.aws\/credentials$/,
  ];

  function isSensitive(path) {
    return SENSITIVE.some((re) => re.test(path));
  }

  function extOf(path) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    const i = base.lastIndexOf(".");
    return i > 0 ? base.slice(i + 1).toLowerCase() : "";
  }

  function isBinaryPath(path) {
    return BINARY_EXT.has(extOf(path));
  }

  function isNoise(path) {
    return NOISE.some((re) => re.test(path));
  }

  // NUL byte or too many control chars in the first chunk → binary
  function looksBinary(bytes) {
    const n = Math.min(bytes.length, 8000);
    let ctrl = 0;
    for (let i = 0; i < n; i++) {
      const b = bytes[i];
      if (b === 0) return true;
      if (b < 7 || (b > 13 && b < 32)) ctrl++;
    }
    return n > 0 && ctrl / n > 0.1;
  }

  // ---------------------------------------------------------------- gitignore

  function globToRegex(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
      const c = glob[i];
      if (c === "*") {
        if (glob[i + 1] === "*") {
          const atStart = i === 0 || glob[i - 1] === "/";
          const atEnd = i + 2 === glob.length || glob[i + 2] === "/";
          if (atStart && atEnd) {
            if (i + 2 === glob.length) re += ".*";
            else {
              re += "(?:.*/)?";
              i++; // skip the slash after **
            }
            i++;
            continue;
          }
          re += "[^/]*";
          i++;
          continue;
        }
        re += "[^/]*";
      } else if (c === "?") re += "[^/]";
      else if (c === "[") {
        const j = glob.indexOf("]", i + 1);
        if (j < 0) re += "\\[";
        else {
          let cls = glob.slice(i + 1, j).replace(/\\/g, "\\\\");
          if (cls[0] === "!") cls = "^" + cls.slice(1);
          re += "[" + cls + "]";
          i = j;
        }
      } else if (c === "\\" && i + 1 < glob.length) {
        re += "\\" + glob[++i];
      } else re += /[.+^${}()|\]\\/]/.test(c) ? "\\" + c : c;
    }
    return re;
  }

  // Compile a .gitignore living at `base` ("" for the root, else "dir/sub").
  function compileGitignore(text, base) {
    const rules = [];
    for (let raw of String(text).split(/\r?\n/)) {
      if (!raw || raw[0] === "#") continue;
      raw = raw.replace(/(?<!\\)\s+$/, "");
      if (!raw) continue;
      let neg = false;
      if (raw[0] === "!") {
        neg = true;
        raw = raw.slice(1);
      } else if (raw.startsWith("\\!") || raw.startsWith("\\#")) raw = raw.slice(1);
      let dirOnly = false;
      if (raw.endsWith("/")) {
        dirOnly = true;
        raw = raw.slice(0, -1);
      }
      const anchored = raw.includes("/");
      if (raw[0] === "/") raw = raw.slice(1);
      const body = globToRegex(raw);
      const re = new RegExp("^" + (anchored ? "" : "(?:.*/)?") + body + "$");
      rules.push({ re, neg, dirOnly });
    }
    return { base: base || "", rules };
  }

  // stack: list of compiled gitignores (root first). path: repo-relative.
  function isIgnored(stack, path, isDir) {
    let ignored = false;
    for (const gi of stack) {
      let rel = path;
      if (gi.base) {
        if (!path.startsWith(gi.base + "/")) continue;
        rel = path.slice(gi.base.length + 1);
      }
      for (const r of gi.rules) {
        if (r.dirOnly && !isDir) continue;
        if (r.re.test(rel)) ignored = !r.neg;
      }
    }
    return ignored;
  }

  // ---------------------------------------------------------------- tree

  // files: [{path, tokens, ...}] → nested {name, path, children[], tokens, file?}
  function buildTree(files, rootName) {
    const root = { name: rootName || "", path: "", children: [], tokens: 0, dir: true };
    const dirs = new Map([["", root]]);
    for (const f of files) {
      const parts = f.path.split("/");
      let cur = root;
      let p = "";
      for (let i = 0; i < parts.length - 1; i++) {
        p = p ? p + "/" + parts[i] : parts[i];
        let d = dirs.get(p);
        if (!d) {
          d = { name: parts[i], path: p, children: [], tokens: 0, dir: true };
          dirs.set(p, d);
          cur.children.push(d);
        }
        cur = d;
      }
      cur.children.push({ name: parts[parts.length - 1], path: f.path, tokens: f.tokens, file: f });
    }
    (function sum(n) {
      if (!n.dir) return n.tokens;
      n.tokens = 0;
      for (const c of n.children) n.tokens += sum(c);
      n.children.sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
      return n.tokens;
    })(root);
    return root;
  }

  function asciiTree(paths, rootName) {
    const root = {};
    for (const p of paths) {
      let cur = root;
      for (const part of p.split("/")) cur = cur[part] = cur[part] || {};
    }
    const lines = [rootName ? rootName + "/" : "."];
    (function walk(node, prefix) {
      const keys = Object.keys(node).sort((a, b) => {
        const da = Object.keys(node[a]).length > 0;
        const db = Object.keys(node[b]).length > 0;
        return da === db ? a.localeCompare(b) : da ? -1 : 1;
      });
      keys.forEach((k, i) => {
        const last = i === keys.length - 1;
        const isDir = Object.keys(node[k]).length > 0;
        lines.push(prefix + (last ? "└── " : "├── ") + k + (isDir ? "/" : ""));
        if (isDir) walk(node[k], prefix + (last ? "    " : "│   "));
      });
    })(root, "");
    return lines.join("\n");
  }

  // ---------------------------------------------------------------- treemap

  // Squarified treemap (Bruls, Huizing, van Wijk). items need .value > 0.
  function squarify(items, x, y, w, h) {
    const out = [];
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total || w <= 0 || h <= 0) return out;
    const scale = (w * h) / total;
    const nodes = items.map((it) => ({ item: it, area: it.value * scale })).sort((a, b) => b.area - a.area);

    let rx = x, ry = y, rw = w, rh = h;
    let row = [];

    const worst = (r, side) => {
      let s = 0, mx = 0, mn = Infinity;
      for (const n of r) {
        s += n.area;
        if (n.area > mx) mx = n.area;
        if (n.area < mn) mn = n.area;
      }
      const s2 = s * s, side2 = side * side;
      return Math.max((side2 * mx) / s2, s2 / (side2 * mn));
    };

    const flush = () => {
      const s = row.reduce((a, n) => a + n.area, 0);
      if (rw >= rh) {
        const cw = s / rh;
        let cy = ry;
        for (const n of row) {
          const ch = n.area / cw;
          out.push({ item: n.item, x: rx, y: cy, w: cw, h: ch });
          cy += ch;
        }
        rx += cw;
        rw -= cw;
      } else {
        const ch = s / rw;
        let cx = rx;
        for (const n of row) {
          const cw = n.area / ch;
          out.push({ item: n.item, x: cx, y: ry, w: cw, h: ch });
          cx += cw;
        }
        ry += ch;
        rh -= ch;
      }
      row = [];
    };

    for (const n of nodes) {
      const side = Math.min(rw, rh);
      if (!row.length || worst(row.concat(n), side) <= worst(row, side)) row.push(n);
      else {
        flush();
        row.push(n);
      }
    }
    if (row.length) flush();
    return out;
  }

  // Nested layout: returns flat list of {node, x, y, w, h, depth}
  function layoutTree(root, w, h, opts) {
    const o = Object.assign({ pad: 2, header: 16, minHeader: 40, valueOf: (n) => n.tokens }, opts || {});
    const out = [];
    (function rec(node, x, y, w, h, depth) {
      out.push({ node, x, y, w, h, depth });
      if (!node.dir) return;
      let ix = x, iy = y, iw = w, ih = h;
      if (depth > 0) {
        const head = w > o.minHeader && h > o.header * 2 ? o.header : 0;
        ix += o.pad;
        iy += head + o.pad;
        iw -= o.pad * 2;
        ih -= head + o.pad * 2;
      }
      if (iw < 2 || ih < 2) return;
      const kids = node.children.filter((c) => o.valueOf(c) > 0).map((c) => ({ value: o.valueOf(c), node: c }));
      for (const r of squarify(kids, ix, iy, iw, ih)) rec(r.item.node, r.x, r.y, r.w, r.h, depth + 1);
    })(root, 0, 0, w, h, 0);
    return out;
  }

  // ---------------------------------------------------------------- pack

  const LANG = {
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", py: "python",
    rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift", c: "c", h: "c", cpp: "cpp", cc: "cpp",
    hpp: "cpp", cs: "csharp", php: "php", sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell", sql: "sql",
    html: "html", css: "css", scss: "scss", json: "json", yml: "yaml", yaml: "yaml", toml: "toml", md: "markdown",
    xml: "xml", vue: "vue", svelte: "svelte", lua: "lua", r: "r", dart: "dart", ex: "elixir", exs: "elixir",
    scala: "scala", zig: "zig", nix: "nix", tf: "hcl", dockerfile: "dockerfile", graphql: "graphql", proto: "protobuf",
  };

  function fence(text) {
    let f = "```";
    while (text.includes(f)) f += "`";
    return f;
  }

  // files: [{path, text}]
  function pack(files, opts) {
    const o = Object.assign({ format: "xml", tree: true, rootName: "", instructions: "" }, opts || {});
    const parts = [];
    if (o.format === "xml") {
      if (o.instructions) parts.push("<instructions>\n" + o.instructions.trim() + "\n</instructions>\n");
      if (o.tree) parts.push("<directory_structure>\n" + asciiTree(files.map((f) => f.path), o.rootName) + "\n</directory_structure>\n");
      parts.push("<files>");
      for (const f of files) parts.push('<file path="' + f.path.replace(/"/g, "&quot;") + '">\n' + f.text.replace(/\n?$/, "\n") + "</file>");
      parts.push("</files>\n");
    } else {
      if (o.instructions) parts.push(o.instructions.trim() + "\n");
      if (o.tree) parts.push("## Directory structure\n\n```\n" + asciiTree(files.map((f) => f.path), o.rootName) + "\n```\n");
      parts.push("## Files\n");
      for (const f of files) {
        const fc = fence(f.text);
        const base = f.path.slice(f.path.lastIndexOf("/") + 1).toLowerCase();
        const lang = base === "dockerfile" ? "dockerfile" : LANG[extOf(f.path)] || "";
        parts.push("### " + f.path + "\n\n" + fc + lang + "\n" + f.text.replace(/\n?$/, "\n") + fc + "\n");
      }
    }
    return parts.join("\n");
  }

  // Greedy: drop the biggest included files until under budget.
  function fitToBudget(files, budget, overhead) {
    const inc = files.filter((f) => f.included);
    let total = inc.reduce((s, f) => s + f.tokens, 0) + (overhead || 0);
    const dropped = [];
    for (const f of inc.slice().sort((a, b) => b.tokens - a.tokens)) {
      if (total <= budget) break;
      f.included = false;
      total -= f.tokens;
      dropped.push(f);
    }
    return { total, dropped };
  }

  function formatTokens(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    if (n < 1e6) return Math.round(n / 1000) + "K";
    return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  }

  return {
    estimateTokens,
    IGNORED_DIRS,
    isBinaryPath,
    isNoise,
    isSensitive,
    looksBinary,
    extOf,
    compileGitignore,
    isIgnored,
    buildTree,
    asciiTree,
    squarify,
    layoutTree,
    pack,
    fitToBudget,
    formatTokens,
  };
});
