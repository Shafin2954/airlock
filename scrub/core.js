/*!
 * Airlock Scrub core — detect and reversibly redact secrets & personal data.
 * Zero dependencies. Works in browsers (window.ScrubCore) and Node (require).
 * MIT License.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ScrubCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- helpers

  function entropy(s) {
    if (!s) return 0;
    const freq = Object.create(null);
    for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
    let h = 0;
    const n = s.length;
    for (const k in freq) {
      const p = freq[k] / n;
      h -= p * Math.log2(p);
    }
    return h;
  }

  function luhn(digits) {
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (dbl) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  // ISO 13616 mod-97 check
  function ibanValid(s) {
    if (s.length < 15 || s.length > 34) return false;
    const r = s.slice(4) + s.slice(0, 4);
    let rem = 0;
    for (const ch of r) {
      const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
      for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
    }
    return rem === 1;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Values that are obviously not real credentials.
  const PLACEHOLDER_RE =
    /^(?:\$\{?|%\w|<[^>]*>?$|\{\{|\[[A-Z_]+_\d+\]$|x{3,}|\*{3,}|\.{3,}|changeme|change_me|your[_-]|my[_-]?(?:secret|token|password|key)|example|placeholder|redacted|dummy|sample|test(?:ing)?$|secret$|password$|passwd$|pass$|pwd$|pw$|token$|null$|none$|nil$|true$|false$|undefined$|process\.env|os\.environ|os\.getenv|env\(|getenv|import\.meta\.env)/i;

  function looksLikePlaceholder(v) {
    return PLACEHOLDER_RE.test(v);
  }

  // a.b.c or fn(...) or obj[...] — code, not a literal secret
  function looksLikeCode(v) {
    return (
      /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(v) ||
      /[()[\]{}]/.test(v) ||
      /^(?:\+\+|--|!|~|&&|\|\||\?\?)/.test(v) // ++counter, !flag, ?? fallback
    );
  }

  function isPrivateIPv4(ip) {
    const p = ip.split(".").map(Number);
    return (
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] === 0 ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224
    );
  }

  function validIPv6(s, opts) {
    if (s.includes(":::")) return false;
    const dbl = s.split("::").length - 1;
    if (dbl > 1) return false;
    const groups = s.split(":");
    const nonEmpty = groups.filter((g) => g.length > 0);
    if (nonEmpty.some((g) => g.length > 4 || !/^[0-9a-f]+$/i.test(g))) return false;
    if (dbl === 0 && groups.length !== 8) return false;
    if (dbl === 1 && nonEmpty.length > 7) return false;
    if (nonEmpty.length < 3) return false;
    // reject times and other short-decimal sequences like 12:30:45
    if (nonEmpty.every((g) => /^\d{1,2}$/.test(g))) return false;
    // need at least one "real" hex group
    if (!nonEmpty.some((g) => g.length >= 3 || /[a-f]/i.test(g))) return false;
    if (opts.keepPrivateIPs) {
      const first = parseInt(nonEmpty[0], 16);
      if (/^::1?$/.test(s) || /^fe[89ab]/i.test(s) || (first & 0xfe00) === 0xfc00) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- rules
  //
  // Each rule: id, label, kind ("secret" | "pii"), type (placeholder stem),
  // re (global regex), group (capture group to redact; 0 = whole match),
  // priority (higher wins overlaps), validate(value, match, opts) optional,
  // off (disabled by default).

  const SECRET_KEY_NAMES =
    "(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|private[_-]?key|auth[_-]?key|client[_-]?secret|credentials?)";

  const RULES = [
    {
      id: "private-key",
      label: "Private key block",
      kind: "secret",
      type: "PRIVATE_KEY",
      re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
      validate: (v) => {
        const body = v.replace(/-----[A-Z0-9 ]+-----/g, "").replace(/\\n|\s/g, "");
        return body.length >= 40 && !/^[Xx.*•…]+$/.test(body) && !/^\.\.\./.test(body);
      },
      priority: 100,
    },
    {
      id: "aws-access-key",
      label: "AWS access key ID",
      kind: "secret",
      type: "AWS_KEY",
      re: /\b(?:AKIA|ASIA|ABIA|ACCA|AGPA|AIDA|AROA|ANPA|ANVA|APKA)[0-9A-Z]{16}\b/g,
      priority: 90,
    },
    {
      id: "aws-secret-key",
      label: "AWS secret access key",
      kind: "secret",
      type: "AWS_SECRET",
      re: /(aws_?secret_?(?:access_?)?key)["']?\s*(?::=|=>|[:=])\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi,
      group: 2,
      priority: 90,
    },
    {
      id: "github-token",
      label: "GitHub token",
      kind: "secret",
      type: "GITHUB_TOKEN",
      re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g,
      priority: 90,
    },
    {
      id: "gitlab-token",
      label: "GitLab token",
      kind: "secret",
      type: "GITLAB_TOKEN",
      re: /\bgl(?:pat|dt|ptt|rt|cbt|imt|soat|ffct)-[A-Za-z0-9_-]{20,}\b/g,
      priority: 90,
    },
    {
      id: "anthropic-key",
      label: "Anthropic API key",
      kind: "secret",
      type: "ANTHROPIC_KEY",
      re: /\bsk-ant-[A-Za-z0-9]+-[A-Za-z0-9_-]{20,}/g,
      priority: 95,
    },
    {
      id: "openai-key",
      label: "OpenAI API key",
      kind: "secret",
      type: "OPENAI_KEY",
      re: /\bsk-(?:proj-|svcacct-|admin-|None-)?[A-Za-z0-9_-]{20,}/g,
      validate: (v) => !v.startsWith("sk-ant-") && /\d/.test(v) && /[A-Za-z]/.test(v.slice(3)),
      priority: 85,
    },
    {
      id: "stripe-key",
      label: "Stripe key",
      kind: "secret",
      type: "STRIPE_KEY",
      re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{24,}\b/g,
      priority: 90,
    },
    {
      id: "slack-token",
      label: "Slack token",
      kind: "secret",
      type: "SLACK_TOKEN",
      re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b|\bxapp-\d-[A-Za-z0-9-]{10,}\b/g,
      priority: 90,
    },
    {
      id: "slack-webhook",
      label: "Slack webhook URL",
      kind: "secret",
      type: "SLACK_WEBHOOK",
      re: /https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9_/-]{20,}/g,
      priority: 95,
    },
    {
      id: "discord-webhook",
      label: "Discord webhook URL",
      kind: "secret",
      type: "DISCORD_WEBHOOK",
      re: /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{30,}/g,
      priority: 95,
    },
    {
      id: "google-api-key",
      label: "Google API key",
      kind: "secret",
      type: "GOOGLE_KEY",
      re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
      priority: 90,
    },
    {
      id: "google-oauth-secret",
      label: "Google OAuth client secret",
      kind: "secret",
      type: "GOOGLE_SECRET",
      re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
      priority: 90,
    },
    {
      id: "huggingface-token",
      label: "Hugging Face token",
      kind: "secret",
      type: "HF_TOKEN",
      re: /\bhf_[A-Za-z0-9]{30,}\b/g,
      priority: 90,
    },
    {
      id: "npm-token",
      label: "npm token",
      kind: "secret",
      type: "NPM_TOKEN",
      re: /\bnpm_[A-Za-z0-9]{36}\b/g,
      priority: 90,
    },
    {
      id: "pypi-token",
      label: "PyPI token",
      kind: "secret",
      type: "PYPI_TOKEN",
      re: /\bpypi-AgE[A-Za-z0-9_-]{50,}/g,
      priority: 90,
    },
    {
      id: "sendgrid-key",
      label: "SendGrid API key",
      kind: "secret",
      type: "SENDGRID_KEY",
      re: /\bSG\.[A-Za-z0-9_-]{16,32}\.[A-Za-z0-9_-]{30,64}\b/g,
      priority: 90,
    },
    {
      id: "twilio-key",
      label: "Twilio API key",
      kind: "secret",
      type: "TWILIO_KEY",
      re: /\bSK[0-9a-f]{32}\b/g,
      priority: 80,
    },
    {
      id: "groq-key",
      label: "Groq API key",
      kind: "secret",
      type: "GROQ_KEY",
      re: /\bgsk_[A-Za-z0-9]{40,}\b/g,
      priority: 90,
    },
    {
      id: "replicate-token",
      label: "Replicate token",
      kind: "secret",
      type: "REPLICATE_TOKEN",
      re: /\br8_[A-Za-z0-9]{30,}\b/g,
      priority: 90,
    },
    {
      id: "digitalocean-token",
      label: "DigitalOcean token",
      kind: "secret",
      type: "DO_TOKEN",
      re: /\bdo[opr]_v1_[a-f0-9]{64}\b/g,
      priority: 90,
    },
    {
      id: "shopify-token",
      label: "Shopify token",
      kind: "secret",
      type: "SHOPIFY_TOKEN",
      re: /\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b/g,
      priority: 90,
    },
    {
      id: "telegram-bot-token",
      label: "Telegram bot token",
      kind: "secret",
      type: "TELEGRAM_TOKEN",
      re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g,
      priority: 85,
    },
    {
      id: "azure-storage-key",
      label: "Azure storage account key",
      kind: "secret",
      type: "AZURE_KEY",
      re: /(AccountKey=)([A-Za-z0-9+/]{80,90}={0,2})/g,
      group: 2,
      priority: 90,
    },
    {
      id: "jwt",
      label: "JSON Web Token",
      kind: "secret",
      type: "JWT",
      re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
      priority: 88,
    },
    {
      id: "url-password",
      label: "Password in URL",
      kind: "secret",
      type: "PASSWORD",
      re: /\b([a-z][a-z0-9+.-]{1,20}:\/\/)([^\s:@/?#'"]+):([^\s@/?#'"]+)@/gi,
      group: 3,
      validate: (v) => v.length >= 4 && !looksLikePlaceholder(v),
      priority: 80,
    },
    {
      id: "auth-header",
      label: "Authorization header",
      kind: "secret",
      type: "AUTH_TOKEN",
      re: /\b((?:proxy-)?authorization["']?\s*[:=]\s*["']?(?:Bearer|Basic|Token|Bot|Digest)\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
      group: 2,
      validate: (v) => !looksLikePlaceholder(v),
      priority: 75,
    },
    {
      id: "api-key-header",
      label: "API key header",
      kind: "secret",
      type: "API_KEY",
      re: /\b((?:x-)?(?:api-key|auth-token|access-token)["']?\s*:\s*["']?)([A-Za-z0-9._~+/=-]{12,})/gi,
      group: 2,
      validate: (v) => !looksLikePlaceholder(v),
      priority: 74,
    },
    {
      id: "generic-secret",
      label: "Secret-looking assignment",
      kind: "secret",
      type: "SECRET",
      // key name ending with a sensitive word, then := / => / : / = and a value
      re: new RegExp(
        "(^|[^A-Za-z0-9])([\"']?)([A-Za-z0-9_.-]*" +
          SECRET_KEY_NAMES +
          ")\\2([ \\t]*(?::=|=>|:|=)[ \\t]*)([\"'`]?)([^\\s\"'`,;]{6,})\\5",
        "gim"
      ),
      group: 6,
      validate: (v, m) => {
        if (looksLikePlaceholder(v) || looksLikeCode(v)) return false;
        const key = m[3].toLowerCase();
        const quoted = m[5] !== "";
        const lineStart = m.input.lastIndexOf("\n", m.index + m[1].length) + 1;
        let lineEnd = m.input.indexOf("\n", m.index + m[0].length);
        if (lineEnd < 0) lineEnd = m.input.length;
        const line = m.input.slice(lineStart, lineEnd).replace(/\r$/, "");
        const envStyle = /^\s*(?:export\s+)?[A-Z0-9_]+\s*=/.test(line);
        // whole line is `key: value` (YAML / INI-ish), not `key: value,` inside code
        const yamlStyle = m[4].includes(":") && /^\s*-?\s*["']?[\w.-]+["']?\s*:\s*\S*[^\s,]\s*(?:#.*)?$/.test(line);
        if (/%[sdr]|\$\{|\{\}/.test(v)) return false;
        const isPasswordKey = /pass|pwd/.test(key);
        const identifierLike = /^[a-z_][a-z0-9_]*$/.test(v) || /^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(v);
        if (isPasswordKey) {
          if (!quoted && !envStyle && !yamlStyle && identifierLike) return false;
          return v.length >= 6;
        }
        if (!quoted && !envStyle && !yamlStyle && identifierLike) return false;
        if (v.length < 12) return false;
        if (/^\d+$/.test(v)) return false;
        return entropy(v) >= 3.0;
      },
      priority: 50,
    },

    // ------------------------------------------------------------- PII
    {
      id: "email",
      label: "Email address",
      kind: "pii",
      type: "EMAIL",
      re: /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,24}\b/g,
      validate: (v, m) => {
        const [local, domain] = v.toLowerCase().split("@");
        // password part of scheme://user:pass@host is not an address
        if (/:\/\/[^\s/@]*:$/.test(m.input.slice(Math.max(0, m.index - 80), m.index))) return false;
        if (local === "git") return false;
        if (/(^|\.)example\.(?:com|org|net)$/.test(domain) || domain === "example" || /\.(?:test|invalid|localhost)$/.test(domain)) return false;
        if (/\.(?:png|jpe?g|gif|svg|webp)$/.test(domain)) return false; // retina assets: logo@2x.png
        return true;
      },
      priority: 60,
    },
    {
      id: "credit-card",
      label: "Payment card number",
      kind: "pii",
      type: "CARD",
      re: /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g,
      validate: (v) => {
        const d = v.replace(/\D/g, "");
        if (d.length < 13 || d.length > 19) return false;
        if (/^(\d)\1+$/.test(d)) return false;
        if (!/^(?:4|5[1-5]|2[2-7]|3[47]|3[0689]|6[05]|35)/.test(d)) return false;
        return luhn(d);
      },
      priority: 70,
    },
    {
      id: "iban",
      label: "Bank account (IBAN)",
      kind: "pii",
      type: "IBAN",
      re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g,
      validate: (v) => ibanValid(v.replace(/ /g, "")),
      priority: 72,
    },
    {
      id: "us-ssn",
      label: "US Social Security number",
      kind: "pii",
      type: "SSN",
      re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
      // only with a nearby hint, so part numbers and dates in this shape don't trip it
      validate: (v, m) => /\b(?:ssn|ss#|social[\s-]*security|soc\.?\s*sec)/i.test(m.input.slice(Math.max(0, m.index - 60), m.index + v.length + 30)),
      priority: 71,
    },

    // ------------------------------------------------------------- hidden text
    // Invisible characters used to smuggle instructions to an AI ("ASCII smuggling",
    // Trojan Source). These are not stored for restore: they are replaced by a visible
    // marker that shows what was hidden.
    {
      id: "hidden-tag-text",
      label: "Hidden text (Unicode tag characters)",
      kind: "hidden",
      type: "HIDDEN",
      re: /[\u{E0000}-\u{E007F}]+/gu,
      // the England / Scotland / Wales flag emoji legitimately use tag characters after U+1F3F4
      validate: (v, m) => m.input.codePointAt(Math.max(0, m.index - 2)) !== 0x1f3f4,
      replace: (v) => {
        const decoded = Array.from(v, (c) => c.codePointAt(0) - 0xe0000)
          .filter((n) => n >= 0x20 && n <= 0x7e)
          .map((n) => String.fromCharCode(n))
          .join("");
        return decoded ? '[HIDDEN TEXT: "' + decoded + '"]' : "[HIDDEN CHARACTERS]";
      },
      priority: 105,
    },
    {
      id: "zero-width-run",
      label: "Run of invisible characters",
      kind: "hidden",
      type: "HIDDEN",
      // a single ZWJ/ZWNJ is normal (emoji sequences, Persian, Indic scripts); long runs encode data
      re: /[​‌‍⁠﻿᠎]{3,}/g,
      replace: (v) => "[HIDDEN CHARACTERS ×" + v.length + "]",
      priority: 104,
    },
    {
      id: "bidi-control",
      label: "Text-direction override (Trojan Source)",
      kind: "hidden",
      type: "HIDDEN",
      re: /[‪-‮⁦-⁩]/g,
      replace: () => "[DIRECTION OVERRIDE]",
      priority: 103,
    },
    {
      id: "mac-address",
      label: "MAC address",
      kind: "pii",
      type: "MAC",
      re: /\b(?:[0-9A-Fa-f]{2}([:-]))(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}\b/g,
      validate: (v) => !/^(?:00[:-]){5}00$/.test(v) && !/^(?:ff[:-]){5}ff$/i.test(v),
      priority: 66,
    },
    {
      id: "ipv4",
      label: "IPv4 address",
      kind: "pii",
      type: "IP",
      re: /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w]|\.\d)/g,
      validate: (v, m, opts) => {
        if (v === "255.255.255.255" || v === "0.0.0.0") return false;
        if (opts.keepPrivateIPs && isPrivateIPv4(v)) return false;
        // version strings: "v1.2.3.4", "version 1.2.3.4"
        const pre = m.input.slice(Math.max(0, m.index - 9), m.index).toLowerCase();
        if (/(?:v|version\s?|ver\s?)$/.test(pre)) return false;
        // RFC / spec section numbers: "Section 2.3.1.3", "#section-7.1.1.1", "§ 4.1.2.5"
        const ctx = m.input.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
        if (/(?:section|sec\.|§|chapter|clause|step|figure|table|item)[\s-]*$/.test(ctx)) return false;
        return true;
      },
      priority: 65,
    },
    {
      id: "ipv6",
      label: "IPv6 address",
      kind: "pii",
      type: "IP",
      re: /(?<![\w:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:])/g,
      validate: (v, m, opts) => validIPv6(v, opts),
      priority: 64,
    },
    {
      id: "home-path",
      label: "Username in home path",
      kind: "pii",
      type: "USER",
      re: /(\/Users\/|\/home\/|[A-Za-z]:\\{1,2}Users\\{1,2}|[A-Za-z]:\/Users\/)([^/\\\s"'`:*?<>|]+)/g,
      group: 2,
      validate: (v) => !/^[{<%$[]/.test(v) && !/^(?:shared|public|default|default user|all users|runner|root|user|username|you|me|\$user|%username%|\$\{?user\}?|<[^>]+>|\.\.\.|~)$/i.test(v) && !/^\[[A-Z_]+_\d+\]$/.test(v),
      priority: 55,
    },
    {
      id: "phone",
      label: "Phone number",
      kind: "pii",
      type: "PHONE",
      re: /(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,4}(?![\w])|(?<![\w+])\+\d{9,15}(?!\w)/g,
      validate: (v) => {
        const d = v.replace(/\D/g, "");
        return d.length >= 9 && d.length <= 15 && !/^(\d)\1+$/.test(d);
      },
      priority: 40,
      off: true,
    },
  ];

  const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

  // ---------------------------------------------------------------- options

  const DEFAULTS = {
    enabled: null, // map of ruleId -> boolean overrides
    kinds: ["secret", "pii", "hidden"], // which kinds to scan for
    keepPrivateIPs: true,
    customTerms: [], // extra words/phrases to redact (company names, codenames…)
    allowlist: [], // exact values never to redact
  };

  function normalizeOptions(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    o.enabled = Object.assign({}, o.enabled || {});
    o.allow = new Set((o.allowlist || []).map((s) => String(s)));
    return o;
  }

  function ruleActive(rule, o) {
    if (!o.kinds.includes(rule.kind)) return false;
    if (Object.prototype.hasOwnProperty.call(o.enabled, rule.id)) return !!o.enabled[rule.id];
    return !rule.off;
  }

  // ---------------------------------------------------------------- scan

  function findAll(text, opts) {
    const o = normalizeOptions(opts);
    const raw = [];
    for (const rule of RULES) {
      if (!ruleActive(rule, o)) continue;
      const re = new RegExp(rule.re.source, rule.re.flags.includes("d") ? rule.re.flags : rule.re.flags + "d");
      let m;
      while ((m = re.exec(text))) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const g = rule.group || 0;
        const value = m[g];
        if (value == null || value === "") continue;
        if (o.allow.has(value)) continue;
        if (rule.validate && !rule.validate(value, m, o)) continue;
        const start = g > 0 ? m.indices[g][0] : m.index;
        raw.push({
          ruleId: rule.id,
          label: rule.label,
          kind: rule.kind,
          type: rule.type,
          start,
          end: start + value.length,
          value,
          priority: rule.priority,
        });
      }
    }

    const terms = (o.customTerms || []).map((t) => String(t).trim()).filter(Boolean);
    if (terms.length) {
      // longest first so "Acme Corp" wins over "Acme"
      terms.sort((a, b) => b.length - a.length);
      const re = new RegExp("(?<![\\w])(?:" + terms.map(escapeRegExp).join("|") + ")(?![\\w])", "gi");
      let m;
      while ((m = re.exec(text))) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        raw.push({
          ruleId: "custom-term",
          label: "Custom term",
          kind: "custom",
          type: "TERM",
          start: m.index,
          end: m.index + m[0].length,
          value: m[0],
          priority: 58, // above paths, below emails/IPs/secrets so "jane@acme.io" stays one [EMAIL]
        });
      }
    }

    // resolve overlaps: highest priority, then longest, then earliest
    raw.sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start);
    const taken = [];
    const out = [];
    for (const f of raw) {
      let clash = false;
      for (const t of taken) {
        if (f.start < t.end && t.start < f.end) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      taken.push(f);
      out.push(f);
    }
    out.sort((a, b) => a.start - b.start);
    for (const f of out) delete f.priority;
    return out;
  }

  // ---------------------------------------------------------------- vault

  function createVault(data) {
    const v = { map: {}, counters: {} };
    if (data && data.map) {
      v.map = Object.assign({}, data.map);
      v.counters = Object.assign({}, data.counters || {});
    }
    return v;
  }

  // value -> placeholder index, kept outside the vault so the vault stays plain JSON
  const reverse = new WeakMap();

  function placeholderFor(vault, type, value) {
    let rev = reverse.get(vault);
    if (!rev || rev.size !== Object.keys(vault.map).length) {
      rev = new Map(Object.entries(vault.map).map(([ph, v]) => [v, ph]));
      reverse.set(vault, rev);
    }
    if (rev.has(value)) return rev.get(value);
    let n = (vault.counters[type] || 0) + 1;
    while (("[" + type + "_" + n + "]") in vault.map) n++;
    vault.counters[type] = n;
    const ph = "[" + type + "_" + n + "]";
    vault.map[ph] = value;
    rev.set(value, ph);
    return ph;
  }

  // ---------------------------------------------------------------- redact / restore

  function redact(text, opts, vault) {
    vault = vault || createVault();
    const findings = findAll(text, opts);
    let out = "";
    let last = 0;
    const segments = [];
    for (const f of findings) {
      const rule = RULE_BY_ID[f.ruleId];
      // hidden-text rules are replaced by a visible marker and never stored for restore
      const ph = rule && rule.replace ? rule.replace(f.value) : placeholderFor(vault, f.type, f.value);
      f.placeholder = ph;
      out += text.slice(last, f.start);
      segments.push({ start: out.length, end: out.length + ph.length, finding: f });
      out += ph;
      last = f.end;
    }
    out += text.slice(last);
    return { text: out, findings, segments, vault };
  }

  function restore(text, vault) {
    const phs = Object.keys(vault.map || {});
    if (!phs.length) return { text, count: 0 };
    phs.sort((a, b) => b.length - a.length);
    const lookup = {};
    for (const p of phs) lookup[p.toUpperCase()] = vault.map[p];
    const re = new RegExp(phs.map(escapeRegExp).join("|"), "gi");
    let count = 0;
    const out = text.replace(re, (m) => {
      count++;
      return lookup[m.toUpperCase()];
    });
    return { text: out, count };
  }

  function mask(value) {
    if (value.length <= 8) return "•".repeat(value.length);
    return value.slice(0, 4) + "…" + "•".repeat(Math.min(8, value.length - 6)) + value.slice(-2);
  }

  // what to show a person for a finding without revealing a secret
  function preview(f) {
    const rule = RULE_BY_ID[f.ruleId];
    return rule && rule.replace ? rule.replace(f.value) : mask(f.value);
  }

  function rules() {
    return RULES.map((r) => ({ id: r.id, label: r.label, kind: r.kind, type: r.type, defaultOn: !r.off }));
  }

  return {
    version: "0.1.0",
    rules,
    scan: findAll,
    redact,
    restore,
    createVault,
    mask,
    preview,
    entropy,
    _ruleById: RULE_BY_ID,
  };
});
