// Leitor do Entrelinhas: uma obra aberta, capítulos em sequência, leitura em páginas (Pager), grafia atual ou original.
const $ = s => document.querySelector(s);
const PREFS_DEFAULT = { size: 19, theme: "light", width: 32, align: "justify", orth: "atual" };
let prefs = { ...PREFS_DEFAULT };
let work = null, wid = "", total = 0, prog = null;
let alignRefresh = () => {}, saveT = 0, busy = false;

// ---------- preferências ----------
async function loadPrefs() {
  const { prefs: p } = await chrome.storage.local.get("prefs");
  prefs = { ...PREFS_DEFAULT, ...(p || {}) };
}
const savePrefs = () => chrome.storage.local.set({ prefs });
function applyPrefs() {
  if (typeof scheduleMeasure === "function" && work) scheduleMeasure();
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.style.setProperty("--size", prefs.size + "px");
  document.documentElement.style.setProperty("--width", prefs.width + "em");
  document.body.dataset.align = prefs.align;
  alignRefresh();
  Pager.layout();
  $("#width").value = String(prefs.width);
  $("#orth").value = prefs.orth;
  document.querySelectorAll("[data-theme-btn]").forEach(b => b.classList.toggle("active", b.dataset.themeBtn === prefs.theme));
}
function bindToolbar() {
  $("#sizeDown").onclick = () => { prefs.size = Math.max(14, prefs.size - 2); applyPrefs(); savePrefs(); };
  $("#sizeUp").onclick = () => { prefs.size = Math.min(44, prefs.size + 2); applyPrefs(); savePrefs(); };
  document.querySelectorAll("[data-theme-btn]").forEach(b => b.onclick = () => { prefs.theme = b.dataset.themeBtn; applyPrefs(); savePrefs(); });
  $("#width").onchange = e => { prefs.width = +e.target.value; applyPrefs(); savePrefs(); };
  $("#orth").onchange = e => { prefs.orth = e.target.value; savePrefs(); rerender(); };
  alignRefresh = Pager.buildAlign($("#alignGroup"), () => prefs.align, v => { prefs.align = v; applyPrefs(); savePrefs(); });
  $("#tocBtn").onclick = openToc;
  $("#tocClose").onclick = closeToc;
  $("#toc").addEventListener("click", e => { if (e.target.id === "toc") closeToc(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#toc").hidden) { e.stopPropagation(); closeToc(); } }, true);
}

// ---------- capítulos ----------
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function fillChapter(sec, ch) {
  const c = work.chapters[ch], orth = prefs.orth;
  const parts = [];
  if (ch === 0) {
    const f = el("div", "front");
    f.append(el("div", "f-author", work.author || ""), el("div", "f-title", work.title), el("div", "f-year", work.year ? String(work.year) : ""));
    parts.push(f);
  }
  parts.push(el("div", "kicker", c.n ? "Capítulo " + c.n : ""));
  parts.push(el("h1", "", Library.pick(c.title, orth) || (c.n ? "Capítulo " + c.n : "")));
  const body = el("div", "body");
  c.paras.forEach((x, k) => {
    const p = el("p", "v"); p.dataset.p = k;
    p.append(el("span", "vt", Library.pick(x, orth)));
    body.append(p);
  });
  parts.push(body);
  if (ch === total - 1) {
    const end = el("div", "fim");
    end.append(el("div", "fim-word", "FIM"));
    const back = el("button", "fim-btn", "Voltar à biblioteca"); back.type = "button"; back.onclick = () => { location.href = "index.html"; };
    end.append(back);
    parts.push(end);
  }
  sec.replaceChildren(...parts);
}
// ---------- um capítulo por vez: cada capítulo é um “mini livro” com as próprias páginas ----------
let cur = 0;                        // capítulo aberto
function makeSection(ch) {
  const sec = el("section", "chapter"); sec.dataset.ch = ch;
  fillChapter(sec, ch);
  return sec;
}
function setHooks() {
  Pager.hooks.next = cur < total - 1 ? () => openAt(cur + 1, 0) : null;
  Pager.hooks.prev = cur > 0 ? () => openAt(cur - 1, "last") : null;
  Pager.refreshBar();
}
// parágrafo no topo da página atual (para guardar o lugar)
function here() {
  const e = Pager.firstOnPage();
  const v = e && e.closest(".v");
  return { ch: cur, p: v ? +v.dataset.p : 0, el: e };
}
function onPage(page, pages) {
  if (busy || !work) return;
  clearTimeout(saveT);
  saveT = setTimeout(async () => {          // decide no momento de gravar, com a paginação já assentada
    const atEnd = cur === total - 1 && Pager.page >= Pager.pages - 1;
    const h = here();
    prog = await Library.setPos(wid, cur, atEnd ? "end" : h.p, total);
  }, 250);
  document.title = Library.chapLabel(work.chapters[cur], prefs.orth) + " — " + work.title;
}
// p: número do parágrafo a mostrar, ou "last" para abrir na última página do capítulo
async function openAt(ch, p) {
  busy = true;
  const narrating = typeof Narrator !== "undefined" && Narrator.isActive();
  cur = Math.max(0, Math.min(total - 1, ch | 0));
  $("#content").replaceChildren(makeSection(cur));
  setHooks();
  Pager.reset();
  if (p === "last") Pager.goTo(Pager.pages - 1);
  else if (p > 0) {
    const t = $("#content").querySelector(`.v[data-p="${p}"]`);
    if (t) Pager.reveal(t);
  }
  await new Promise(r => setTimeout(r, p > 0 ? 200 : 30));
  if (p === "last") Pager.goTo(Pager.pages - 1);   // de novo, com o layout já assentado
  busy = false;
  onPage(Pager.page, Pager.pages);
  return narrating;
}

// troca de grafia: redesenha sem perder o lugar
function rerender() {
  const h = here();
  busy = true;
  fillChapter($("#content").firstElementChild, cur);
  Pager.layoutNow();
  const t = $("#content").querySelector(`.v[data-p="${h.p}"]`);
  if (t && h.p > 0) Pager.reveal(t);
  scheduleMeasure();
  setTimeout(() => { busy = false; }, 200);
}

// ---------- contador: página no capítulo · página no livro ----------
// Cada capítulo começa numa página nova, então as páginas de um capítulo não dependem dos outros:
// medimos um capítulo de cada vez num contêiner escondido com as mesmas medidas da leitura.
const book = { key: "", pages: [], offs: [], total: 0, ready: false, run: 0 };
function measureKey() {
  const m = $("#content").style;
  return [m.width, m.height, prefs.size, prefs.align, prefs.orth, wid].join("|");
}
async function measureBook() {
  const key = measureKey();
  if (!work || !$("#content").style.width || key === book.key) return;
  const run = ++book.run;
  book.key = key; book.ready = false;
  const cacheKey = "pages:" + key;
  try {
    const c = (await chrome.storage.local.get(cacheKey))[cacheKey];
    if (c && c.length === total) { finishBook(c); return; }
  } catch (e) { /* mede de novo */ }
  const box = document.createElement("main");
  const src = $("#content").style;
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = `position:absolute;left:-100000px;top:0;visibility:hidden;width:${src.width};height:${src.height};column-width:${src.columnWidth};column-gap:${src.columnGap};max-width:none`;
  document.body.append(box);
  const out = [];
  try {
    for (let ch = 0; ch < total; ch++) {
      if (run !== book.run) return;                    // as medidas mudaram no meio: outra medição já começou
      const s = el("section", "chapter"); s.dataset.ch = ch; fillChapter(s, ch);
      box.replaceChildren(s);
      out.push(Pager.measure(box));
      if (ch % 8 === 7) await new Promise(r => setTimeout(r, 0));   // não trava a leitura
    }
  } finally { box.remove(); }
  if (run !== book.run) return;
  finishBook(out);
  try { await chrome.storage.local.set({ [cacheKey]: out }); } catch (e) { /* sem cache */ }
}
function finishBook(pages) {
  book.pages = pages; book.offs = []; let acc = 0;
  pages.forEach(n => { book.offs.push(acc); acc += n; });
  book.total = acc; book.ready = true;
  Pager.refreshBar();
}
function pageInfo(page, pages) {
  if (!work) return null;
  let s = "cap. " + (page + 1) + "/" + pages;
  if (book.ready) {
    const tot = book.total - book.pages[cur] + pages;          // usa a contagem real do capítulo aberto
    s += "\nlivro " + Math.min(tot, book.offs[cur] + page + 1) + "/" + tot;
  }
  return s;
}
let measureT = 0;
const scheduleMeasure = () => { clearTimeout(measureT); measureT = setTimeout(measureBook, 700); };

// ---------- índice ----------
function openToc() {
  const list = $("#tocList"), max = prog ? prog.max || 0 : 0;
  list.replaceChildren();
  work.chapters.forEach((c, i) => {
    const li = el("li"); const b = el("button", "tocitem"); b.type = "button";
    b.append(el("span", "tn", c.n || ""), el("span", "tt", Library.pick(c.title, prefs.orth) || ""));
    if (prog && (prog.done || i < max)) b.append(el("span", "tk", "✓"));
    if (i === cur) b.classList.add("cur");
    b.onclick = () => { closeToc(); openAt(i, 0); };
    li.append(b); list.append(li);
  });
  const pct = Library.percent(prog, total);
  $("#tocMeta").textContent = [work.author, work.year, total + " capítulos", pct ? pct + "% lido" : ""].filter(Boolean).join(" · ");
  $("#toc").hidden = false;
  const c = list.querySelector(".cur"); if (c) c.scrollIntoView({ block: "center" });
  document.body.classList.add("picking");
}
function closeToc() { $("#toc").hidden = true; document.body.classList.remove("picking"); }

function fatal(msg) {
  const box = el("div", "error");
  box.append(el("div", "", msg));
  const b = el("button", "", "Voltar à biblioteca"); b.style.marginTop = "10px"; b.onclick = () => { location.href = "index.html"; };
  box.append(b);
  $("#content").replaceChildren(box);
}

(async function init() {
  await I18N.ready;
  I18N.apply();
  await loadPrefs();
  Pager.init();
  Pager.hooks.change = onPage;
  Pager.hooks.info = pageInfo;
  applyPrefs();
  bindToolbar();
  const q = new URLSearchParams(location.search);
  wid = q.get("obra") || await Library.last() || "";
  if (!wid) { location.href = "index.html"; return; }
  try { work = await Library.work(wid); } catch (e) { fatal(e.message || String(e)); return; }
  total = work.chapters.length;
  $("#orthLabel").hidden = !Library.hasOrig(work);
  $("#credit").textContent = work.credit || "";
  prog = (await Library.progress())[wid] || null;
  Narrator.attach({
    root: () => $("#content"), viewport: () => $("#pager"), lang: () => "pt",
    advance: async () => { if (!Narrator.settings().auto || cur >= total - 1) return false; await openAt(cur + 1, 0); return true; },
    notify: m => { const e = $("#pageinfo"); if (e) e.textContent = m; }
  });
  Dict.attach({ root: () => $("#content"), lang: () => "pt", notify: m => { const e = $("#pageinfo"); if (e) e.textContent = m; } });
  const cap = q.get("cap");
  if (cap != null) await openAt(+cap, 0);
  else if (prog && !prog.done) await openAt(prog.ch, prog.p);
  else await openAt(0, 0);
  window.addEventListener("pagehide", () => { const h = here(); if (h) Library.setPos(wid, h.ch, h.p, total); });
  // conta as páginas do livro todo (de novo quando a tela, a letra ou a grafia mudam)
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(scheduleMeasure);
  new ResizeObserver(scheduleMeasure).observe($("#pager"));
  chrome.storage.onChanged.addListener(changes => {
    if (changes.prefs) { const o = prefs.orth; prefs = { ...PREFS_DEFAULT, ...(changes.prefs.newValue || {}) }; applyPrefs(); if (o !== prefs.orth) rerender(); }
  });
})();
