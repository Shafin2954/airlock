/*!
 * Airlock Footprint core — audit what you've told AI chatbots, from your own data export.
 * Reads ChatGPT and Claude exports (the .zip or conversations.json), finds secrets, personal
 * identifiers and sensitive topics in YOUR messages, and can produce a redacted copy.
 * Zero dependencies besides Airlock Scrub's engine. Browser (window.FootprintCore) and Node.
 * MIT License.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../scrub/core.js"));
  else root.FootprintCore = factory(root.ScrubCore);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  // ---------------------------------------------------------------- zip (read only what we need)
  //
  // Exports can be gigabytes because of images. We read the central directory from the end of the
  // file and then inflate just the JSON entries we want, straight from Blob slices.

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 4294967296;

  async function bytes(blob, start, end) {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }

  async function isZip(blob) {
    if (blob.size < 4) return false;
    const b = await bytes(blob, 0, 4);
    return u32(b, 0) === 0x04034b50;
  }

  async function listZip(blob) {
    const tailLen = Math.min(blob.size, 65557 + 20);
    const tail = await bytes(blob, blob.size - tailLen, blob.size);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (u32(tail, i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("not a zip file (no end-of-directory record)");
    let count = u16(tail, eocd + 10);
    let cdSize = u32(tail, eocd + 12);
    let cdOff = u32(tail, eocd + 16);
    // ZIP64
    if (cdOff === 0xffffffff || count === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
        const z64Off = u64(tail, loc + 8);
        const z = await bytes(blob, z64Off, z64Off + 56);
        count = u64(z, 32);
        cdSize = u64(z, 40);
        cdOff = u64(z, 48);
      }
    }
    const cd = await bytes(blob, cdOff, cdOff + cdSize);
    const entries = [];
    const dec = new TextDecoder();
    for (let p = 0, n = 0; n < count && p + 46 <= cd.length; n++) {
      if (u32(cd, p) !== 0x02014b50) break;
      const method = u16(cd, p + 10);
      let csize = u32(cd, p + 20);
      let usize = u32(cd, p + 24);
      const nameLen = u16(cd, p + 28);
      const extraLen = u16(cd, p + 30);
      const commentLen = u16(cd, p + 32);
      let offset = u32(cd, p + 42);
      const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
      // ZIP64 extended information extra field
      let e = p + 46 + nameLen;
      const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = u16(cd, e);
        const sz = u16(cd, e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (usize === 0xffffffff) (usize = u64(cd, q)), (q += 8);
          if (csize === 0xffffffff) (csize = u64(cd, q)), (q += 8);
          if (offset === 0xffffffff) offset = u64(cd, q);
        }
        e += 4 + sz;
      }
      entries.push({ name, method, csize, usize, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function readEntryText(blob, entry) {
    const lh = await bytes(blob, entry.offset, entry.offset + 30);
    if (u32(lh, 0) !== 0x04034b50) throw new Error("bad local header for " + entry.name);
    const start = entry.offset + 30 + u16(lh, 26) + u16(lh, 28);
    const data = blob.slice(start, start + entry.csize);
    if (entry.method === 0) return new TextDecoder().decode(await data.arrayBuffer());
    if (entry.method !== 8) throw new Error("unsupported zip compression method " + entry.method);
    const stream = data.stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).text();
  }

  // ---------------------------------------------------------------- parsers
  //
  // Normalised conversation: { id, title, source, url, created, updated, messages: [{ role, text, time, kind }] }
  // role: "user" | "assistant" | "system" | "tool"; kind: "message" | "attachment" | "custom-instructions" | "project-doc"

  function textOfParts(parts) {
    const out = [];
    for (const p of parts || []) {
      if (typeof p === "string") out.push(p);
      else if (p && typeof p === "object") {
        if (typeof p.text === "string") out.push(p.text);
        else if (p.content_type && /image|audio|video/.test(p.content_type)) out.push("[" + p.content_type.replace(/_asset_pointer$/, "") + "]");
      }
    }
    return out.join("\n");
  }

  function parseChatGPT(list) {
    const convs = [];
    for (const c of list) {
      if (!c || typeof c !== "object" || !c.mapping) continue;
      const id = c.conversation_id || c.id || "";
      const msgs = [];
      for (const node of Object.values(c.mapping)) {
        const m = node && node.message;
        if (!m || !m.content) continue;
        const role = (m.author && m.author.role) || "user";
        const ct = m.content.content_type;
        let text = "";
        let kind = "message";
        if (ct === "user_editable_context") {
          text = [m.content.user_profile, m.content.user_instructions].filter(Boolean).join("\n\n");
          kind = "custom-instructions";
        } else if (Array.isArray(m.content.parts)) text = textOfParts(m.content.parts);
        else if (typeof m.content.text === "string") text = m.content.text;
        if (!text || !text.trim()) continue;
        msgs.push({ role: kind === "custom-instructions" ? "user" : role, text, time: m.create_time ? m.create_time * 1000 : null, kind });
      }
      msgs.sort((a, b) => (a.time || 0) - (b.time || 0));
      convs.push({
        id,
        title: c.title || "Untitled",
        source: "chatgpt",
        url: id ? "https://chatgpt.com/c/" + id : null,
        created: c.create_time ? c.create_time * 1000 : null,
        updated: c.update_time ? c.update_time * 1000 : null,
        messages: msgs,
      });
    }
    return convs;
  }

  function parseClaude(list) {
    const convs = [];
    for (const c of list) {
      if (!c || typeof c !== "object" || !Array.isArray(c.chat_messages)) continue;
      const msgs = [];
      for (const m of c.chat_messages) {
        const role = m.sender === "human" ? "user" : m.sender === "assistant" ? "assistant" : m.sender || "user";
        let text = "";
        if (Array.isArray(m.content) && m.content.length) {
          text = m.content
            .map((b) => (b && typeof b.text === "string" ? b.text : ""))
            .filter(Boolean)
            .join("\n");
        }
        if (!text && typeof m.text === "string") text = m.text;
        const time = m.created_at ? Date.parse(m.created_at) : null;
        if (text && text.trim()) msgs.push({ role, text, time, kind: "message" });
        for (const a of m.attachments || []) {
          if (a && typeof a.extracted_content === "string" && a.extracted_content.trim()) {
            msgs.push({ role, text: a.extracted_content, time, kind: "attachment", name: a.file_name || "attachment" });
          }
        }
      }
      convs.push({
        id: c.uuid || "",
        title: c.name || "Untitled",
        source: "claude",
        url: c.uuid ? "https://claude.ai/chat/" + c.uuid : null,
        created: c.created_at ? Date.parse(c.created_at) : null,
        updated: c.updated_at ? Date.parse(c.updated_at) : null,
        messages: msgs,
      });
    }
    return convs;
  }

  function parseClaudeProjects(list) {
    const convs = [];
    for (const p of list) {
      if (!p || typeof p !== "object") continue;
      const msgs = [];
      if (p.prompt_template) msgs.push({ role: "user", text: p.prompt_template, time: null, kind: "custom-instructions" });
      for (const d of p.docs || []) {
        if (d && typeof d.content === "string" && d.content.trim()) msgs.push({ role: "user", text: d.content, time: d.created_at ? Date.parse(d.created_at) : null, kind: "project-doc", name: d.filename });
      }
      if (!msgs.length) continue;
      convs.push({
        id: p.uuid || "",
        title: "Project: " + (p.name || "Untitled"),
        source: "claude",
        url: p.uuid ? "https://claude.ai/project/" + p.uuid : null,
        created: p.created_at ? Date.parse(p.created_at) : null,
        updated: p.updated_at ? Date.parse(p.updated_at) : null,
        messages: msgs,
      });
    }
    return convs;
  }

  // Unknown shape: every string becomes a "user" message, grouped per top-level item.
  function parseGeneric(data, name) {
    const items = Array.isArray(data) ? data : [data];
    return items.map((it, i) => {
      const msgs = [];
      (function walk(v, depth) {
        if (depth > 12 || v == null) return;
        if (typeof v === "string") {
          if (v.trim().length > 2) msgs.push({ role: "user", text: v, time: null, kind: "message" });
        } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
        else if (typeof v === "object") Object.values(v).forEach((x) => walk(x, depth + 1));
      })(it, 0);
      return { id: String(i), title: (it && (it.title || it.name)) || (name || "Item") + " #" + (i + 1), source: "generic", url: null, created: null, updated: null, messages: msgs };
    });
  }

  function shapeOf(data) {
    const first = Array.isArray(data) ? data.find((x) => x && typeof x === "object") : null;
    if (!first) return "generic";
    if (first.mapping) return "chatgpt";
    if (Array.isArray(first.chat_messages)) return "claude";
    if (Array.isArray(first.docs) || "prompt_template" in first) return "claude-projects";
    return "generic";
  }

  function parseJSONText(text, name) {
    let data;
    const t = text.replace(/^﻿/, "");
    try {
      data = JSON.parse(t);
    } catch {
      // JSONL
      data = t
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return l;
          }
        });
    }
    const shape = shapeOf(data);
    if (shape === "chatgpt") return { source: "chatgpt", conversations: parseChatGPT(data) };
    if (shape === "claude") return { source: "claude", conversations: parseClaude(data) };
    if (shape === "claude-projects") return { source: "claude", conversations: parseClaudeProjects(data) };
    return { source: "generic", conversations: parseGeneric(data, name) };
  }

  // Load a File/Blob: a ChatGPT/Claude export zip, a conversations.json, or any JSON/JSONL.
  async function load(blob, name) {
    name = name || blob.name || "export";
    if (await isZip(blob)) {
      const entries = await listZip(blob);
      const wanted = entries.filter((e) => /(^|\/)(conversations|projects)\.json$/i.test(e.name));
      if (!wanted.length) throw new Error("this zip has no conversations.json — is it a ChatGPT or Claude data export?");
      let source = "generic";
      const conversations = [];
      const raw = [];
      for (const e of wanted) {
        const text = await readEntryText(blob, e);
        const r = parseJSONText(text, e.name);
        if (r.source !== "generic") source = r.source;
        conversations.push(...r.conversations);
        raw.push({ name: e.name.split("/").pop(), text });
      }
      return { source, name, conversations, raw };
    }
    const text = await blob.text();
    const r = parseJSONText(text, name);
    return { source: r.source, name, conversations: r.conversations, raw: [{ name: name.split(/[\\/]/).pop(), text }] };
  }

  // ---------------------------------------------------------------- sensitive topics
  //
  // Keyword families, counted only in sentences written in the first person ("I", "my", "me"…),
  // because the question is what you said about YOURSELF. Heuristic: expect misses and some noise.

  const TOPICS = [
    {
      id: "health",
      label: "Health",
      re: /\b(diagnos\w*|symptoms?|my doctor|therap(?:y|ist)|psychiatrist|depress(?:ed|ion)|anxiety|panic attacks?|adhd|autis\w*|bipolar|ptsd|medications?|prescri(?:bed|ption)|dosage|\d+\s?mg\b|pregnan\w*|miscarr\w*|stds?|hiv|herpes|diabet\w*|cancer|tumou?rs?|chemo\w*|surgery|biopsy|blood (?:test|work)|mri|suicid\w*|self[- ]harm|eating disorder|addict\w*|rehab|sober\w*|insomnia|migraines?)\b/gi,
    },
    {
      id: "money",
      label: "Money",
      re: /\b(salary|my bank|bank account|debts?|loans?|mortgage|credit score|tax return|taxes|irs|bankrupt\w*|overdraft|paycheck|net worth|savings|seed phrase|recovery phrase|crypto wallet|401k|pension|alimony|child support|my rent|owe\b|in debt)\b/gi,
    },
    {
      id: "legal",
      label: "Legal",
      re: /\b(lawyer|attorney|lawsuit|sued|suing|court date|arrest(?:ed)?|criminal record|probation|parole|divorce|custody|visa|immigration|deport\w*|green card|asylum|settlement|fired me|wrongful termination|harass\w*|discriminat\w*|restraining order)\b/gi,
    },
    {
      id: "relationships",
      label: "Relationships & family",
      re: /\b(my (?:wife|husband|partner|boyfriend|girlfriend|ex|spouse|fianc[eé]e?|kids?|son|daughter|mom|mother|dad|father|parents?|sister|brother)|affair|cheat(?:ed|ing) on|break ?up|broke up|dating|my crush|sex(?:ual|ually)?\b|intimate|abus(?:e|ed|ive))\b/gi,
    },
    {
      id: "location",
      label: "Where you live",
      re: /\b(i live (?:in|at|on|near)|my (?:home )?address|my apartment|my flat|my neighbou?rhood|zip code|postcode|my hometown|my street|moved to)\b/gi,
    },
    {
      id: "identity",
      label: "Identity & documents",
      re: /\b(passport(?: number)?|driver'?s licen[cs]e|national id|id number|social security|date of birth|born (?:on|in) \d+|my birthday|i(?:'m| am) (?:gay|lesbian|bisexual|trans(?:gender)?|queer|muslim|christian|jewish|hindu|atheist|catholic)|my religion|my faith|i voted|my political)\b/gi,
    },
    {
      id: "work",
      label: "Confidential work",
      re: /\b(confidential|internal only|do not share|proprietary|under (?:an )?nda|unreleased|not public yet|trade secret|my (?:boss|manager|employer|coworker|colleague)|layoffs?|acquisition|our (?:revenue|customers|roadmap))\b/gi,
    },
  ];

  const FIRST_PERSON = /\b(i|i'm|im|i've|i'd|i'll|my|me|mine|myself|we|our|us)\b/i;

  function sentences(text) {
    return text.split(/(?<=[.!?])\s+|\n+/);
  }

  // anyPerson: for files you uploaded, project docs and custom instructions, which are about you
  // whether or not they say "I".
  function topicHits(text, anyPerson) {
    const hits = [];
    for (const s of sentences(text)) {
      if (s.length < 6 || (!anyPerson && !FIRST_PERSON.test(s))) continue;
      for (const t of TOPICS) {
        t.re.lastIndex = 0;
        const m = t.re.exec(s);
        if (m) hits.push({ topic: t.id, label: t.label, term: m[0], snippet: s.length > 220 ? s.slice(0, 220) + "…" : s });
      }
    }
    return hits;
  }

  // ---------------------------------------------------------------- analysis

  const SCRUB_OPTS = { kinds: ["secret", "pii", "hidden"], enabled: { phone: true }, keepPrivateIPs: true };

  // Replace EVERY finding in a message with its masked preview first, so an excerpt around one
  // finding can never show a neighbouring secret in the clear. Returns the masked text and the
  // new span of each finding.
  function maskMessage(text, findings) {
    let out = "";
    let last = 0;
    const spans = [];
    for (const f of findings) {
      out += text.slice(last, f.start);
      const shown = "⟦" + S.preview(f) + "⟧";
      spans.push([out.length, out.length + shown.length]);
      out += shown;
      last = f.end;
    }
    out += text.slice(last);
    return { masked: out, spans };
  }

  function excerpt(masked, start, end) {
    const a = Math.max(0, start - 60);
    const b = Math.min(masked.length, end + 60);
    return ((a > 0 ? "…" : "") + masked.slice(a, b) + (b < masked.length ? "…" : "")).replace(/\s+/g, " ");
  }

  // conversations: normalised list. opts.includeAssistant: also scan AI replies.
  // onProgress(done, total) is called periodically; analyze yields to the event loop between batches.
  async function analyze(conversations, opts) {
    const o = Object.assign({ includeAssistant: false, onProgress: null }, opts || {});
    const values = new Map(); // value -> { kind, ruleId, label, preview, count, convs:Set }
    const topicTotals = Object.fromEntries(TOPICS.map((t) => [t.id, { id: t.id, label: t.label, count: 0, convs: new Set() }]));
    const convReports = [];
    let userMessages = 0;
    let scannedChars = 0;
    let done = 0;
    const total = conversations.length;

    for (const c of conversations) {
      const hits = [];
      for (let i = 0; i < c.messages.length; i++) {
        const m = c.messages[i];
        if (m.role === "user") userMessages++;
        if (m.role !== "user" && !(o.includeAssistant && m.role === "assistant")) continue;
        scannedChars += m.text.length;
        const found = S.scan(m.text, SCRUB_OPTS);
        const { masked, spans } = maskMessage(m.text, found);
        found.forEach((f, k) => {
          const preview = S.preview(f);
          hits.push({ kind: f.kind, ruleId: f.ruleId, label: f.label, preview, msg: i, role: m.role, snippet: excerpt(masked, spans[k][0], spans[k][1]) });
          const key = f.kind + "\u0000" + f.value;
          let v = values.get(key);
          if (!v) values.set(key, (v = { kind: f.kind, ruleId: f.ruleId, label: f.label, preview, count: 0, convs: new Set() }));
          v.count++;
          v.convs.add(c.id || c.title);
        });
        if (m.role === "user") {
          // topics run on the masked text, so their excerpts can't reveal a secret either
          for (const t of topicHits(masked, m.kind !== "message")) {
            hits.push({ kind: "topic", ruleId: t.topic, label: t.label, preview: t.term, msg: i, role: m.role, snippet: t.snippet });
            topicTotals[t.topic].count++;
            topicTotals[t.topic].convs.add(c.id || c.title);
          }
        }
      }
      const secrets = hits.filter((h) => h.kind === "secret").length;
      const pii = hits.filter((h) => h.kind === "pii").length;
      const hidden = hits.filter((h) => h.kind === "hidden").length;
      const topics = new Set(hits.filter((h) => h.kind === "topic").map((h) => h.ruleId));
      const score = secrets * 20 + hidden * 8 + pii * 4 + topics.size * 3 + hits.filter((h) => h.kind === "topic").length * 0.2;
      convReports.push({
        id: c.id,
        title: c.title,
        url: c.url,
        source: c.source,
        created: c.created,
        updated: c.updated,
        messages: c.messages.length,
        secrets,
        pii,
        hidden,
        topics: [...topics],
        score,
        hits,
      });
      if (++done % 50 === 0) {
        if (o.onProgress) o.onProgress(done, total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (o.onProgress) o.onProgress(total, total);

    convReports.sort((a, b) => b.score - a.score || (b.updated || 0) - (a.updated || 0));
    const distinct = [...values.values()].map((v) => Object.assign({}, v, { convs: v.convs.size }));
    distinct.sort((a, b) => (a.kind === b.kind ? b.count - a.count : a.kind === "secret" ? -1 : b.kind === "secret" ? 1 : a.kind === "hidden" ? -1 : 1));

    return {
      totals: {
        conversations: conversations.length,
        userMessages,
        scannedChars,
        withFindings: convReports.filter((c) => c.hits.length).length,
        secrets: distinct.filter((d) => d.kind === "secret").length,
        identifiers: distinct.filter((d) => d.kind === "pii").length,
        hidden: distinct.filter((d) => d.kind === "hidden").length,
      },
      distinct,
      topics: Object.values(topicTotals).map((t) => Object.assign({}, t, { convs: t.convs.size })),
      conversations: convReports,
    };
  }

  // ---------------------------------------------------------------- redacted export

  // Returns a deep copy of the original export JSON with secrets, identifiers and hidden text
  // replaced by Scrub placeholders (consistent across the whole file), plus the restore vault.
  function redactExport(jsonText) {
    const data = JSON.parse(jsonText.replace(/^﻿/, ""));
    const vault = S.createVault();
    const red = (s) => (typeof s === "string" && s ? S.redact(s, SCRUB_OPTS, vault).text : s);
    const shape = shapeOf(data);
    if (shape === "chatgpt") {
      for (const c of data) {
        for (const node of Object.values(c.mapping || {})) {
          const ct = node && node.message && node.message.content;
          if (!ct) continue;
          if (Array.isArray(ct.parts)) ct.parts = ct.parts.map((p) => (typeof p === "string" ? red(p) : p && typeof p.text === "string" ? Object.assign(p, { text: red(p.text) }) : p));
          if (typeof ct.text === "string") ct.text = red(ct.text);
          if (typeof ct.user_profile === "string") ct.user_profile = red(ct.user_profile);
          if (typeof ct.user_instructions === "string") ct.user_instructions = red(ct.user_instructions);
        }
      }
    } else if (shape === "claude") {
      for (const c of data) {
        for (const m of c.chat_messages || []) {
          m.text = red(m.text);
          for (const b of m.content || []) if (b && typeof b.text === "string") b.text = red(b.text);
          for (const a of m.attachments || []) if (a && typeof a.extracted_content === "string") a.extracted_content = red(a.extracted_content);
        }
      }
    } else if (shape === "claude-projects") {
      for (const p of data) {
        p.prompt_template = red(p.prompt_template);
        for (const d of p.docs || []) d.content = red(d.content);
      }
    } else {
      (function walk(v) {
        if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "string" ? (v[i] = red(x)) : walk(x)));
        else if (v && typeof v === "object") for (const k of Object.keys(v)) typeof v[k] === "string" ? (v[k] = red(v[k])) : walk(v[k]);
      })(data);
    }
    return { json: JSON.stringify(data), vault };
  }

  return { load, listZip, readEntryText, isZip, parseJSONText, parseChatGPT, parseClaude, parseClaudeProjects, analyze, topicHits, redactExport, TOPICS };
});
