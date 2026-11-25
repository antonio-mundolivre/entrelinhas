// Leitor do Entrelinhas: uma obra aberta, capítulos em sequência, leitura em páginas (Pager), grafia atual ou original.
const $ = s => document.querySelector(s);
const PREFS_DEFAULT = { size: 19, theme: "light", width: 32, align: "justify", orth: "atual" };
let prefs = { ...PREFS_DEFAULT };
let work = null, wid = "", total = 0, prog = null;
const loaded = [];                 // capítulos na tela, em ordem: [{ ch, el }]
let alignRefresh = () => {}, saveT = 0, busy = false;

// ---------- preferências ----------
async function loadPrefs() {
  const { prefs: p } = await chrome.storage.local.get("prefs");
  prefs = { ...PREFS_DEFAULT, ...(p || {}) };
}
const savePrefs = () => chrome.storage.local.set({ prefs });
function applyPrefs() {
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
function makeSection(ch) {
  const sec = el("section", "chapter"); sec.dataset.ch = ch;
  fillChapter(sec, ch);
  return sec;
}
function append(ch) {
  if (ch >= total || loaded.some(x => x.ch === ch)) return null;
  const s = makeSection(ch); $("#content").append(s); loaded.push({ ch, el: s }); return s;
}
function prepend(ch) {
  if (ch < 0 || loaded.some(x => x.ch === ch)) return null;
  const s = makeSection(ch); $("#content").prepend(s); loaded.unshift({ ch, el: s }); return s;
}
const firstCh = () => loaded.length ? loaded[0].ch : 0;
const lastCh = () => loaded.length ? loaded[loaded.length - 1].ch : 0;

function setHooks() {
  Pager.hooks.next = lastCh() < total - 1 ? loadNext : null;
  Pager.hooks.prev = firstCh() > 0 ? loadPrev : null;
  Pager.refreshBar();
}
function loadNext() {
  if (!append(lastCh() + 1)) return;
  setHooks(); Pager.layoutNow(); Pager.next();
}
function loadPrev() {
  const old = loaded.length && loaded[0].el;
  if (!old || !prepend(firstCh() - 1)) return;
  busy = true;
  setHooks(); Pager.layoutNow(false);
  const p = Pager.pageOf(old);               // a página onde começava o capítulo que estava aberto
  Pager.goTo(Math.max(0, (p == null ? 1 : p) - 1));
  busy = false; onPage(Pager.page, Pager.pages);
}

// onde estou: capítulo e parágrafo do primeiro elemento visível da página
function here() {
  const e = Pager.firstOnPage();
  const sec = e && e.closest("section.chapter");
  if (!sec) return null;
  const v = e.closest(".v");
  return { ch: +sec.dataset.ch, p: v ? +v.dataset.p : 0, el: e };
}
function onPage(page, pages) {
  if (busy) return;
  const h = here();
  if (!h) return;
  // mantém sempre o capítulo seguinte carregado, para o texto correr sem espera
  if (h.ch >= lastCh() && lastCh() < total - 1) { append(lastCh() + 1); setHooks(); }
  // não deixa a página crescer sem fim: tira capítulos já bem para trás
  while (loaded.length > 6 && loaded[0].ch < h.ch - 1) { loaded.shift().el.remove(); setHooks(); }
  clearTimeout(saveT);
  saveT = setTimeout(async () => {          // decide no momento de gravar, com a paginação já assentada
    const atEnd = Pager.page >= Pager.pages - 1 && lastCh() === total - 1;
    const now = here() || h;
    prog = await Library.setPos(wid, now.ch, atEnd ? "end" : now.p, total);
  }, 250);
  document.title = Library.chapLabel(work.chapters[h.ch], prefs.orth) + " — " + work.title;
}

async function openAt(ch, p) {
  busy = true;
  ch = Math.max(0, Math.min(total - 1, ch | 0));
  $("#content").replaceChildren(); loaded.length = 0;
  append(ch);
  if (ch + 1 < total) append(ch + 1);
  setHooks();
  Pager.reset();
  if (p > 0) {
    const t = loaded[0].el.querySelector(`.v[data-p="${p}"]`);
    if (t) Pager.reveal(t);
  }
  await new Promise(r => setTimeout(r, 200));
  busy = false;
  onPage(Pager.page, Pager.pages);
}

// troca de grafia: redesenha sem perder o lugar
function rerender() {
  const h = here();
  busy = true;
  loaded.forEach(x => fillChapter(x.el, x.ch));
  Pager.layoutNow();
  if (h) {
    const sec = loaded.find(x => x.ch === h.ch);
    const t = sec && (sec.el.querySelector(`.v[data-p="${h.p}"]`) || sec.el.querySelector("h1"));
    if (t) Pager.reveal(t);
  }
  setTimeout(() => { busy = false; }, 200);
}

// ---------- índice ----------
function openToc() {
  const list = $("#tocList"), h = here(), cur = h ? h.ch : 0, max = prog ? prog.max || 0 : 0;
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
    advance: async () => { if (!Narrator.settings().auto || lastCh() >= total - 1) return false; await openAt(lastCh() + 1, 0); return true; },
    notify: m => { const e = $("#pageinfo"); if (e) e.textContent = m; }
  });
  Dict.attach({ root: () => $("#content"), lang: () => "pt", notify: m => { const e = $("#pageinfo"); if (e) e.textContent = m; } });
  const cap = q.get("cap");
  if (cap != null) await openAt(+cap, 0);
  else if (prog && !prog.done) await openAt(prog.ch, prog.p);
  else await openAt(0, 0);
  window.addEventListener("pagehide", () => { const h = here(); if (h) Library.setPos(wid, h.ch, h.p, total); });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.prefs) { const o = prefs.orth; prefs = { ...PREFS_DEFAULT, ...(changes.prefs.newValue || {}) }; applyPrefs(); if (o !== prefs.orth) rerender(); }
  });
})();
