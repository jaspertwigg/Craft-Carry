(() => {
  "use strict";

  // ---------- constants ----------
  // Storage names predate the JT Creations rename; changing them would lose saved projects.
  const KEY = "workshop-log-v1";
  const LINES = {
    wood: { name: "Wood Talking", emoji: "🪵", craft: "Woodwork" },
    leather: { name: "Craft & Carry", emoji: "👜", craft: "Leatherwork" },
  };
  const DEFAULT_MATERIALS = {
    wood: ["Jarrah", "Marri", "Sheoak", "Blackbutt", "Tasmanian oak", "Pine", "Walnut", "Oak", "Maple",
      "Plywood", "MDF", "Wood glue", "Brass hardware", "Screws"],
    leather: ["Veg-tan leather", "Chrome-tan leather", "Kangaroo leather", "Suede", "Waxed thread", "Rivets",
      "Snaps", "Buckles", "D-rings", "Zips", "Contact cement"],
  };
  const DEFAULT_FINISHES = {
    wood: ["Beeswax", "Danish oil", "Tung oil", "Linseed oil", "Food-safe oil", "Hardwax oil", "CA glue", "Shellac",
      "Polyurethane", "Lacquer", "Stain", "Paint", "Unfinished"],
    leather: ["Beeswax", "Neatsfoot oil", "Leather balm", "Resolene", "Edge paint", "Tokonole", "Burnished edges",
      "Leather dye", "Antique finish", "Mink oil", "Unfinished"],
  };
  // Pick-list fields: each workshop keeps its own list of choices for each.
  const PICKS = {
    materials: { label: "Materials", one: "material", defaults: DEFAULT_MATERIALS },
    finishes: { label: "Finish", one: "finish", defaults: DEFAULT_FINISHES },
  };
  const DEFAULT_PREFIX = { wood: "WT", leather: "CC" };
  const STATUSES = ["Idea", "In progress", "Finished", "For sale", "Sold", "Gifted", "Kept"];
  const DONE = ["Finished", "For sale", "Sold", "Gifted", "Kept"];
  const PURPOSES = ["For sale", "Commission", "Gift", "Personal use", "Practice / prototype", "Market stock"];

  const $ = (s, r = document) => r.querySelector(s);
  const view = $("#view"), modal = $("#modal"), toastEl = $("#toast");
  const ui = { q: "", status: "All", line: "All", logOpen: false };
  let pendingMediaFor = null;

  // ---------- helpers ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const str = (v) => (v == null ? "" : String(v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => isoOf(new Date());
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const fmtDate = (iso) => iso ? parse(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
  const localDT = (ms) => { const d = new Date(ms); return `${isoOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
  const money = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
  const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, "-");
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function fmtDur(ms) {
    const m = Math.floor(ms / 6e4), h = Math.floor(m / 60);
    if (!m) return ms > 0 ? "<1m" : "0m";
    return h ? `${h}h ${m % 60}m` : `${m}m`;
  }
  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // A web app can't write to the camera roll directly. On iPhone the share sheet has
  // "Save Image/Video"; on Android a download lands in the gallery's Downloads album.
  // Must be called straight from a tap, before any await, or the browser blocks it.
  function saveToRoll(files) {
    if (!files.length) return;
    const android = /Android/i.test(navigator.userAgent);
    if (!android && navigator.share && navigator.canShare && navigator.canShare({ files })) {
      navigator.share({ files }).catch((e) => {
        if (e && e.name !== "AbortError") toast("Couldn't open the save menu");
      });
    } else {
      files.forEach((f) => download(f, f.name));
    }
  }
  const extOf = (type) => ({ "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "video/mp4": "mp4",
    "video/quicktime": "mov", "video/webm": "webm" })[type] || (type.split("/")[1] || "bin");
  const fileFor = (blob, p, n) => new File([blob], `${(p.code || "project").replace(/[^\w-]+/g, "")}-${n}.${extOf(blob.type)}`, { type: blob.type });

  // ---------- state ----------
  function blank() {
    const settings = { prefixes: { ...DEFAULT_PREFIX }, schema: 2, used: {}, sort: "added" };
    for (const [kind, pk] of Object.entries(PICKS)) {
      settings[kind] = { wood: [...pk.defaults.wood], leather: [...pk.defaults.leather] };
      settings.used[kind] = { wood: {}, leather: {} };
    }
    return { settings, projects: [] };
  }
  const hasItem = (list, v) => list.some((x) => x.toLowerCase() === v.toLowerCase());
  function addOption(kind, line, v, settings = state.settings) {
    const list = settings[kind][line];
    if (v && !hasItem(list, v)) list.push(v);
  }
  function normalize(s) {
    const out = blank();
    if (!s || typeof s !== "object") return out;
    const pre = (s.settings && s.settings.prefixes) || {};
    for (const k of Object.keys(DEFAULT_PREFIX)) {
      if (typeof pre[k] === "string" && pre[k].trim()) out.settings.prefixes[k] = pre[k].trim().toUpperCase();
    }
    if (s.settings && typeof s.settings.sort === "string") out.settings.sort = s.settings.sort;
    if (s.settings && LINES[s.settings.lastLine]) out.settings.lastLine = s.settings.lastLine;
    for (const kind of Object.keys(PICKS)) {
      const saved = (s.settings && s.settings[kind]) || {};
      for (const k of Object.keys(LINES)) {
        if (!Array.isArray(saved[k])) continue;
        out.settings[kind][k] = [];
        for (const v of saved[k]) if (typeof v === "string" && v.trim()) addOption(kind, k, v.trim(), out.settings);
      }
    }
    if (Array.isArray(s.projects)) out.projects = s.projects.filter((x) => x && x.id && LINES[x.line]).map(normProject);
    if (!(s.settings && s.settings.schema >= 2)) moveFinishesOutOfMaterials(out);
    out.settings.schema = 2;
    // Anything used on a project belongs in that workshop's choice list.
    for (const p of out.projects) for (const kind of Object.keys(PICKS)) for (const m of p[kind]) addOption(kind, p.line, m, out.settings);
    const used = (s.settings && s.settings.used) || {};
    for (const kind of Object.keys(PICKS)) {
      for (const k of Object.keys(LINES)) {
        const src = (used[kind] && used[kind][k]) || {}, dst = out.settings.used[kind][k];
        for (const [name, t] of Object.entries(src)) if (Number.isFinite(t)) dst[name] = t;
      }
    }
    // Before "recently used" was tracked, fall back to when each project was last saved.
    if (!(s.settings && s.settings.used)) for (const p of out.projects) markUsed(p, p.updated, out.settings);
    return out;
  }
  // Early versions put finishes (beeswax, oils, edge paint…) in the materials list; move them across once.
  const OLD_FINISH_MATERIALS = ["Danish oil", "Food-safe oil", "Beeswax", "Polyurethane", "Edge paint", "Leather dye", "Neatsfoot oil"];
  function moveFinishesOutOfMaterials(out) {
    for (const line of Object.keys(LINES)) {
      const isFinish = (m) => hasItem(OLD_FINISH_MATERIALS, m) || hasItem(out.settings.finishes[line], m);
      out.settings.materials[line] = out.settings.materials[line].filter((m) => !isFinish(m));
      for (const p of out.projects.filter((x) => x.line === line)) {
        for (const m of p.materials.filter(isFinish)) {
          if (!hasItem(p.finishes, m)) p.finishes.push(m);
          addOption("finishes", line, m, out.settings);
        }
        p.materials = p.materials.filter((m) => !isFinish(m));
      }
    }
  }
  function markUsed(p, t = Date.now(), settings = state.settings) {
    for (const kind of Object.keys(PICKS)) {
      const used = settings.used[kind][p.line];
      for (const m of p[kind]) used[m.toLowerCase()] = Math.max(used[m.toLowerCase()] || 0, t);
    }
  }
  const pickList = (v) => (Array.isArray(v) ? v : str(v).split(/[,;]/)).map((m) => str(m).trim()).filter(Boolean);
  // Video "trims" are start/end points (seconds) the app plays between; the file itself is unchanged.
  function normTrims(t, videos) {
    const out = {};
    for (const id of videos) {
      const v = t && t[id];
      if (v && Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start) out[id] = { start: v.start, end: v.end };
    }
    return out;
  }
  function normProject(x) {
    const sale = x.sale || {}, gift = x.gift || {}, kept = x.kept || {};
    const ids = (a) => (Array.isArray(a) ? a.filter((v) => typeof v === "string") : []);
    return {
      id: String(x.id), line: x.line, name: str(x.name), code: str(x.code),
      status: STATUSES.includes(x.status) ? x.status : "In progress",
      start: str(x.start), end: str(x.end), datesUnknown: !!x.datesUnknown, timeUnknown: !!x.timeUnknown, purpose: str(x.purpose), description: str(x.description),
      materials: pickList(x.materials), finishes: pickList(x.finishes),
      dimensions: str(x.dimensions), cost: str(x.cost), notes: str(x.notes),
      sale: { asking: str(sale.asking), price: str(sale.price), date: str(sale.date), buyer: str(sale.buyer),
        where: str(sale.where), notes: str(sale.notes) },
      gift: { to: str(gift.to), date: str(gift.date), occasion: str(gift.occasion), notes: str(gift.notes) },
      kept: { where: str(kept.where), notes: str(kept.notes) },
      photos: ids(x.photos), videos: ids(x.videos), trims: normTrims(x.trims, ids(x.videos)),
      sessions: (Array.isArray(x.sessions) ? x.sessions : [])
        .filter((t) => t && Number.isFinite(t.start))
        .map((t) => ({ start: t.start, end: Number.isFinite(t.end) ? t.end : null, manual: !!t.manual })),
      created: Number(x.created) || Date.now(), updated: Number(x.updated) || Date.now(),
    };
  }
  function load() {
    const raw = localStorage.getItem(KEY);
    try { return normalize(JSON.parse(raw)); } catch {
      // Never let a bad load be saved over the only copy: park the raw data first.
      try { if (raw) localStorage.setItem(KEY + "-rescue-" + Date.now(), raw); } catch { /* storage full */ }
      return blank();
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { toast("Couldn't save — phone storage may be full"); }
  }
  let state = load();
  const find = (id) => state.projects.find((p) => p.id === id);
  const ofLine = (line) => state.projects.filter((p) => p.line === line);

  function nextCode(line, year, exceptId) {
    const prefix = state.settings.prefixes[line] + String(year).slice(-2);
    const re = new RegExp("^" + escRe(prefix) + "(\\d+)$", "i");
    let max = 0;
    for (const p of state.projects) {
      const m = p.id !== exceptId && p.code.match(re);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return prefix + pad(max + 1);
  }

  // ---------- timer ----------
  const running = (p) => p.sessions.find((t) => t.end == null);
  const totalMs = (p) => p.sessions.reduce((sum, t) => sum + ((t.end ?? Date.now()) - t.start), 0);
  function tick() {
    document.querySelectorAll("[data-timer]").forEach((el) => {
      const p = find(el.dataset.timer);
      if (p) el.textContent = fmtClock(totalMs(p));
    });
  }
  setInterval(tick, 1000);

  // ---------- media (photos & videos live in IndexedDB, too big for localStorage) ----------
  const media = (() => {
    let dbp;
    const db = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("workshop-log-media", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("media", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const d = await db();
      return new Promise((res, rej) => {
        const t = d.transaction("media", mode);
        const req = fn(t.objectStore("media"));
        t.oncomplete = () => res(req && req.result);
        t.onerror = t.onabort = () => rej(t.error);
      });
    };
    return {
      put: (rec) => tx("readwrite", (s) => s.put(rec)),
      get: (id) => tx("readonly", (s) => s.get(id)),
      del: (id) => tx("readwrite", (s) => s.delete(id)),
      all: () => tx("readonly", (s) => s.getAll()),
      keys: () => tx("readonly", (s) => s.getAllKeys()),
    };
  })();
  const urls = new Map(), blobs = new Map();
  const mediaAttr = (id) => (urls.has(id) ? `src="${urls.get(id)}"` : `data-media="${esc(id)}"`);
  async function mediaURL(id) {
    if (urls.has(id)) return urls.get(id);
    const rec = await media.get(id);
    if (!rec) return "";
    const u = URL.createObjectURL(rec.blob);
    urls.set(id, u);
    blobs.set(id, rec.blob);
    return u;
  }
  function hydrate() {
    document.querySelectorAll("[data-media]").forEach((el) => {
      const id = el.dataset.media;
      el.removeAttribute("data-media");
      const missing = () => {
        if (el.tagName !== "VIDEO") return el.classList.add("missing");
        el.outerHTML = `<p class="muted small">This video isn't on this device (it wasn't in the backup).</p>`;
      };
      mediaURL(id).then((u) => { if (u) el.src = u; else missing(); }).catch(missing);
    });
  }
  function forgetURL(id) {
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    blobs.delete(id);
  }
  async function shrinkImage(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5e6) { bmp.close && bmp.close(); return file; }
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      return blob && blob.size < file.size ? blob : file;
    } catch { return file; }
  }
  // Photos/videos added in the project form are stored straight away but only attached on Save
  // (and deleted again on Cancel), so nothing is lost or left behind either way.
  let draft = null;
  const targetOf = (id) => (id === "draft" ? draft : find(id));
  function mediaChanged(target) {
    if (target === draft) return renderDraftMedia();
    target.updated = Date.now();
    save();
    render();
  }
  function discardDraft() {
    if (!draft) return;
    for (const id of draft.added) { forgetURL(id); media.del(id).catch(() => {}); }
    draft = null;
  }
  async function addMedia(p, files, kind) {
    if (!p || !files.length) return;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    toast(kind === "photo" ? "Adding photos…" : "Saving video… (big files take a moment)");
    let added = 0;
    for (const file of files) {
      try {
        const blob = kind === "photo" ? await shrinkImage(file) : file;
        const id = uid();
        await media.put({ id, kind, type: blob.type || file.type, name: file.name, blob, created: Date.now() });
        p[kind === "photo" ? "photos" : "videos"].push(id);
        if (p === draft) draft.added.push(id);
        added++;
      } catch (e) {
        toast(e && e.name === "QuotaExceededError" ? "Not enough storage space on this device" : "Couldn't save " + file.name);
      }
    }
    if (added) {
      mediaChanged(p);
      toast(`Added ${added} ${kind}${added > 1 ? "s" : ""}`);
    }
  }
  async function removeMedia(p, kind, id) {
    const list = kind === "photo" ? p.photos : p.videos;
    const i = list.indexOf(id);
    if (i < 0) return;
    list.splice(i, 1);
    delete p.trims[id];
    p.updated = Date.now();
    save();
    forgetURL(id);
    await media.del(id).catch(() => {});
  }

  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  // ---------- navigation ----------
  function route() {
    const [a, b] = location.hash.replace(/^#\/?/, "").split("/");
    // Old #/wood and #/leather links open the list filtered to that workshop.
    if (LINES[a]) { ui.line = a; history.replaceState(history.state, "", "#/list"); return { name: "list" }; }
    if (a === "list") return { name: "list" };
    if (a === "p" && find(b)) return { name: "project", id: b, line: find(b).line };
    return { name: "home" };
  }
  function navigate(hash) {
    history.pushState({ d: ((history.state && history.state.d) || 0) + 1 }, "", hash);
    render();
    window.scrollTo(0, 0);
  }
  function goBack() {
    const r = route();
    if (history.state && history.state.d > 0) return history.back();
    history.replaceState({ d: 0 }, "", r.name === "project" ? "#/list" : "#/");
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", () => { render(); window.scrollTo(0, 0); });

  // ---------- views ----------
  function statusPill(s) { return `<span class="pill st-${slug(s)}">${esc(s)}</span>`; }
  function thumb(p) {
    return p.photos[0]
      ? `<img class="thumb" alt="" ${mediaAttr(p.photos[0])}>`
      : `<span class="thumb ph">${LINES[p.line].emoji}</span>`;
  }
  function card(p) {
    const done = !p.datesUnknown && p.end ? fmtDate(p.end) : "";
    return `<button class="pcard" data-action="go" data-to="#/p/${esc(p.id)}">
      ${thumb(p)}
      <span class="pbody">
        <span class="prow"><span class="code code-${p.line}">${esc(p.code || "No code")}</span>${statusPill(p.status)}</span>
        <span class="pname">${esc(p.name)}${p.materials.length ? `<span class="pmats"> | ${esc(p.materials.join(", "))}</span>` : ""}</span>
        ${done ? `<span class="pmeta">${done}</span>` : ""}
      </span>
    </button>`;
  }
  function stats(list) {
    const ms = list.reduce((s, p) => s + totalMs(p), 0);
    const sales = list.map((p) => num(p.sale.price)).filter((n) => n != null);
    return {
      count: list.length,
      done: list.filter((p) => DONE.includes(p.status)).length,
      hours: ms / 36e5,
      sold: sales.length,
      revenue: sales.reduce((a, b) => a + b, 0),
    };
  }
  function runningCard() {
    const live = state.projects.filter(running);
    if (!live.length) return "";
    return `<section class="card live-card">
      <h3>⏱ Timer running</h3>
      ${live.map((p) => `<div class="live-row">
        <button class="link" data-action="go" data-to="#/p/${esc(p.id)}"><b>${esc(p.code)}</b> ${esc(p.name)}</button>
        <span class="clock" data-timer="${esc(p.id)}">${fmtClock(totalMs(p))}</span>
        <button class="btn small stop" data-action="timer" data-id="${esc(p.id)}">Stop</button>
      </div>`).join("")}
    </section>`;
  }

  const views = {
    home() {
      const n = () => { const c = state.projects.length; return `${c} project${c === 1 ? "" : "s"}`; };
      const last = [...state.projects].sort((a, b) => b.updated - a.updated)[0];
      const option = (attrs, icon, title, sub) => `<button class="option" ${attrs}>
          <span class="option-icon">${icon}</span>
          <span><span class="option-title">${title}</span><span class="option-sub">${sub}</span></span>
        </button>`;
      return `<section class="landing">
          <img class="landing-logo" src="icon.svg" alt="">
          <h2>JT Creations</h2>
          <p class="muted">Wood Talking &amp; Craft &amp; Carry</p>
        </section>
        ${runningCard()}
        <div class="options">
          ${option('data-action="newProject"', "➕", "Start new project", "Wood Talking or Craft &amp; Carry")}
          ${option('data-action="openList" data-line="All"', "📋", "View project list", `${n()} · search, filter and sort`)}
          ${last ? option(`data-action="go" data-to="#/p/${esc(last.id)}"`, "↩︎", "Pick up where you left off", `${esc(last.code)} ${esc(last.name)}`) : ""}
          ${option('data-action="shareApp"', "🔗", "Share the app", "Send the link to someone")}
          ${option('data-action="settings"', "⚙️", "Settings &amp; backup", "Codes, material lists, backup and spreadsheet")}
        </div>`;
    },

    list() {
      if (!state.projects.length) return `<p class="empty">No projects yet.</p>
        <button class="btn block big" data-action="newProject">＋ New project</button>`;
      const list = ui.line === "All" ? state.projects : ofLine(ui.line);
      const s = stats(list);
      const present = STATUSES.filter((st) => list.some((p) => p.status === st));
      if (ui.status !== "All" && !present.includes(ui.status)) ui.status = "All";
      const lineChip = (k, label) => `<button class="chip line-chip${ui.line === k ? " on" : ""}" data-action="filterLine" data-line="${k}">${label}
        <small>${k === "All" ? state.projects.length : ofLine(k).length}</small></button>`;
      return `${runningCard()}
        <section class="stats">
          <div><b>${s.count}</b><span>projects</span></div>
          <div><b>${s.done}</b><span>finished</span></div>
          <div><b>${s.hours.toFixed(1)}</b><span>hours</span></div>
          <div><b>${s.sold ? money(s.revenue).replace(/\.00$/, "") : "—"}</b><span>${s.sold} sold</span></div>
        </section>
        <button class="btn block big" data-action="newProject">＋ New project</button>
        <div class="list-tools">
          <input id="search" type="search" placeholder="Search…" value="${esc(ui.q)}" autocomplete="off">
          <label class="sort"><select id="sortBy" aria-label="Sort by">${Object.entries(SORTS).map(([k, o]) =>
            `<option value="${k}"${state.settings.sort === k ? " selected" : ""}>${o.label}</option>`).join("")}</select></label>
        </div>
        <div class="line-chips">${lineChip("All", "All")}${Object.keys(LINES).map((k) => lineChip(k, `${LINES[k].emoji} ${esc(LINES[k].name)}`)).join("")}</div>
        <div class="chips">${["All", ...present].map((st) =>
          `<button class="chip${ui.status === st ? " on" : ""}" data-action="filter" data-status="${esc(st)}">${st === "All" ? "Any status" : esc(st)}</button>`).join("")}</div>
        <div id="list" class="list">${listHTML()}</div>`;
    },

    project({ id }) {
      const p = find(id);
      const ms = totalMs(p), run = running(p);
      const L = LINES[p.line];
      const row = (label, val) => (val ? `<dt>${label}</dt><dd>${val}</dd>` : "");
      const price = num(p.sale.price), cost = num(p.cost), hours = p.timeUnknown ? 0 : ms / 36e5;
      const profit = price != null ? price - (cost || 0) : null;
      const sessions = p.sessions.map((t, i) => ({ ...t, i })).sort((a, b) => b.start - a.start);
      const sale = p.sale;
      const hasSale = Object.values(sale).some(Boolean);

      return `<section class="hero">
          ${p.photos[0]
            ? `<button class="hero-img" data-action="photo" data-id="${esc(p.id)}" data-i="0"><img alt="" ${mediaAttr(p.photos[0])}></button>`
            : `<div class="hero-img ph"><span>${L.emoji}</span>${mediaBtns(p.id, "photo")}</div>`}
          <div class="hero-text">
            <div class="prow"><span class="code big">${esc(p.code || "No code")}</span>${statusPill(p.status)}</div>
            <h2>${esc(p.name)}</h2>
            <p class="muted">${esc(L.name)}${p.purpose ? " · " + esc(p.purpose) : ""}</p>
          </div>
        </section>

        ${p.timeUnknown && !run ? "" : `<section class="card timer${run ? " on" : ""}">
          <div class="timer-top">
            <div>
              <div class="clock big" data-timer="${esc(p.id)}">${fmtClock(ms)}</div>
              <div class="muted small">${run ? "Timing since " + fmtTime(run.start)
                : `Total time · ${p.sessions.length} session${p.sessions.length === 1 ? "" : "s"}`}</div>
            </div>
            <button class="btn timer-btn${run ? " stop" : ""}" data-action="timer" data-id="${esc(p.id)}">${run ? "■ Stop" : "▶ Start"}</button>
          </div>
          <details${ui.logOpen ? " open" : ""}>
            <summary>Time log · edit, delete or reset</summary>
            ${sessions.length ? `<ul class="sessions">${sessions.map((t) => `<li>
              <button class="link" data-action="editSession" data-id="${esc(p.id)}" data-i="${t.i}">
                <span>${fmtDate(isoOf(new Date(t.start)))}${t.manual ? " · added by hand" : ` · ${fmtTime(t.start)}–${t.end ? fmtTime(t.end) : "now"}`}</span>
                <b>${t.end ? fmtDur(t.end - t.start) : "running"}</b>
              </button>
              <button class="del-x" data-action="delSession" data-id="${esc(p.id)}" data-i="${t.i}" aria-label="Delete this entry">×</button></li>`).join("")}</ul>` : `<p class="muted small">No time recorded yet.</p>`}
            <div class="timer-tools">
              <button class="btn ghost small" data-action="addTime" data-id="${esc(p.id)}">＋ Add time by hand</button>
              ${p.sessions.length ? `<button class="btn ghost small danger" data-action="resetTimer" data-id="${esc(p.id)}">↺ Reset timer</button>` : ""}
            </div>
          </details>
        </section>`}

        <section class="card">
          <h3>Details</h3>
          <dl>
            ${row("Code", esc(p.code))}
            ${p.datesUnknown ? "" : `${row("Started", fmtDate(p.start))}
            ${row("Completed", fmtDate(p.end))}
            ${row("Days start→finish", p.start && p.end ? String(daysBetween(p.start, p.end) + 1) : "")}`}
            ${p.timeUnknown ? "" : row("Time spent", ms ? fmtDur(ms) : "")}
            ${row("Purpose", esc(p.purpose))}
            ${row("Materials", esc(p.materials.join(", ")))}
            ${row("Finish", esc(p.finishes.join(", ")))}
            ${row("Size", esc(p.dimensions))}
            ${row("Materials cost", cost != null ? money(cost) : "")}
          </dl>
          ${p.description ? `<h4>Description</h4><p class="prose">${esc(p.description)}</p>` : ""}
          ${p.notes ? `<h4>Notes</h4><p class="prose">${esc(p.notes)}</p>` : ""}
          ${!p.description && !p.materials.length && !p.finishes.length && !p.purpose ? `<p class="muted small">Tap ✎ at the top to add a description, purpose, materials and finish.</p>` : ""}
        </section>

        <section class="card">
          <div class="card-head"><h3>Photos <span class="muted">${p.photos.length || ""}</span></h3>${mediaBtns(p.id, "photo")}</div>
          ${p.photos.length ? `<div class="grid">${p.photos.map((m, i) =>
            `<button class="gimg" data-action="photo" data-id="${esc(p.id)}" data-i="${i}"><img alt="" loading="lazy" ${mediaAttr(m)}></button>`).join("")}</div>`
            : `<p class="muted small">No photos yet — add progress shots as you go.</p>`}
        </section>

        <section class="card">
          <div class="card-head"><h3>Videos <span class="muted">${p.videos.length || ""}</span></h3>${mediaBtns(p.id, "video")}</div>
          ${p.videos.length ? p.videos.map((m) => { const tr = p.trims[m]; return `<div class="vid">
              <video controls playsinline preload="metadata" ${mediaAttr(m)}${tr ? ` data-start="${tr.start}" data-end="${tr.end}"` : ""}></video>
              ${tr ? `<p class="muted small">Trimmed to ${fmtSecs(tr.start)}–${fmtSecs(tr.end)}</p>` : ""}
              <div class="vid-tools">
                <button class="link small" data-action="trimVideo" data-id="${esc(p.id)}" data-m="${esc(m)}">✂︎ Trim</button>
                <button class="link small" data-action="saveOne" data-id="${esc(p.id)}" data-m="${esc(m)}">⬇ Save to camera roll</button>
                <button class="link danger small" data-action="delVideo" data-id="${esc(p.id)}" data-m="${esc(m)}">Remove</button>
              </div>
            </div>`; }).join("") : `<p class="muted small">No videos yet.</p>`}
        </section>

        ${p.status === "Gifted" || Object.values(p.gift).some(Boolean) ? `<section class="card">
          <h3>Gift</h3>
          ${Object.values(p.gift).some(Boolean) ? `<dl>
            ${row("Given to", esc(p.gift.to))}
            ${row("Date given", fmtDate(p.gift.date))}
            ${row("Occasion", esc(p.gift.occasion))}
          </dl>${p.gift.notes ? `<p class="prose">${esc(p.gift.notes)}</p>` : ""}`
          : `<p class="muted small">Tap ✎ at the top to add who it was for.</p>`}
        </section>` : ""}

        ${p.status === "Kept" || Object.values(p.kept).some(Boolean) ? `<section class="card">
          <h3>Kept</h3>
          ${Object.values(p.kept).some(Boolean) ? `<dl>${row("Where / who uses it", esc(p.kept.where))}</dl>
          ${p.kept.notes ? `<p class="prose">${esc(p.kept.notes)}</p>` : ""}`
          : `<p class="muted small">Tap ✎ at the top to note where it lives.</p>`}
        </section>` : ""}

        ${["For sale", "Sold"].includes(p.status) || hasSale ? `<section class="card">
          <h3>Sale details</h3>
          ${hasSale ? `<dl>
            ${row("Asking price", num(sale.asking) != null ? money(num(sale.asking)) : esc(sale.asking))}
            ${row("Sold for", price != null ? money(price) : "")}
            ${row("Date sold", fmtDate(sale.date))}
            ${row("Buyer", esc(sale.buyer))}
            ${row(p.status === "For sale" ? "Listed on" : "Sold via", esc(sale.where))}
            ${row("Profit", profit != null && cost != null ? money(profit) : "")}
            ${row("Per hour", profit != null && hours >= 0.1 ? money(profit / hours) + "/h" : "")}
          </dl>${sale.notes ? `<p class="prose">${esc(sale.notes)}</p>` : ""}`
          : `<p class="muted small">Tap ✎ at the top to add the price and sale details.</p>`}
        </section>` : ""}

        <div class="row-actions">
          <button class="btn ghost danger block" data-action="delProject" data-id="${esc(p.id)}">Delete project</button>
        </div>`;
    },
  };

  // Ways to order a workshop's list. Ties fall back to newest added first.
  const byText = (x, y) => x.localeCompare(y, "en", { numeric: true, sensitivity: "base" });
  const blankLast = (x, y, cmp) => (!x && !y ? 0 : !x ? 1 : !y ? -1 : cmp(x, y));
  const SORTS = {
    added: { label: "Newest added", by: (a, b) => b.created - a.created },
    codeDesc: { label: "Code (newest)", by: (a, b) => blankLast(a.code, b.code, (x, y) => byText(y, x)) },
    codeAsc: { label: "Code (oldest)", by: (a, b) => blankLast(a.code, b.code, byText) },
    doneDesc: { label: "Completed (newest)", by: (a, b) => blankLast(a.datesUnknown ? "" : a.end, b.datesUnknown ? "" : b.end, (x, y) => byText(y, x)) },
    doneAsc: { label: "Completed (oldest)", by: (a, b) => blankLast(a.datesUnknown ? "" : a.end, b.datesUnknown ? "" : b.end, byText) },
    name: { label: "Name A–Z", by: (a, b) => byText(a.name, b.name) },
    material: { label: "Material A–Z", by: (a, b) => blankLast(a.materials[0], b.materials[0], byText) },
    status: { label: "Status", by: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) },
    updated: { label: "Recently updated", by: (a, b) => b.updated - a.updated },
  };
  function listHTML() {
    const q = ui.q.trim().toLowerCase();
    const list = (ui.line === "All" ? state.projects : ofLine(ui.line))
      .filter((p) => ui.status === "All" || p.status === ui.status)
      .filter((p) => !q || [p.name, p.code, p.materials.join(" "), p.finishes.join(" "), p.description, p.purpose, p.sale.buyer, p.gift.to, p.gift.occasion, p.notes]
        .some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => (SORTS[state.settings.sort] || SORTS.added).by(a, b) || b.created - a.created);
    return list.length ? list.map(card).join("") : `<p class="empty">No matching projects.</p>`;
  }

  function render() {
    const r = route();
    document.body.dataset.line = r.line || "";
    $("#back").hidden = r.name === "home";
    // On a project page the top-right button edits the project; elsewhere it opens settings.
    $("#editBtn").hidden = r.name !== "project";
    $("#editBtn").dataset.id = r.id || "";
    $("#settingsBtn").hidden = r.name !== "list";
    $("#title").textContent = r.name === "home" ? "JT Creations" : r.name === "list" ? "Projects" : find(r.id).code || find(r.id).name;
    view.innerHTML = views[r.name](r);
    hydrate();
  }

  // ---------- modals ----------
  // The page behind an open dialog is pinned in place so a swipe only ever scrolls the dialog.
  let lockedY = null;
  function lockPage() {
    if (lockedY != null) return;
    lockedY = window.scrollY;
    Object.assign(document.body.style, { position: "fixed", top: `-${lockedY}px`, left: "0", right: "0" });
  }
  function unlockPage() {
    if (lockedY == null) return;
    Object.assign(document.body.style, { position: "", top: "", left: "", right: "" });
    window.scrollTo(0, lockedY);
    lockedY = null;
  }
  // sheet: a full-height panel on phones, for long forms.
  function openModal(html, { sheet = false } = {}) {
    modal.classList.toggle("sheet", sheet);
    // autofocus on the wrapper stops the dialog focusing the first field, which pops the keyboard up.
    modal.innerHTML = `<div class="modal-in" tabindex="-1" autofocus>${html}</div>`;
    lockPage();
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
    const body = modal.querySelector(".sheet-body");
    if (body) body.scrollTop = 0;
    modal.querySelector(".modal-in").focus({ preventScroll: true });
    hydrate();
  }
  const sheetHead = (title) => `<div class="sheet-head">
      <h2>${title}</h2>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
    </div>`;
  function closeModal() { if (modal.open) modal.close(); modal.innerHTML = ""; }
  // Closing the project form throws away photos/videos added in it, so check first.
  function cancelModal() {
    if (draft && draft.added.length && !confirm(`Discard the ${draft.added.length} photo/video${draft.added.length > 1 ? "s" : ""} you added?`)) return;
    closeModal();
  }

  const DONE_FOR = DONE.join("|");
  function projectForm(p, line) {
    const isNew = !p;
    const d = p || { name: "", code: nextCode(line, new Date().getFullYear()), status: "In progress",
      start: todayISO(), end: "", purpose: "", description: "", materials: [], finishes: [], dimensions: "", cost: "", notes: "",
      sale: {}, gift: {}, kept: {} };
    const s = d.sale, g = d.gift, k = d.kept;
    const v = (x) => `value="${esc(x || "")}"`;
    // The completed date follows the start date until it's changed by hand.
    const endFollows = !d.end || d.end === d.start;
    return `<form data-form="project" data-id="${isNew ? "" : esc(p.id)}" data-line="${line}" class="form" novalidate>
      ${sheetHead(isNew ? "New project" : "Edit " + esc(d.code || "project"))}
      <div class="sheet-body">
      ${isNew ? `<div class="seg" role="radiogroup" aria-label="Workshop">${Object.keys(LINES).map((k) =>
        `<label class="seg-opt seg-${k}"><input type="radio" name="line" value="${k}"${k === line ? " checked" : ""}><span>${LINES[k].emoji} ${esc(LINES[k].name)}</span></label>`).join("")}</div>`
        : `<p class="muted">${LINES[line].emoji} ${esc(LINES[line].name)}</p>`}
      <label>Name<input name="name" ${v(d.name)} placeholder="e.g. Jarrah cutting board" enterkeyhint="next"></label>
      <div class="two">
        <label>Code<input name="code" ${v(d.code)} data-auto="${isNew ? 1 : 0}" autocapitalize="characters"></label>
        <label>Status<select name="status">${STATUSES.map((x) => `<option${x === d.status ? " selected" : ""}>${x}</option>`).join("")}</select></label>
      </div>
      ${isNew ? `<p class="hint">Code is filled in automatically: <span id="codePrefix">${esc(state.settings.prefixes[line])}</span> + year + item number. You can change it.</p>` : ""}
      <div class="two dates">
        <label>Start date<input type="date" name="start" ${v(d.start)}${d.datesUnknown ? " disabled" : ""}></label>
        <label data-for="${DONE_FOR}">Completed<input type="date" name="end" ${v(endFollows ? d.start : d.end)} data-auto="${endFollows ? 1 : 0}"${d.datesUnknown ? " disabled" : ""}></label>
      </div>
      <label class="check"><input type="checkbox" name="datesUnknown"${d.datesUnknown ? " checked" : ""}> Dates unknown</label>
      <label>Purpose<input name="purpose" list="purposes" ${v(d.purpose)} placeholder="Who or what is it for?"></label>
      <datalist id="purposes">${PURPOSES.map((x) => `<option value="${x}">`).join("")}</datalist>
      <label>Description<textarea name="description" rows="3">${esc(d.description)}</textarea></label>

      <fieldset><legend>Materials, finish &amp; build</legend>
        ${pickField("materials", line, d.materials)}
        ${pickField("finishes", line, d.finishes)}
        <div class="two">
          <label>Size<input name="dimensions" ${v(d.dimensions)} placeholder="e.g. 40 × 25 × 2 cm"></label>
          <label>Materials cost ($)<input name="cost" inputmode="decimal" ${v(d.cost)}></label>
        </div>
      </fieldset>

      <fieldset><legend>Time</legend>
        <p class="hint">${isNew ? "Use the ▶ timer on the project page while you work, or add time you've already spent here."
          : `Recorded so far: <b>${fmtDur(totalMs(p))}</b>. Add more here, or use the ▶ timer on the project page.`}</p>
        <div class="two">
          <label>Add hours<input type="number" name="addH" min="0" step="1" inputmode="numeric" placeholder="0"></label>
          <label>Add minutes<input type="number" name="addM" min="0" max="59" step="1" inputmode="numeric" placeholder="0"></label>
        </div>
        <label class="check"><input type="checkbox" name="timeUnknown"${d.timeUnknown ? " checked" : ""}> Time taken unknown</label>
      </fieldset>

      <fieldset><legend>Photos</legend>
        <div id="draftPhotos">${draftMediaHTML("photo")}</div>
        ${mediaBtns("draft", "photo")}
      </fieldset>
      <fieldset><legend>Videos</legend>
        <div id="draftVideos">${draftMediaHTML("video")}</div>
        ${mediaBtns("draft", "video")}
      </fieldset>

      <fieldset data-for="For sale|Sold"><legend>Sale details</legend>
        <div class="two">
          <label>Asking price ($)<input name="asking" inputmode="decimal" ${v(s.asking)}></label>
          <label data-for="Sold">Sold for ($)<input name="price" inputmode="decimal" ${v(s.price)}></label>
        </div>
        <div class="two" data-for="Sold">
          <label>Date sold<input type="date" name="soldDate" ${v(s.date)}></label>
          <label>Buyer<input name="buyer" ${v(s.buyer)}></label>
        </div>
        <label><span data-for="Sold">Sold via</span><span data-for="For sale">Listed on</span><input name="where" ${v(s.where)} placeholder="Market stall, Instagram, Etsy, word of mouth…"></label>
        <label>Sale notes<textarea name="saleNotes" rows="2">${esc(s.notes)}</textarea></label>
      </fieldset>
      <fieldset data-for="Gifted"><legend>Gift details</legend>
        <div class="two">
          <label>Given to<input name="giftTo" ${v(g.to)}></label>
          <label>Date given<input type="date" name="giftDate" ${v(g.date)}></label>
        </div>
        <label>Occasion<input name="giftOccasion" ${v(g.occasion)} placeholder="Birthday, Christmas, wedding…"></label>
        <label>Gift notes<textarea name="giftNotes" rows="2">${esc(g.notes)}</textarea></label>
      </fieldset>
      <fieldset data-for="Kept"><legend>Keeping it</legend>
        <label>Where it lives / who uses it<input name="keptWhere" ${v(k.where)} placeholder="e.g. Kitchen bench, my everyday wallet"></label>
        <label>Notes<textarea name="keptNotes" rows="2">${esc(k.notes)}</textarea></label>
      </fieldset>

      <label>Other notes<textarea name="notes" rows="3">${esc(d.notes)}</textarea></label>
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-action="close">Cancel</button>
        <button class="btn">Save</button>
      </div>
    </form>`;
  }
  // Show only the fields that fit the chosen status (sale details for Sold, gift details for Gifted…).
  function applyStatus(f) {
    const st = f.querySelector("[name=status]").value;
    for (const el of f.querySelectorAll("[data-for]")) el.hidden = !el.dataset.for.split("|").includes(st);
  }
  function openProjectForm(p, line) {
    draft = { photos: p ? [...p.photos] : [], videos: p ? [...p.videos] : [], added: [], removed: [] };
    document.body.dataset.line = line;
    openModal(projectForm(p, line), { sheet: true });
    applyStatus(modal.querySelector("form"));
  }
  function mediaBtns(id, kind) {
    return `<div class="media-btns">${kind === "photo"
      ? `<button type="button" class="btn small" data-action="pickPhotos" data-id="${esc(id)}">＋ Add photo</button>`
      : `<button type="button" class="btn small" data-action="pickVideos" data-id="${esc(id)}">＋ Add video</button>`}</div>`;
  }
  function draftMediaHTML(kind) {
    const list = kind === "photo" ? draft.photos : draft.videos;
    if (!list.length) return `<p class="muted small">No ${kind}s yet.</p>`;
    return `<div class="fm-grid">${list.map((id, i) => `<div class="fm${kind === "video" ? " fm-vid" : ""}">
      ${kind === "photo" ? `<img alt="" ${mediaAttr(id)}>` : `<video muted playsinline preload="metadata" ${mediaAttr(id)}></video>`}
      ${kind === "photo" && i === 0 ? `<span class="fm-tag">Cover</span>` : ""}
      <button type="button" class="fm-x" data-action="draftRemove" data-kind="${kind}" data-m="${esc(id)}" aria-label="Remove">×</button>
    </div>`).join("")}</div>`;
  }
  function renderDraftMedia() {
    if (!draft) return;
    const ph = $("#draftPhotos"), vi = $("#draftVideos");
    if (ph) ph.innerHTML = draftMediaHTML("photo");
    if (vi) vi.innerHTML = draftMediaHTML("video");
    hydrate();
  }

  function pickField(kind, line, selected) {
    const all = [...state.settings[kind][line]];
    for (const m of selected) if (!hasItem(all, m)) all.push(m);
    const used = state.settings.used[kind][line], when = (m) => used[m.toLowerCase()] || 0;
    all.sort((a, b) => when(b) - when(a));
    // Only the 5 most recently used (plus anything already ticked) show up front; the rest are found by searching.
    let top = 0;
    const chips = all.map((m) => {
      const on = hasItem(selected, m), isTop = !on && top < PICK_SHOWN && ++top;
      return matChip(m, on, !on && !isTop);
    });
    return `<div class="mat-field">
      <span class="label">${PICKS[kind].label} <small>tap to select</small></span>
      <div class="mats" data-kind="${kind}">${chips.join("")}</div>
      <div class="mat-add">
        <input class="opt-new" type="search" data-kind="${kind}" placeholder="Search or add a ${PICKS[kind].one}…" autocomplete="off" enterkeyhint="done">
        <button type="button" class="btn small" data-action="addOpt" data-kind="${kind}" hidden>Add</button>
      </div>
    </div>`;
  }
  const PICK_SHOWN = 5;
  const matChip = (m, on, hidden = false) =>
    `<button type="button" class="mat${on ? " on" : ""}${hidden ? "" : " pick-top"}" data-action="toggleMat" data-v="${esc(m)}" aria-pressed="${on}"${hidden ? " hidden" : ""}>${esc(m)}</button>`;
  // Show ticked + top choices when the search box is empty, otherwise ticked + matches, and offer to add what was typed.
  function refreshPick(field) {
    const input = field.querySelector(".opt-new"), add = field.querySelector("[data-action=addOpt]");
    const v = input.value.trim().replace(/\s+/g, " "), q = v.toLowerCase();
    let exact = false, shown = 0;
    for (const chip of field.querySelectorAll(".mat")) {
      const name = chip.dataset.v.toLowerCase();
      if (name === q) exact = true;
      chip.hidden = !(chip.classList.contains("on") || (q ? name.includes(q) : chip.classList.contains("pick-top")));
      if (!chip.hidden) shown++;
    }
    field.querySelector(".mats").hidden = !shown;
    add.hidden = !v || exact;
    add.textContent = `＋ Add “${v}”`;
  }

  function sessionForm(p, i) {
    const t = p.sessions[i];
    return `<form data-form="session" data-id="${esc(p.id)}" data-i="${i}" class="form">
      <h2>Edit time</h2>
      <label>Started<input type="datetime-local" name="start" required value="${localDT(t.start)}"></label>
      <label>Stopped<input type="datetime-local" name="end" value="${t.end ? localDT(t.end) : ""}"></label>
      ${t.end ? "" : `<p class="hint">Still running. Leave “Stopped” blank to keep it going.</p>`}
      <div class="actions">
        <button type="button" class="btn ghost danger" data-action="delSession" data-id="${esc(p.id)}" data-i="${i}">Delete</button>
        <button type="button" class="btn ghost" data-action="close">Cancel</button>
        <button class="btn">Save</button>
      </div>
    </form>`;
  }

  function addTimeForm(p) {
    return `<form data-form="addTime" data-id="${esc(p.id)}" class="form">
      <h2>Add time</h2>
      <p class="hint">Forgot to start the timer? Add the time you spent here.</p>
      <label>Date<input type="date" name="date" required value="${todayISO()}"></label>
      <div class="two">
        <label>Hours<input type="number" name="h" min="0" step="1" inputmode="numeric" placeholder="0"></label>
        <label>Minutes<input type="number" name="m" min="0" max="59" step="1" inputmode="numeric" placeholder="0"></label>
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-action="close">Cancel</button>
        <button class="btn">Add</button>
      </div>
    </form>`;
  }

  function photoViewer(p, i) {
    const n = p.photos.length;
    return `<div class="viewer">
      <img alt="" ${mediaAttr(p.photos[i])}>
      <div class="viewer-bar">
        <button class="btn ghost small" data-action="photo" data-id="${esc(p.id)}" data-i="${(i - 1 + n) % n}" ${n < 2 ? "disabled" : ""}>‹</button>
        <span class="muted small">${i + 1} of ${n}${i === 0 ? " · cover" : ""}</span>
        <button class="btn ghost small" data-action="photo" data-id="${esc(p.id)}" data-i="${(i + 1) % n}" ${n < 2 ? "disabled" : ""}>›</button>
      </div>
      <div class="actions">
        <button class="btn ghost danger" data-action="delPhoto" data-id="${esc(p.id)}" data-i="${i}">Delete</button>
        ${i > 0 ? `<button class="btn ghost" data-action="cover" data-id="${esc(p.id)}" data-i="${i}">Make cover</button>` : ""}
        <button class="btn ghost" data-action="saveOne" data-id="${esc(p.id)}" data-m="${esc(p.photos[i])}">Save to camera roll</button>
        <button class="btn ghost" data-action="editPhoto" data-id="${esc(p.id)}" data-i="${i}">✂︎ Edit</button>
        <button class="btn" data-action="close">Close</button>
      </div>
    </div>`;
  }

  // ---------- photo editor (rotate + crop) & video trim ----------
  const fmtSecs = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
  const RATIOS = { free: ["Free", 0], square: ["Square", 1], land: ["4:3", 4 / 3], port: ["3:4", 3 / 4] };
  let ed = null; // { p, i, id, img, rot, crop: {x,y,w,h} as fractions of the rotated image, ratio }
  const edSize = () => (ed.rot % 2 ? [ed.img.naturalHeight, ed.img.naturalWidth] : [ed.img.naturalWidth, ed.img.naturalHeight]);
  function drawRotated(ctx, scale) {
    const [W, H] = edSize(), iw = ed.img.naturalWidth, ih = ed.img.naturalHeight;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(W / 2, H / 2);
    ctx.rotate((ed.rot * Math.PI) / 2);
    ctx.drawImage(ed.img, -iw / 2, -ih / 2);
    ctx.restore();
  }
  // Largest centred box of the chosen shape (or the whole photo for Free).
  function fitCrop() {
    const [W, H] = edSize(), r = RATIOS[ed.ratio][1];
    if (!r) return (ed.crop = { x: 0, y: 0, w: 1, h: 1 });
    let w = W, h = W / r;
    if (h > H) { h = H; w = H * r; }
    ed.crop = { x: (1 - w / W) / 2, y: (1 - h / H) / 2, w: w / W, h: h / H };
  }
  async function openPhotoEditor(p, i) {
    const id = p.photos[i], url = await mediaURL(id);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { return toast("Couldn't open this photo"); }
    ed = { p, i, id, img, rot: 0, ratio: "free" };
    fitCrop();
    openModal(`<div class="form">
      ${sheetHead("Edit photo")}
      <div class="sheet-body">
        <div class="ed-stage" id="edStage"><canvas id="edCanvas"></canvas><div class="crop" id="edCrop">
          ${["nw", "ne", "sw", "se"].map((c) => `<span class="h h-${c}" data-c="${c}"></span>`).join("")}</div></div>
        <div class="ed-tools">
          <button type="button" class="btn small ghost" data-action="edRotate" data-d="-1">⟲ Rotate</button>
          <button type="button" class="btn small ghost" data-action="edRotate" data-d="1">⟳ Rotate</button>
          <button type="button" class="btn small ghost" data-action="edReset">Reset</button>
        </div>
        <div class="chips ed-ratios">${Object.entries(RATIOS).map(([k, [label]]) =>
          `<button type="button" class="chip${k === "free" ? " on" : ""}" data-action="edRatio" data-r="${k}">${label}</button>`).join("")}</div>
        <p class="hint">Drag the box to move it, or its corners to resize. Saving replaces the photo.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-action="photo" data-id="${esc(p.id)}" data-i="${i}">Cancel</button>
        <button type="button" class="btn" data-action="edSave">Save</button>
      </div>
    </div>`, { sheet: true });
    drawEditor();
  }
  function drawEditor() {
    const stage = $("#edStage"), c = $("#edCanvas");
    if (!stage || !ed) return;
    const [W, H] = edSize();
    const scale = Math.min(stage.clientWidth / W, (window.innerHeight * 0.55) / H);
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    drawRotated(c.getContext("2d"), scale);
    stage.style.height = c.height + "px";
    placeCrop();
  }
  function placeCrop() {
    const c = $("#edCanvas"), box = $("#edCrop"), k = ed.crop;
    Object.assign(box.style, { left: c.offsetLeft + k.x * c.width + "px", top: c.offsetTop + k.y * c.height + "px",
      width: k.w * c.width + "px", height: k.h * c.height + "px" });
  }
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const box = e.target.closest && e.target.closest("#edCrop");
    if (!box || !ed) return;
    e.preventDefault();
    const c = $("#edCanvas");
    drag = { corner: e.target.dataset.c || "", x: e.clientX, y: e.clientY, start: { ...ed.crop }, cw: c.width, ch: c.height };
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || !ed) return;
    const dx = (e.clientX - drag.x) / drag.cw, dy = (e.clientY - drag.y) / drag.ch, s0 = drag.start, MIN = 0.08;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let { x, y, w, h } = s0;
    if (!drag.corner) {
      x = clamp(s0.x + dx, 0, 1 - s0.w);
      y = clamp(s0.y + dy, 0, 1 - s0.h);
    } else {
      const left = drag.corner.includes("w"), top = drag.corner.includes("n");
      w = clamp(left ? s0.w - dx : s0.w + dx, MIN, left ? s0.x + s0.w : 1 - s0.x);
      h = clamp(top ? s0.h - dy : s0.h + dy, MIN, top ? s0.y + s0.h : 1 - s0.y);
      const r = RATIOS[ed.ratio][1];
      if (r) {
        // Keep the chosen shape: fit the height to the width, shrinking both if it runs off the photo.
        const [W, H] = edSize(), maxH = top ? s0.y + s0.h : 1 - s0.y, maxW = left ? s0.x + s0.w : 1 - s0.x;
        h = (w * W) / r / H;
        if (h > maxH) { h = maxH; w = (h * H * r) / W; }
        if (w > maxW) { w = maxW; h = (w * W) / r / H; }
      }
      x = left ? s0.x + s0.w - w : s0.x;
      y = top ? s0.y + s0.h - h : s0.y;
    }
    ed.crop = { x, y, w, h };
    placeCrop();
  });
  document.addEventListener("pointerup", () => { drag = null; });
  document.addEventListener("pointercancel", () => { drag = null; });
  window.addEventListener("resize", () => { if (ed && $("#edStage")) drawEditor(); });
  async function saveEditedPhoto() {
    const [W, H] = edSize(), k = ed.crop;
    const scale = Math.min(1, 2400 / Math.max(k.w * W, k.h * H));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(k.w * W * scale));
    c.height = Math.max(1, Math.round(k.h * H * scale));
    const ctx = c.getContext("2d");
    ctx.scale(scale, scale);
    ctx.translate(-k.x * W, -k.y * H);
    drawRotated(ctx, 1);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return toast("Couldn't save the photo");
    const { p, i, id } = ed;
    const old = await media.get(id);
    await media.put({ ...(old || { id, kind: "photo", name: "photo.jpg", created: Date.now() }), type: "image/jpeg", blob });
    forgetURL(id);
    p.updated = Date.now();
    save();
    ed = null;
    render();
    openModal(photoViewer(p, i));
    toast("Photo saved");
  }

  function trimHTML(p, id) {
    const tr = p.trims[id];
    return `<div class="form">
      ${sheetHead("Trim video")}
      <div class="sheet-body">
        <video id="trimVideo" controls playsinline preload="auto" ${mediaAttr(id)}></video>
        <div class="trim-row"><label>Start <b id="trimStartLbl"></b><input type="range" id="trimStart" min="0" max="1" step="0.1" value="0" data-v="${tr ? tr.start : 0}"></label></div>
        <div class="trim-row"><label>End <b id="trimEndLbl"></b><input type="range" id="trimEnd" min="0" max="1" step="0.1" value="1" data-v="${tr ? tr.end : ""}"></label></div>
        <div class="ed-tools">
          <button type="button" class="btn small ghost" data-action="trimHere" data-which="start">Start here</button>
          <button type="button" class="btn small ghost" data-action="trimHere" data-which="end">End here</button>
          <button type="button" class="btn small ghost" data-action="trimPlay">▶ Play trimmed part</button>
        </div>
        <p class="hint">The app will only play between these points. The original video is kept, so you can change this later, and "Save to camera roll" saves the full video.</p>
      </div>
      <div class="actions">
        ${tr ? `<button type="button" class="btn ghost danger" data-action="trimClear" data-id="${esc(p.id)}" data-m="${esc(id)}">Remove trim</button>` : ""}
        <button type="button" class="btn ghost" data-action="close">Cancel</button>
        <button type="button" class="btn" data-action="trimSave" data-id="${esc(p.id)}" data-m="${esc(id)}">Save</button>
      </div>
    </div>`;
  }
  function trimSync() {
    const v = $("#trimVideo"), s = $("#trimStart"), e = $("#trimEnd");
    if (!v || !s) return;
    $("#trimStartLbl").textContent = fmtSecs(Number(s.value));
    $("#trimEndLbl").textContent = fmtSecs(Number(e.value));
  }
  function trimReady() {
    const v = $("#trimVideo"), s = $("#trimStart"), e = $("#trimEnd");
    if (!v || !s || !Number.isFinite(v.duration)) return;
    const d = Math.floor(v.duration * 10) / 10;
    s.max = e.max = d;
    // Saved points can only be applied once the slider knows the video's length.
    if (s.dataset.v != null) { s.value = Math.min(Number(s.dataset.v) || 0, d); delete s.dataset.v; }
    if (e.dataset.v != null) { e.value = e.dataset.v ? Math.min(Number(e.dataset.v), d) : d; delete e.dataset.v; }
    trimSync();
  }
  // Videos with data-start/data-end only play between those points.
  document.addEventListener("play", (e) => {
    const v = e.target, st = Number(v.dataset.start), en = Number(v.dataset.end);
    if (v.tagName === "VIDEO" && v.dataset.end && (v.currentTime < st || v.currentTime >= en - 0.05)) v.currentTime = st;
  }, true);
  document.addEventListener("timeupdate", (e) => {
    const v = e.target;
    if (v.tagName === "VIDEO" && v.dataset.end && v.currentTime >= Number(v.dataset.end)) { v.pause(); v.currentTime = Number(v.dataset.start); }
  }, true);
  document.addEventListener("loadedmetadata", (e) => {
    const v = e.target;
    if (v.id === "trimVideo") trimReady();
    else if (v.tagName === "VIDEO" && v.dataset.start) v.currentTime = Number(v.dataset.start);
  }, true);

  function settingsHTML() {
    const pre = state.settings.prefixes;
    return `<form data-form="settings" class="form">
      ${sheetHead("Settings")}
      <div class="sheet-body">
      <fieldset><legend>Project codes</legend>
        <div class="two">
          <label>Wood Talking<input name="wood" value="${esc(pre.wood)}" autocapitalize="characters" required></label>
          <label>Craft &amp; Carry<input name="leather" value="${esc(pre.leather)}" autocapitalize="characters" required></label>
        </div>
        <p class="hint">Codes are prefix + 2-digit year + item number, e.g. ${esc(pre.wood)}2601. Changing a prefix only affects new projects.</p>
        <button class="btn small">Save codes</button>
        <p class="hint">Renumber every project so each year's codes run in the order pieces were completed (the first piece finished in 2026 becomes ${esc(pre.wood)}2601). You'll see the changes before anything is saved.</p>
        <button type="button" class="btn small ghost" data-action="renumber">Renumber codes by completion date…</button>
      </fieldset>
      <fieldset><legend>Backup</legend>
        <p class="hint">Everything is stored only on this device. Download a backup now and then so nothing is lost if the phone is replaced.</p>
        <label class="check"><input type="checkbox" id="withVideos"> Include videos (the file can get very large)</label>
        <div class="stack">
          <button type="button" class="btn ghost" data-action="exportBackup">⬇ Download backup</button>
          <button type="button" class="btn ghost" data-action="importBackup">⬆ Restore from backup</button>
          <button type="button" class="btn ghost" data-action="exportCSV">⬇ Spreadsheet of all projects (CSV)</button>
        </div>
        <p class="hint" id="storageInfo"></p>
      </fieldset>
      ${Object.keys(LINES).flatMap((line) => Object.keys(PICKS).map((kind) => `<fieldset>
        <legend>${esc(LINES[line].name)}: ${PICKS[kind].label.toLowerCase()} choices</legend>
        <p class="hint">Tap × to remove a choice from the list. Projects that already use it keep it.</p>
        <div class="mats">${state.settings[kind][line].map((m) =>
          `<button type="button" class="mat on" data-action="removeOpt" data-kind="${kind}" data-line="${line}" data-v="${esc(m)}">${esc(m)} ×</button>`).join("")
          || `<span class="muted small">Nothing in the list.</span>`}</div>
      </fieldset>`)).join("")}
      </div>
      <div class="actions"><button type="button" class="btn" data-action="close">Done</button></div>
    </form>`;
  }

  // ---------- renumbering ----------
  // Each workshop and year counts up from 01: finished pieces in completion order, then unfinished ones
  // by start date, then undated ones (which keep the year from their current code).
  function renumberPlan() {
    const changes = [];
    for (const line of Object.keys(LINES)) {
      const prefix = state.settings.prefixes[line], years = new Map();
      for (const p of ofLine(line)) {
        const date = !p.datesUnknown && (p.end || p.start);
        const m = p.code.match(/(\d{2})\d{2,}$/);
        const year = date ? Number(date.slice(0, 4)) : m ? 2000 + Number(m[1]) : new Date(p.created).getFullYear();
        const rank = date ? (p.end ? 0 : 1) : 2;
        if (!years.has(year)) years.set(year, []);
        years.get(year).push({ p, rank, key: date || "" });
      }
      for (const [year, list] of years) {
        list.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key) || byText(a.p.code, b.p.code) || a.p.created - b.p.created);
        list.forEach(({ p }, i) => {
          const code = prefix + String(year).slice(-2) + pad(i + 1);
          if (code !== p.code) changes.push({ p, from: p.code, to: code });
        });
      }
    }
    return changes;
  }
  function renumberHTML(changes) {
    return `<div class="form">
      ${sheetHead("Renumber codes")}
      <div class="sheet-body">
        ${changes.length ? `<p>${changes.length} project code${changes.length > 1 ? "s" : ""} will change:</p>
          <ul class="renumber">${changes.map((c) => `<li><span class="code">${esc(c.from || "none")}</span> → <span class="code">${esc(c.to)}</span> <span class="muted">${esc(c.p.name)}</span></li>`).join("")}</ul>
          <p class="hint">If you've already written codes on any pieces, check this list first. Downloading a backup beforehand lets you undo it.</p>`
          : `<p>All codes are already in completion order. Nothing to change.</p>`}
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-action="settings">Back</button>
        ${changes.length ? `<button type="button" class="btn" data-action="applyRenumber">Renumber</button>` : ""}
      </div>
    </div>`;
  }

  // ---------- backup ----------
  async function exportBackup(withVideos) {
    toast("Preparing backup…");
    const recs = await media.all();
    const out = { app: "jt-creations", version: 1, exported: new Date().toISOString(), data: state, media: [] };
    for (const r of recs) {
      if (r.kind === "video" && !withVideos) continue;
      out.media.push({ id: r.id, kind: r.kind, type: r.type, name: r.name, created: r.created, data: await blobToDataURL(r.blob) });
    }
    download(new Blob([JSON.stringify(out)], { type: "application/json" }), `jt-creations-backup-${todayISO()}.json`);
  }
  async function importBackup(file) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { return toast("That file isn't a JT Creations backup"); }
    const data = obj && (obj.data || obj);
    if (!data || !Array.isArray(data.projects)) return toast("That file isn't a JT Creations backup");
    if (!confirm(`Replace everything on this device with the backup (${data.projects.length} projects)?`)) return;
    toast("Restoring…");
    for (const m of Array.isArray(obj.media) ? obj.media : []) {
      try {
        const blob = await (await fetch(m.data)).blob();
        forgetURL(m.id);
        await media.put({ id: m.id, kind: m.kind, type: m.type, name: m.name, created: m.created, blob });
      } catch { /* skip a bad item */ }
    }
    state = normalize(data);
    save();
    // Drop stored media that no project refers to any more.
    const used = new Set(state.projects.flatMap((p) => [...p.photos, ...p.videos]));
    for (const k of await media.keys()) if (!used.has(k)) { forgetURL(k); await media.del(k).catch(() => {}); }
    closeModal();
    history.replaceState({ d: 0 }, "", "#/");
    render();
    toast("Backup restored");
  }
  function exportCSV() {
    const cols = [["Workshop", (p) => LINES[p.line].name], ["Code", (p) => p.code], ["Name", (p) => p.name],
      ["Status", (p) => p.status], ["Purpose", (p) => p.purpose], ["Start date", (p) => (p.datesUnknown ? "Unknown" : p.start)],
      ["Completion date", (p) => (p.datesUnknown ? "Unknown" : p.end)],
      ["Hours", (p) => (p.timeUnknown ? "Unknown" : (totalMs(p) / 36e5).toFixed(2))],
      ["Materials", (p) => p.materials.join("; ")], ["Finish", (p) => p.finishes.join("; ")], ["Size", (p) => p.dimensions], ["Materials cost", (p) => p.cost],
      ["Asking price", (p) => p.sale.asking], ["Sold for", (p) => p.sale.price], ["Date sold", (p) => p.sale.date],
      ["Buyer", (p) => p.sale.buyer], ["Sold via", (p) => p.sale.where],
      ["Gifted to", (p) => p.gift.to], ["Date given", (p) => p.gift.date], ["Occasion", (p) => p.gift.occasion],
      ["Kept (where / who)", (p) => p.kept.where], ["Photos", (p) => p.photos.length],
      ["Videos", (p) => p.videos.length], ["Description", (p) => p.description], ["Notes", (p) => p.notes]];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.map((c) => cell(c[0])).join(",")];
    const list = [...state.projects].sort((a, b) => a.line.localeCompare(b.line) || a.code.localeCompare(b.code));
    for (const p of list) rows.push(cols.map((c) => cell(c[1](p))).join(","));
    download(new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv" }), `jt-creations-${todayISO()}.csv`);
  }

  // ---------- actions ----------
  const pOf = (el) => find(el.dataset.id);
  const actions = {
    go: (el) => navigate(el.dataset.to),
    back: goBack,
    close: cancelModal,
    settings() {
      openModal(settingsHTML(), { sheet: true });
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(({ usage, quota }) => {
          const el = $("#storageInfo");
          if (el && quota) el.textContent = `Using ${(usage / 1e6).toFixed(1)} MB of about ${(quota / 1e9).toFixed(1)} GB available.`;
        }).catch(() => {});
      }
    },
    filter(el) { ui.status = el.dataset.status; render(); },
    // From a filtered list, a new project starts in that workshop; otherwise in the one used last.
    newProject: () => openProjectForm(null, route().name === "list" && ui.line !== "All" ? ui.line : state.settings.lastLine || "wood"),
    filterLine(el) { ui.line = el.dataset.line; render(); },
    // Shares the link only: projects live on this phone, so the other person starts with an empty app.
    shareApp() {
      const url = location.origin + location.pathname;
      if (navigator.share) {
        navigator.share({ title: "JT Creations", text: "JT Creations: a record of Wood Talking and Craft & Carry pieces.", url })
          .catch((e) => { if (e && e.name !== "AbortError") toast("Couldn't open the share menu"); });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast(url));
      } else toast(url);
    },
    openList(el) { ui.line = el.dataset.line; ui.status = "All"; ui.q = ""; navigate("#/list"); },
    edit: (el) => { const p = pOf(el); openProjectForm(p, p.line); },
    async delProject(el) {
      const p = pOf(el);
      if (!confirm(`Delete ${p.code || p.name}? Its photos, videos and time log will be deleted too.`)) return;
      for (const id of [...p.photos, ...p.videos]) { forgetURL(id); await media.del(id).catch(() => {}); }
      state.projects = state.projects.filter((x) => x !== p);
      save();
      history.replaceState({ d: 0 }, "", "#/list");
      render();
      toast("Project deleted");
    },
    timer(el) {
      const p = pOf(el), run = running(p);
      if (run) {
        run.end = Date.now();
        toast(`Stopped · ${fmtDur(run.end - run.start)} this session`);
      } else {
        p.sessions.push({ start: Date.now(), end: null, manual: false });
        if (p.status === "Idea") p.status = "In progress";
        if (!p.start && !p.datesUnknown) p.start = todayISO();
        toast("Timer started");
      }
      p.updated = Date.now();
      save();
      render();
    },
    addTime: (el) => openModal(addTimeForm(pOf(el))),
    editSession: (el) => openModal(sessionForm(pOf(el), Number(el.dataset.i))),
    delSession(el) {
      const p = pOf(el);
      if (!confirm("Delete this time entry?")) return;
      p.sessions.splice(Number(el.dataset.i), 1);
      p.updated = Date.now();
      save();
      closeModal();
      render();
    },
    resetTimer(el) {
      const p = pOf(el);
      if (!confirm(`Reset the timer for ${p.code || p.name}? All ${fmtDur(totalMs(p))} of recorded time will be deleted.`)) return;
      p.sessions = [];
      p.updated = Date.now();
      save();
      render();
      toast("Timer reset to zero");
    },
    toggleMat(el) {
      const on = !el.classList.contains("on");
      el.classList.toggle("on", on);
      el.setAttribute("aria-pressed", on);
      // Picking a search result clears the search, ready for the next one.
      const field = el.closest(".mat-field"), input = field && field.querySelector(".opt-new");
      if (input && input.value) { input.value = ""; refreshPick(field); }
    },
    addOpt(el) {
      const kind = el.dataset.kind, f = el.closest("form");
      const input = f.querySelector(`.opt-new[data-kind="${kind}"]`), v = input.value.trim().replace(/\s+/g, " ");
      if (!v) return input.focus();
      addOption(kind, f.dataset.line, v);
      save();
      const box = f.querySelector(`.mats[data-kind="${kind}"]`);
      let chip = [...box.querySelectorAll(".mat")].find((b) => b.dataset.v.toLowerCase() === v.toLowerCase());
      if (!chip) {
        box.insertAdjacentHTML("beforeend", matChip(v, true));
        chip = box.lastElementChild;
      }
      chip.classList.add("on");
      chip.setAttribute("aria-pressed", "true");
      input.value = "";
      refreshPick(input.closest(".mat-field"));
      toast(`${chip.dataset.v} selected`);
    },
    removeOpt(el) {
      const list = state.settings[el.dataset.kind][el.dataset.line];
      const i = list.findIndex((x) => x === el.dataset.v);
      if (i >= 0) list.splice(i, 1);
      save();
      el.remove();
    },
    pickPhotos(el) { pendingMediaFor = el.dataset.id; $("#photoInput").click(); },
    pickVideos(el) { pendingMediaFor = el.dataset.id; $("#videoInput").click(); },
    async draftRemove(el) {
      const kind = el.dataset.kind, id = el.dataset.m, list = kind === "photo" ? draft.photos : draft.videos;
      if (!confirm(`Remove this ${kind}?`)) return;
      list.splice(list.indexOf(id), 1);
      const i = draft.added.indexOf(id);
      if (i >= 0) { draft.added.splice(i, 1); forgetURL(id); await media.del(id).catch(() => {}); }
      else draft.removed.push(id);
      renderDraftMedia();
    },
    saveOne(el) {
      const p = pOf(el), id = el.dataset.m, blob = blobs.get(id);
      if (!blob) return toast("Still loading. Try again in a moment");
      const list = p.photos.includes(id) ? p.photos : p.videos;
      saveToRoll([fileFor(blob, p, list.indexOf(id) + 1)]);
    },
    photo: (el) => { const p = pOf(el); modal.innerHTML = ""; openModal(photoViewer(p, Number(el.dataset.i))); },
    cover(el) {
      const p = pOf(el), i = Number(el.dataset.i);
      p.photos.unshift(p.photos.splice(i, 1)[0]);
      save();
      closeModal();
      render();
      toast("Cover photo set");
    },
    async delPhoto(el) {
      const p = pOf(el);
      if (!confirm("Delete this photo?")) return;
      await removeMedia(p, "photo", p.photos[Number(el.dataset.i)]);
      closeModal();
      render();
    },
    async delVideo(el) {
      if (!confirm("Remove this video?")) return;
      await removeMedia(pOf(el), "video", el.dataset.m);
      render();
    },
    exportBackup: () => exportBackup($("#withVideos").checked).catch(() => toast("Backup failed")),
    importBackup: () => $("#importInput").click(),
    exportCSV,
    editPhoto: (el) => openPhotoEditor(pOf(el), Number(el.dataset.i)),
    edRotate(el) { ed.rot = (ed.rot + Number(el.dataset.d) + 4) % 4; fitCrop(); drawEditor(); },
    edReset() { ed.rot = 0; ed.ratio = "free"; fitCrop(); drawEditor(); document.querySelectorAll(".ed-ratios .chip").forEach((c) => c.classList.toggle("on", c.dataset.r === "free")); },
    edRatio(el) {
      ed.ratio = el.dataset.r;
      document.querySelectorAll(".ed-ratios .chip").forEach((c) => c.classList.toggle("on", c === el));
      fitCrop();
      placeCrop();
    },
    edSave: () => saveEditedPhoto().catch(() => toast("Couldn't save the photo")),
    trimVideo(el) {
      openModal(trimHTML(pOf(el), el.dataset.m), { sheet: true });
      trimReady();
    },
    trimHere(el) {
      const v = $("#trimVideo"), input = $(el.dataset.which === "start" ? "#trimStart" : "#trimEnd");
      input.value = v.currentTime;
      trimSync();
    },
    trimPlay() {
      const v = $("#trimVideo");
      v.dataset.start = $("#trimStart").value;
      v.dataset.end = $("#trimEnd").value;
      v.currentTime = Number(v.dataset.start);
      v.play().catch(() => {});
    },
    trimSave(el) {
      const p = pOf(el), start = Number($("#trimStart").value), end = Number($("#trimEnd").value), v = $("#trimVideo");
      if (!(end > start + 0.2)) return toast("End must be after the start");
      const full = Number.isFinite(v.duration) && start <= 0.05 && end >= Math.floor(v.duration * 10) / 10 - 0.05;
      if (full) delete p.trims[el.dataset.m]; else p.trims[el.dataset.m] = { start, end };
      p.updated = Date.now();
      save();
      closeModal();
      render();
      toast(full ? "Showing the full video" : "Trim saved");
    },
    trimClear(el) {
      const p = pOf(el);
      delete p.trims[el.dataset.m];
      p.updated = Date.now();
      save();
      closeModal();
      render();
      toast("Trim removed");
    },
    renumber: () => openModal(renumberHTML(renumberPlan()), { sheet: true }),
    applyRenumber() {
      const changes = renumberPlan();
      for (const c of changes) { c.p.code = c.to; c.p.updated = Date.now(); }
      save();
      closeModal();
      render();
      toast(`Renumbered ${changes.length} project${changes.length > 1 ? "s" : ""}`);
    },
  };

  // ---------- forms ----------
  const forms = {
    project(f) {
      const d = Object.fromEntries(new FormData(f));
      // Fields hidden for the chosen status (e.g. sale details on a gifted piece) are saved empty.
      for (const el of f.querySelectorAll("[data-for][hidden] [name]")) d[el.name] = "";
      const name = d.name.trim();
      if (!name) { f.querySelector("[name=name]").focus(); return toast("Give the project a name"); }
      const code = d.code.trim().toUpperCase();
      const id = f.dataset.id;
      if (code && state.projects.some((x) => x.id !== id && x.code.toUpperCase() === code)
        && !confirm(`${code} is already used by another project. Save anyway?`)) return;
      const fields = {
        name, code, status: d.status, datesUnknown: !!d.datesUnknown, timeUnknown: !!d.timeUnknown,
        start: d.datesUnknown ? "" : d.start || "", end: d.datesUnknown ? "" : d.end || "", purpose: d.purpose.trim(),
        description: d.description.trim(), materials: [...f.querySelectorAll('.mats[data-kind="materials"] .mat.on')].map((b) => b.dataset.v),
        finishes: [...f.querySelectorAll('.mats[data-kind="finishes"] .mat.on')].map((b) => b.dataset.v), dimensions: d.dimensions.trim(),
        cost: d.cost.trim(), notes: d.notes.trim(),
        sale: { asking: d.asking.trim(), price: d.price.trim(), date: d.soldDate, buyer: d.buyer.trim(),
          where: d.where.trim(), notes: d.saleNotes.trim() },
        gift: { to: d.giftTo.trim(), date: d.giftDate, occasion: d.giftOccasion.trim(), notes: d.giftNotes.trim() },
        kept: { where: d.keptWhere.trim(), notes: d.keptNotes.trim() },
        photos: draft.photos, videos: draft.videos,
      };
      const addMs = ((Number(d.addH) || 0) * 60 + (Number(d.addM) || 0)) * 6e4;
      const extra = addMs > 0 ? [{ start: parse(todayISO()).getTime() + 12 * 36e5, end: parse(todayISO()).getTime() + 12 * 36e5 + addMs, manual: true }] : [];
      for (const m of draft.removed) { forgetURL(m); media.del(m).catch(() => {}); }
      draft = null;
      closeModal();
      markUsed({ line: f.dataset.line, ...fields });
      state.settings.lastLine = f.dataset.line;
      if (id) {
        const p = find(id);
        Object.assign(p, fields, { updated: Date.now() });
        p.trims = normTrims(p.trims, p.videos);
        p.sessions.push(...extra);
        save();
        render();
        toast("Saved");
      } else {
        const p = normProject({ id: uid(), line: f.dataset.line, ...fields, sessions: extra, created: Date.now() });
        state.projects.push(p);
        save();
        navigate("#/p/" + p.id);
        toast(`${p.code || "Project"} created`);
      }
    },
    session(f) {
      const p = find(f.dataset.id), t = p.sessions[Number(f.dataset.i)];
      const start = new Date(f.start.value).getTime();
      const end = f.end.value ? new Date(f.end.value).getTime() : null;
      if (!Number.isFinite(start)) return toast("Enter a start time");
      if (end != null && end <= start) return toast("Stop time must be after the start");
      if (end == null && t.end != null) return toast("Enter a stop time");
      Object.assign(t, { start, end });
      p.updated = Date.now();
      save();
      closeModal();
      render();
    },
    addTime(f) {
      const p = find(f.dataset.id);
      const ms = ((Number(f.h.value) || 0) * 60 + (Number(f.m.value) || 0)) * 6e4;
      if (ms <= 0) return toast("Enter some hours or minutes");
      const start = parse(f.date.value).getTime() + 12 * 36e5;
      p.sessions.push({ start, end: start + ms, manual: true });
      p.updated = Date.now();
      save();
      closeModal();
      render();
      toast(`Added ${fmtDur(ms)}`);
    },
    settings(f) {
      const w = f.wood.value.trim().toUpperCase(), l = f.leather.value.trim().toUpperCase();
      if (!w || !l) return toast("Prefixes can't be empty");
      state.settings.prefixes = { wood: w, leather: l };
      save();
      toast("Codes saved");
    },
  };

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    if (e.target === modal) return cancelModal();
    const el = e.target.closest("[data-action]");
    if (!el || el.matches("input, select, textarea")) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target, fn = forms[f.dataset.form];
    if (fn) { e.preventDefault(); fn(f); }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "search") {
      ui.q = t.value;
      const r = route(), list = $("#list");
      if (list && r.name === "list") { list.innerHTML = listHTML(); hydrate(); }
    }
    if ((t.name === "code" || t.name === "end") && t.form && t.form.dataset.form === "project") t.dataset.auto = "0";
    if (t.classList.contains("opt-new")) refreshPick(t.closest(".mat-field"));
    if (t.id === "trimStart" || t.id === "trimEnd") {
      const s = $("#trimStart"), e = $("#trimEnd");
      if (t.id === "trimStart" && Number(s.value) > Number(e.value) - 0.2) s.value = Math.max(0, Number(e.value) - 0.2);
      if (t.id === "trimEnd" && Number(e.value) < Number(s.value) + 0.2) e.value = Number(s.value) + 0.2;
      $("#trimVideo").currentTime = Number(t.value);
      trimSync();
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "photoInput" || t.id === "videoInput") {
      const files = [...t.files];
      t.value = "";
      addMedia(targetOf(pendingMediaFor), files, t.id === "photoInput" ? "photo" : "video");
      return;
    }
    if (t.id === "sortBy") {
      state.settings.sort = t.value;
      save();
      const r = route(), list = $("#list");
      if (list && r.name === "list") { list.innerHTML = listHTML(); hydrate(); }
      return;
    }
    if (t.id === "importInput") {
      const file = t.files[0];
      t.value = "";
      if (file) importBackup(file).catch(() => toast("Restore failed"));
      return;
    }
    const f = t.form;
    if (!f || f.dataset.form !== "project") return;
    if (t.name === "line") {
      // New project moved to the other workshop: its code, theme and material/finish lists follow.
      f.dataset.line = t.value;
      document.body.dataset.line = t.value;
      const pre = $("#codePrefix");
      if (pre) pre.textContent = state.settings.prefixes[t.value];
      if (f.code.dataset.auto === "1") {
        const year = f.start.value ? parse(f.start.value).getFullYear() : new Date().getFullYear();
        f.code.value = nextCode(t.value, year, f.dataset.id);
      }
      for (const field of f.querySelectorAll(".mat-field")) {
        field.outerHTML = pickField(field.querySelector(".mats").dataset.kind, t.value, []);
      }
      return;
    }
    if (t.name === "end") f.end.dataset.auto = "0";
    if (t.name === "start" && f.end.dataset.auto === "1") f.end.value = t.value;
    if (t.name === "start" && f.code.dataset.auto === "1") {
      const year = t.value ? parse(t.value).getFullYear() : new Date().getFullYear();
      f.code.value = nextCode(f.dataset.line, year, f.dataset.id);
    }
    if (t.name === "datesUnknown") {
      for (const n of ["start", "end"]) f[n].disabled = t.checked;
      if (!t.checked && !f.start.value) f.start.value = todayISO();
    }
    if (t.name === "status" && DONE.includes(t.value) && !f.end.value && !f.datesUnknown.checked) f.end.value = f.start.value || todayISO();
    if (t.name === "status") {
      applyStatus(f);
      if (t.value === "Sold" && !f.soldDate.value) f.soldDate.value = todayISO();
      if (t.value === "Gifted" && !f.giftDate.value) f.giftDate.value = todayISO();
    }
  });
  document.addEventListener("toggle", (e) => {
    if (e.target.matches && e.target.matches(".timer details")) ui.logOpen = e.target.open;
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("opt-new")) { e.preventDefault(); actions.addOpt(e.target); }
  });
  modal.addEventListener("cancel", (e) => {
    // Escape / back gesture: same check as tapping Cancel.
    if (draft && draft.added.length) { e.preventDefault(); cancelModal(); }
  });
  modal.addEventListener("close", () => {
    modal.innerHTML = "";
    document.body.dataset.line = route().line || "";
    ed = null;
    unlockPage();
    discardDraft();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

  // Ask the browser not to clear this app's storage when the phone is short of space.
  if (state.projects.length && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!history.state) history.replaceState({ d: 0 }, "", location.hash || "#/");
  render();
})();
