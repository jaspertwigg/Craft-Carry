(() => {
  "use strict";

  // ---------- constants ----------
  const KEY = "workshop-log-v1";
  const LINES = {
    wood: { name: "Wood Talking", emoji: "🪵", craft: "Woodwork" },
    leather: { name: "Craft & Carry", emoji: "👜", craft: "Leatherwork" },
  };
  const DEFAULT_MATERIALS = {
    wood: ["Jarrah", "Marri", "Sheoak", "Blackbutt", "Tasmanian oak", "Pine", "Walnut", "Oak", "Maple",
      "Plywood", "MDF", "Danish oil", "Food-safe oil", "Beeswax", "Polyurethane", "Wood glue", "Brass hardware", "Screws"],
    leather: ["Veg-tan leather", "Chrome-tan leather", "Kangaroo leather", "Suede", "Waxed thread", "Rivets",
      "Snaps", "Buckles", "D-rings", "Zips", "Edge paint", "Leather dye", "Neatsfoot oil", "Contact cement"],
  };
  const DEFAULT_PREFIX = { wood: "WT", leather: "CC" };
  const STATUSES = ["Idea", "In progress", "Finished", "For sale", "Sold", "Gifted", "Kept"];
  const DONE = ["Finished", "For sale", "Sold", "Gifted", "Kept"];
  const PURPOSES = ["For sale", "Commission", "Gift", "Personal use", "Practice / prototype", "Market stock"];

  const $ = (s, r = document) => r.querySelector(s);
  const view = $("#view"), modal = $("#modal"), toastEl = $("#toast");
  const ui = { q: "", status: "All", logOpen: false };
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

  // ---------- state ----------
  function blank() {
    return { settings: { prefixes: { ...DEFAULT_PREFIX },
      materials: { wood: [...DEFAULT_MATERIALS.wood], leather: [...DEFAULT_MATERIALS.leather] } }, projects: [] };
  }
  const hasItem = (list, v) => list.some((x) => x.toLowerCase() === v.toLowerCase());
  function addMaterialOption(line, v, settings = state.settings) {
    const list = settings.materials[line];
    if (v && !hasItem(list, v)) list.push(v);
  }
  function normalize(s) {
    const out = blank();
    if (!s || typeof s !== "object") return out;
    const pre = (s.settings && s.settings.prefixes) || {};
    for (const k of Object.keys(DEFAULT_PREFIX)) {
      if (typeof pre[k] === "string" && pre[k].trim()) out.settings.prefixes[k] = pre[k].trim().toUpperCase();
    }
    const mats = (s.settings && s.settings.materials) || {};
    for (const k of Object.keys(LINES)) {
      if (!Array.isArray(mats[k])) continue;
      out.settings.materials[k] = [];
      for (const v of mats[k]) if (typeof v === "string" && v.trim()) addMaterialOption(k, v.trim(), out.settings);
    }
    if (Array.isArray(s.projects)) out.projects = s.projects.filter((x) => x && x.id && LINES[x.line]).map(normProject);
    // Any material used on a project belongs in that workshop's choice list.
    for (const p of out.projects) for (const m of p.materials) addMaterialOption(p.line, m, out.settings);
    return out;
  }
  function normProject(x) {
    const sale = x.sale || {};
    const ids = (a) => (Array.isArray(a) ? a.filter((v) => typeof v === "string") : []);
    return {
      id: String(x.id), line: x.line, name: str(x.name), code: str(x.code),
      status: STATUSES.includes(x.status) ? x.status : "In progress",
      start: str(x.start), end: str(x.end), purpose: str(x.purpose), description: str(x.description),
      materials: (Array.isArray(x.materials) ? x.materials : str(x.materials).split(/[,;]/))
        .map((m) => str(m).trim()).filter(Boolean),
      dimensions: str(x.dimensions), cost: str(x.cost), notes: str(x.notes),
      sale: { asking: str(sale.asking), price: str(sale.price), date: str(sale.date), buyer: str(sale.buyer),
        where: str(sale.where), notes: str(sale.notes) },
      photos: ids(x.photos), videos: ids(x.videos),
      sessions: (Array.isArray(x.sessions) ? x.sessions : [])
        .filter((t) => t && Number.isFinite(t.start))
        .map((t) => ({ start: t.start, end: Number.isFinite(t.end) ? t.end : null, manual: !!t.manual })),
      created: Number(x.created) || Date.now(), updated: Number(x.updated) || Date.now(),
    };
  }
  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); }
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
  const urls = new Map();
  const mediaAttr = (id) => (urls.has(id) ? `src="${urls.get(id)}"` : `data-media="${esc(id)}"`);
  async function mediaURL(id) {
    if (urls.has(id)) return urls.get(id);
    const rec = await media.get(id);
    if (!rec) return "";
    const u = URL.createObjectURL(rec.blob);
    urls.set(id, u);
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
        added++;
      } catch (e) {
        toast(e && e.name === "QuotaExceededError" ? "Not enough storage space on this device" : "Couldn't save " + file.name);
      }
    }
    if (added) {
      p.updated = Date.now();
      save();
      render();
      toast(`Added ${added} ${kind}${added > 1 ? "s" : ""}`);
    }
  }
  async function removeMedia(p, kind, id) {
    const list = kind === "photo" ? p.photos : p.videos;
    const i = list.indexOf(id);
    if (i < 0) return;
    list.splice(i, 1);
    p.updated = Date.now();
    save();
    forgetURL(id);
    await media.del(id).catch(() => {});
  }
  // In-app camera: keeps the viewfinder open so several photos can be taken in a row.
  let cam = null;
  async function openCamera(p) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3264 }, height: { ideal: 2448 } } });
    } catch {
      return toast("Camera not available. Allow camera access, or use Choose from library.");
    }
    cam = { stream, p, count: 0 };
    modal.classList.add("full");
    openModal(`<div class="camera">
      <video id="camVideo" autoplay playsinline muted></video>
      <div class="cam-strip" id="camStrip"></div>
      <div class="cam-bar">
        <span></span>
        <button class="shutter" data-action="snap" aria-label="Take photo"></button>
        <button class="btn cam-done" data-action="close">Done <span id="camCount"></span></button>
      </div>
    </div>`);
    $("#camVideo").srcObject = stream;
  }
  async function snap() {
    const v = $("#camVideo");
    if (!cam || !v || !v.videoWidth) return;
    const scale = Math.min(1, 2000 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    v.classList.remove("flash");
    void v.offsetWidth;
    v.classList.add("flash");
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob || !cam) return;
    const id = uid(), p = cam.p;
    try {
      await media.put({ id, kind: "photo", type: "image/jpeg", name: `photo-${Date.now()}.jpg`, blob, created: Date.now() });
    } catch {
      return toast("Couldn't save the photo. Storage may be full");
    }
    p.photos.push(id);
    p.updated = Date.now();
    save();
    cam.count++;
    urls.set(id, URL.createObjectURL(blob));
    $("#camStrip").insertAdjacentHTML("afterbegin", `<img alt="" src="${urls.get(id)}">`);
    $("#camCount").textContent = `(${cam.count})`;
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
    if (LINES[a]) return { name: "line", line: a };
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
    history.replaceState({ d: 0 }, "", r.name === "project" ? "#/" + r.line : "#/");
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
  function timeBit(p) {
    return running(p)
      ? `<b class="live">⏱ <span data-timer="${esc(p.id)}">${fmtClock(totalMs(p))}</span></b>`
      : `⏱ ${fmtDur(totalMs(p))}`;
  }
  function card(p) {
    const dates = p.start ? fmtDate(p.start) + (p.end ? " → " + fmtDate(p.end) : "") : "No start date";
    return `<button class="pcard" data-action="go" data-to="#/p/${esc(p.id)}">
      ${thumb(p)}
      <span class="pbody">
        <span class="prow"><span class="code">${esc(p.code || "No code")}</span>${statusPill(p.status)}</span>
        <span class="pname">${esc(p.name)}</span>
        <span class="pmeta">${dates} · ${timeBit(p)}</span>
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
      const brand = (line) => {
        const s = stats(ofLine(line));
        return `<button class="brand brand-${line}" data-action="go" data-to="#/${line}">
          <span class="brand-mark">${LINES[line].emoji}</span>
          <span class="brand-name">${esc(LINES[line].name)}</span>
          <span class="brand-sub">${LINES[line].craft} · ${s.count} project${s.count === 1 ? "" : "s"} · ${s.hours.toFixed(1)} h</span>
        </button>`;
      };
      const recent = [...state.projects].sort((a, b) => b.updated - a.updated).slice(0, 4);
      return `${runningCard()}
        <section class="brands">${brand("wood")}${brand("leather")}</section>
        ${recent.length ? `<h2 class="section">Recently updated</h2><div class="list">${recent.map(card).join("")}</div>`
          : `<p class="empty">Pick a workshop above to add your first project.</p>`}`;
    },

    line({ line }) {
      const list = ofLine(line);
      const s = stats(list);
      const present = STATUSES.filter((st) => list.some((p) => p.status === st));
      if (ui.status !== "All" && !present.includes(ui.status)) ui.status = "All";
      return `${runningCard()}
        <section class="stats">
          <div><b>${s.count}</b><span>projects</span></div>
          <div><b>${s.done}</b><span>finished</span></div>
          <div><b>${s.hours.toFixed(1)}</b><span>hours</span></div>
          <div><b>${s.sold ? money(s.revenue).replace(/\.00$/, "") : "—"}</b><span>${s.sold} sold</span></div>
        </section>
        <button class="btn block big" data-action="newProject" data-line="${line}">＋ New ${esc(LINES[line].name)} project</button>
        ${list.length ? `<input id="search" type="search" placeholder="Search name, code, materials…" value="${esc(ui.q)}" autocomplete="off">
          <div class="chips">${["All", ...present].map((st) =>
            `<button class="chip${ui.status === st ? " on" : ""}" data-action="filter" data-status="${esc(st)}">${esc(st)}</button>`).join("")}</div>
          <div id="list" class="list">${listHTML(line)}</div>`
          : `<p class="empty">No projects yet. Tap the button above to record your first one.</p>`}`;
    },

    project({ id }) {
      const p = find(id);
      const ms = totalMs(p), run = running(p);
      const L = LINES[p.line];
      const row = (label, val) => (val ? `<dt>${label}</dt><dd>${val}</dd>` : "");
      const price = num(p.sale.price), cost = num(p.cost), hours = ms / 36e5;
      const profit = price != null ? price - (cost || 0) : null;
      const sessions = p.sessions.map((t, i) => ({ ...t, i })).sort((a, b) => b.start - a.start);
      const sale = p.sale;
      const hasSale = Object.values(sale).some(Boolean);

      return `<section class="hero">
          ${p.photos[0]
            ? `<button class="hero-img" data-action="photo" data-id="${esc(p.id)}" data-i="0"><img alt="" ${mediaAttr(p.photos[0])}></button>`
            : `<button class="hero-img ph" data-action="addPhotos" data-id="${esc(p.id)}"><span>${L.emoji}</span><small>Add photos</small></button>`}
          <div class="hero-text">
            <div class="prow"><span class="code big">${esc(p.code || "No code")}</span>${statusPill(p.status)}</div>
            <h2>${esc(p.name)}</h2>
            <p class="muted">${esc(L.name)}${p.purpose ? " · " + esc(p.purpose) : ""}</p>
          </div>
        </section>

        <section class="card timer${run ? " on" : ""}">
          <div class="timer-top">
            <div>
              <div class="clock big" data-timer="${esc(p.id)}">${fmtClock(ms)}</div>
              <div class="muted small">${run ? "Timing since " + fmtTime(run.start) : `Total time · ${p.sessions.length} session${p.sessions.length === 1 ? "" : "s"}`}</div>
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
        </section>

        <section class="card">
          <h3>Details</h3>
          <dl>
            ${row("Code", esc(p.code))}
            ${row("Started", fmtDate(p.start))}
            ${row("Completed", fmtDate(p.end))}
            ${row("Days start→finish", p.start && p.end ? String(daysBetween(p.start, p.end) + 1) : "")}
            ${row("Time spent", ms ? fmtDur(ms) : "")}
            ${row("Purpose", esc(p.purpose))}
            ${row("Materials", esc(p.materials.join(", ")))}
            ${row("Size", esc(p.dimensions))}
            ${row("Materials cost", cost != null ? money(cost) : "")}
          </dl>
          ${p.description ? `<h4>Description</h4><p class="prose">${esc(p.description)}</p>` : ""}
          ${p.notes ? `<h4>Notes</h4><p class="prose">${esc(p.notes)}</p>` : ""}
          ${!p.description && !p.materials.length && !p.purpose ? `<p class="muted small">Tap <b>Edit</b> to add a description, purpose and materials.</p>` : ""}
        </section>

        <section class="card">
          <div class="card-head"><h3>Photos <span class="muted">${p.photos.length || ""}</span></h3>
            <button class="btn small" data-action="addPhotos" data-id="${esc(p.id)}">＋ Add</button></div>
          ${p.photos.length ? `<div class="grid">${p.photos.map((m, i) =>
            `<button class="gimg" data-action="photo" data-id="${esc(p.id)}" data-i="${i}"><img alt="" loading="lazy" ${mediaAttr(m)}></button>`).join("")}</div>`
            : `<p class="muted small">No photos yet — add progress shots as you go.</p>`}
        </section>

        <section class="card">
          <div class="card-head"><h3>Videos <span class="muted">${p.videos.length || ""}</span></h3>
            <button class="btn small" data-action="addVideos" data-id="${esc(p.id)}">＋ Add</button></div>
          ${p.videos.length ? p.videos.map((m) => `<div class="vid">
              <video controls playsinline preload="metadata" ${mediaAttr(m)}></video>
              <button class="link danger small" data-action="delVideo" data-id="${esc(p.id)}" data-m="${esc(m)}">Remove video</button>
            </div>`).join("") : `<p class="muted small">No videos yet.</p>`}
        </section>

        <section class="card">
          <h3>Sale details</h3>
          ${hasSale ? `<dl>
            ${row("Asking price", num(sale.asking) != null ? money(num(sale.asking)) : esc(sale.asking))}
            ${row("Sold for", price != null ? money(price) : "")}
            ${row("Date sold", fmtDate(sale.date))}
            ${row("Buyer", esc(sale.buyer))}
            ${row("Sold via", esc(sale.where))}
            ${row("Profit", profit != null && cost != null ? money(profit) : "")}
            ${row("Per hour", profit != null && hours >= 0.1 ? money(profit / hours) + "/h" : "")}
          </dl>${sale.notes ? `<p class="prose">${esc(sale.notes)}</p>` : ""}`
          : `<p class="muted small">Not sold yet. Tap <b>Edit</b> to add asking price or sale details.</p>`}
        </section>

        <div class="row-actions">
          <button class="btn block" data-action="edit" data-id="${esc(p.id)}">✎ Edit project</button>
          <button class="btn ghost danger block" data-action="delProject" data-id="${esc(p.id)}">Delete project</button>
        </div>`;
    },
  };

  function listHTML(line) {
    const q = ui.q.trim().toLowerCase();
    const list = ofLine(line)
      .filter((p) => ui.status === "All" || p.status === ui.status)
      .filter((p) => !q || [p.name, p.code, p.materials.join(" "), p.description, p.purpose, p.sale.buyer, p.notes]
        .some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => b.created - a.created);
    return list.length ? list.map(card).join("") : `<p class="empty">No matching projects.</p>`;
  }

  function render() {
    const r = route();
    document.body.dataset.line = r.line || "";
    $("#back").hidden = r.name === "home";
    $("#title").textContent = r.name === "home" ? "Workshop Log"
      : r.name === "line" ? LINES[r.line].name : find(r.id).code || find(r.id).name;
    view.innerHTML = views[r.name](r);
    hydrate();
  }

  // ---------- modals ----------
  function openModal(html) {
    modal.innerHTML = `<div class="modal-in">${html}</div>`;
    if (!modal.open) modal.showModal();
    hydrate();
  }
  function closeModal() { if (modal.open) modal.close(); modal.innerHTML = ""; }

  function projectForm(p, line) {
    const isNew = !p;
    const d = p || { name: "", code: nextCode(line, new Date().getFullYear()), status: "In progress",
      start: todayISO(), end: "", purpose: "", description: "", materials: [], dimensions: "", cost: "", notes: "", sale: {} };
    const s = d.sale;
    const v = (x) => `value="${esc(x || "")}"`;
    return `<form data-form="project" data-id="${isNew ? "" : esc(p.id)}" data-line="${line}" class="form">
      <h2>${isNew ? "New " + esc(LINES[line].name) + " project" : "Edit project"}</h2>
      <label>Name<input name="name" required ${v(d.name)} placeholder="e.g. Jarrah cutting board"></label>
      <div class="two">
        <label>Code<input name="code" ${v(d.code)} data-auto="${isNew ? 1 : 0}" autocapitalize="characters"></label>
        <label>Status<select name="status">${STATUSES.map((x) => `<option${x === d.status ? " selected" : ""}>${x}</option>`).join("")}</select></label>
      </div>
      ${isNew ? `<p class="hint">Code is filled in automatically: ${esc(state.settings.prefixes[line])} + year + item number. You can change it.</p>` : ""}
      <div class="two">
        <label>Start date<input type="date" name="start" ${v(d.start)}></label>
        <label>Completion date<input type="date" name="end" ${v(d.end)}></label>
      </div>
      <label>Purpose<input name="purpose" list="purposes" ${v(d.purpose)} placeholder="Who or what is it for?"></label>
      <datalist id="purposes">${PURPOSES.map((x) => `<option value="${x}">`).join("")}</datalist>
      <label>Description<textarea name="description" rows="4">${esc(d.description)}</textarea></label>
      <fieldset><legend>Materials &amp; build</legend>
        <div class="mat-field">
          <span class="label">Materials <small>tap to select</small></span>
          <div class="mats">${materialChips(line, d.materials)}</div>
          <div class="mat-add">
            <input id="matNew" placeholder="Add a new material…" autocomplete="off" enterkeyhint="done">
            <button type="button" class="btn small" data-action="addMat">Add</button>
          </div>
        </div>
        <div class="two">
          <label>Size<input name="dimensions" ${v(d.dimensions)} placeholder="e.g. 40 × 25 × 2 cm"></label>
          <label>Materials cost ($)<input name="cost" inputmode="decimal" ${v(d.cost)}></label>
        </div>
      </fieldset>
      <fieldset><legend>Sale details</legend>
        <div class="two">
          <label>Asking price ($)<input name="asking" inputmode="decimal" ${v(s.asking)}></label>
          <label>Sold for ($)<input name="price" inputmode="decimal" ${v(s.price)}></label>
        </div>
        <div class="two">
          <label>Date sold<input type="date" name="soldDate" ${v(s.date)}></label>
          <label>Buyer<input name="buyer" ${v(s.buyer)}></label>
        </div>
        <label>Sold via<input name="where" ${v(s.where)} placeholder="Market stall, Instagram, Etsy, word of mouth…"></label>
        <label>Sale notes<textarea name="saleNotes" rows="2">${esc(s.notes)}</textarea></label>
      </fieldset>
      <label>Other notes<textarea name="notes" rows="3">${esc(d.notes)}</textarea></label>
      <div class="actions">
        <button type="button" class="btn ghost" data-action="close">Cancel</button>
        <button class="btn">Save</button>
      </div>
    </form>`;
  }

  function materialChips(line, selected) {
    const all = [...state.settings.materials[line]];
    for (const m of selected) if (!hasItem(all, m)) all.push(m);
    return all.map((m) => matChip(m, hasItem(selected, m))).join("");
  }
  const matChip = (m, on) =>
    `<button type="button" class="mat${on ? " on" : ""}" data-action="toggleMat" data-v="${esc(m)}" aria-pressed="${on}">${esc(m)}</button>`;

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
        <button class="btn" data-action="close">Close</button>
      </div>
    </div>`;
  }

  function settingsHTML() {
    const pre = state.settings.prefixes;
    return `<form data-form="settings" class="form">
      <h2>Settings</h2>
      <fieldset><legend>Project codes</legend>
        <div class="two">
          <label>Wood Talking<input name="wood" value="${esc(pre.wood)}" autocapitalize="characters" required></label>
          <label>Craft &amp; Carry<input name="leather" value="${esc(pre.leather)}" autocapitalize="characters" required></label>
        </div>
        <p class="hint">Codes are prefix + 2-digit year + item number, e.g. ${esc(pre.wood)}2601. Changing a prefix only affects new projects.</p>
        <button class="btn small">Save codes</button>
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
      ${Object.keys(LINES).map((line) => `<fieldset><legend>${esc(LINES[line].name)} materials</legend>
        <p class="hint">Tap × to remove a choice from the list. Projects that already use it keep it.</p>
        <div class="mats">${state.settings.materials[line].map((m) =>
          `<button type="button" class="mat on" data-action="removeMat" data-line="${line}" data-v="${esc(m)}">${esc(m)} ×</button>`).join("")
          || `<span class="muted small">No materials in the list.</span>`}</div>
      </fieldset>`).join("")}
      <div class="actions"><button type="button" class="btn" data-action="close">Done</button></div>
    </form>`;
  }

  // ---------- backup ----------
  async function exportBackup(withVideos) {
    toast("Preparing backup…");
    const recs = await media.all();
    const out = { app: "workshop-log", version: 1, exported: new Date().toISOString(), data: state, media: [] };
    for (const r of recs) {
      if (r.kind === "video" && !withVideos) continue;
      out.media.push({ id: r.id, kind: r.kind, type: r.type, name: r.name, created: r.created, data: await blobToDataURL(r.blob) });
    }
    download(new Blob([JSON.stringify(out)], { type: "application/json" }), `workshop-log-backup-${todayISO()}.json`);
  }
  async function importBackup(file) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { return toast("That file isn't a Workshop Log backup"); }
    const data = obj && (obj.data || obj);
    if (!data || !Array.isArray(data.projects)) return toast("That file isn't a Workshop Log backup");
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
      ["Status", (p) => p.status], ["Purpose", (p) => p.purpose], ["Start date", (p) => p.start],
      ["Completion date", (p) => p.end], ["Hours", (p) => (totalMs(p) / 36e5).toFixed(2)],
      ["Materials", (p) => p.materials.join("; ")], ["Size", (p) => p.dimensions], ["Materials cost", (p) => p.cost],
      ["Asking price", (p) => p.sale.asking], ["Sold for", (p) => p.sale.price], ["Date sold", (p) => p.sale.date],
      ["Buyer", (p) => p.sale.buyer], ["Sold via", (p) => p.sale.where], ["Photos", (p) => p.photos.length],
      ["Videos", (p) => p.videos.length], ["Description", (p) => p.description], ["Notes", (p) => p.notes]];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.map((c) => cell(c[0])).join(",")];
    const list = [...state.projects].sort((a, b) => a.line.localeCompare(b.line) || a.code.localeCompare(b.code));
    for (const p of list) rows.push(cols.map((c) => cell(c[1](p))).join(","));
    download(new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv" }), `workshop-log-${todayISO()}.csv`);
  }

  // ---------- actions ----------
  const pOf = (el) => find(el.dataset.id);
  const actions = {
    go: (el) => navigate(el.dataset.to),
    back: goBack,
    close: closeModal,
    settings() {
      openModal(settingsHTML());
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(({ usage, quota }) => {
          const el = $("#storageInfo");
          if (el && quota) el.textContent = `Using ${(usage / 1e6).toFixed(1)} MB of about ${(quota / 1e9).toFixed(1)} GB available.`;
        }).catch(() => {});
      }
    },
    filter(el) { ui.status = el.dataset.status; render(); },
    newProject: (el) => openModal(projectForm(null, el.dataset.line)),
    edit: (el) => { const p = pOf(el); openModal(projectForm(p, p.line)); },
    async delProject(el) {
      const p = pOf(el);
      if (!confirm(`Delete ${p.code || p.name}? Its photos, videos and time log will be deleted too.`)) return;
      for (const id of [...p.photos, ...p.videos]) { forgetURL(id); await media.del(id).catch(() => {}); }
      state.projects = state.projects.filter((x) => x !== p);
      save();
      history.replaceState({ d: 0 }, "", "#/" + p.line);
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
        if (!p.start) p.start = todayISO();
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
    },
    addMat() {
      const input = $("#matNew"), f = input.form, v = input.value.trim().replace(/\s+/g, " ");
      if (!v) return input.focus();
      addMaterialOption(f.dataset.line, v);
      save();
      const box = f.querySelector(".mats");
      let chip = [...box.querySelectorAll(".mat")].find((b) => b.dataset.v.toLowerCase() === v.toLowerCase());
      if (!chip) {
        box.insertAdjacentHTML("beforeend", matChip(v, true));
        chip = box.lastElementChild;
      }
      chip.classList.add("on");
      chip.setAttribute("aria-pressed", "true");
      input.value = "";
      toast(`${chip.dataset.v} selected`);
    },
    removeMat(el) {
      const list = state.settings.materials[el.dataset.line];
      const i = list.findIndex((x) => x === el.dataset.v);
      if (i >= 0) list.splice(i, 1);
      save();
      el.remove();
    },
    addPhotos: (el) => openModal(`<div class="form">
      <h2>Add photos</h2>
      <button class="btn big block" data-action="camera" data-id="${esc(el.dataset.id)}">📷 Take photos</button>
      <p class="hint">Keep snapping. Tap Done when you've finished.</p>
      <button class="btn ghost big block" data-action="pickPhotos" data-id="${esc(el.dataset.id)}">🖼 Choose from library</button>
      <div class="actions"><button class="btn ghost" data-action="close">Cancel</button></div>
    </div>`),
    pickPhotos(el) { closeModal(); pendingMediaFor = el.dataset.id; $("#photoInput").click(); },
    camera: (el) => openCamera(pOf(el)),
    snap,
    addVideos(el) { pendingMediaFor = el.dataset.id; $("#videoInput").click(); },
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
  };

  // ---------- forms ----------
  const forms = {
    project(f) {
      const d = Object.fromEntries(new FormData(f));
      const name = d.name.trim();
      if (!name) return toast("Give the project a name");
      const code = d.code.trim().toUpperCase();
      const id = f.dataset.id;
      if (code && state.projects.some((x) => x.id !== id && x.code.toUpperCase() === code)
        && !confirm(`${code} is already used by another project. Save anyway?`)) return;
      const fields = {
        name, code, status: d.status, start: d.start, end: d.end, purpose: d.purpose.trim(),
        description: d.description.trim(), materials: [...f.querySelectorAll(".mat.on")].map((b) => b.dataset.v), dimensions: d.dimensions.trim(),
        cost: d.cost.trim(), notes: d.notes.trim(),
        sale: { asking: d.asking.trim(), price: d.price.trim(), date: d.soldDate, buyer: d.buyer.trim(),
          where: d.where.trim(), notes: d.saleNotes.trim() },
      };
      closeModal();
      if (id) {
        Object.assign(find(id), fields, { updated: Date.now() });
        save();
        render();
        toast("Saved");
      } else {
        const p = normProject({ id: uid(), line: f.dataset.line, ...fields, created: Date.now() });
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
    if (e.target === modal) return closeModal();
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
      if (list && r.name === "line") { list.innerHTML = listHTML(r.line); hydrate(); }
    }
    if (t.name === "code" && t.form && t.form.dataset.form === "project") t.dataset.auto = "0";
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "photoInput" || t.id === "videoInput") {
      const files = [...t.files];
      t.value = "";
      addMedia(find(pendingMediaFor), files, t.id === "photoInput" ? "photo" : "video");
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
    if (t.name === "start" && f.code.dataset.auto === "1") {
      const year = t.value ? parse(t.value).getFullYear() : new Date().getFullYear();
      f.code.value = nextCode(f.dataset.line, year, f.dataset.id);
    }
    if (t.name === "status" && DONE.includes(t.value) && !f.end.value) f.end.value = todayISO();
    if (t.name === "status" && t.value === "Sold" && !f.soldDate.value) f.soldDate.value = todayISO();
  });
  document.addEventListener("toggle", (e) => {
    if (e.target.matches && e.target.matches(".timer details")) ui.logOpen = e.target.open;
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "matNew") { e.preventDefault(); actions.addMat(); }
  });
  modal.addEventListener("close", () => {
    modal.innerHTML = "";
    if (!cam) return;
    cam.stream.getTracks().forEach((t) => t.stop());
    const n = cam.count;
    cam = null;
    modal.classList.remove("full");
    render();
    if (n) toast(`Added ${n} photo${n > 1 ? "s" : ""}`);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

  if (!history.state) history.replaceState({ d: 0 }, "", location.hash || "#/");
  render();
})();
