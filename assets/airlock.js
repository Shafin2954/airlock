/* Airlock — tiny shared helpers for the tool pages (no network calls). */
(function () {
  "use strict";

  const LOGO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 3v18"/><path d="M8 9v6M16 9v6"/></svg>';
  const GH =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';
  const MOON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  const TOOLS = [
    { id: "scrub", name: "Scrub", href: "scrub/" },
    { id: "context-map", name: "Context Map", href: "context-map/" },
    { id: "jsonl-lens", name: "JSONL Lens", href: "jsonl-lens/" },
    { id: "footprint", name: "Footprint", href: "footprint/" },
  ];

  const REPO = "https://github.com/Shafin2954/anything";

  function theme() {
    try {
      const t = localStorage.getItem("airlock-theme");
      if (t) document.documentElement.dataset.theme = t;
    } catch {}
  }
  theme();

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("airlock-theme", root.dataset.theme);
    } catch {}
  }

  // <header data-airlock-topbar data-tool="scrub" data-base="../">
  function topbar() {
    const el = document.querySelector("[data-airlock-topbar]");
    if (!el) return;
    const tool = el.dataset.tool || "";
    const base = el.dataset.base || "./";
    const current = TOOLS.find((t) => t.id === tool);
    el.classList.add("topbar");
    el.innerHTML =
      '<a class="brand" href="' + base + '">' + LOGO + "<span>Airlock</span>" +
      (current ? '<span class="sep">/</span><span class="tool">' + current.name + "</span>" : "") +
      "</a>" +
      '<nav aria-label="Tools">' +
      TOOLS.map((t) => '<a href="' + base + t.href + '"' + (t.id === tool ? ' aria-current="page"' : "") + ">" + t.name + "</a>").join("") +
      "</nav>" +
      '<span class="spacer"></span>' +
      '<span class="local-badge" title="This page makes no network requests with your data. Check the Network tab.">Runs locally · nothing uploaded</span>' +
      '<button class="icon-btn" type="button" data-theme-toggle aria-label="Toggle dark mode">' + MOON + "</button>" +
      '<a class="icon-btn" href="' + REPO + '" aria-label="Source on GitHub" target="_blank" rel="noopener">' + GH + "</a>";
    el.querySelector("[data-theme-toggle]").addEventListener("click", toggleTheme);
  }

  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast(msg || "Copied");
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  window.Airlock = { toast, copy, download, esc, debounce, REPO };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", topbar);
  else topbar();
})();
