// Ajustes do Entrelinhas
const $ = id => document.getElementById(id);
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
const FONT_NAMES = { palatino: "Palatino (clássica)", georgia: "Georgia", charter: "Charter", moderna: "Moderna (sem serifa)", humanista: "Humanista", verdana: "Verdana (bem legível)" };

async function initReading() {
  const { keepAwake } = await chrome.storage.local.get("keepAwake");
  $("keepAwake").checked = keepAwake !== false;
  $("keepAwake").onchange = e => chrome.storage.local.set({ keepAwake: e.target.checked });
}
async function initNarr() {
  await Narrator.ready;
  if (!Narrator.supported) { $("narrBox").textContent = "Este navegador não lê em voz alta."; return; }
  const c = Narrator.settings(), out = $("narrRateOut");
  const fmt = v => (+v).toFixed(2).replace(/0$/, "").replace(/\.$/, "").replace(".", ",") + "×";
  $("narrRate").value = c.rate; out.textContent = fmt(c.rate);
  $("narrRate").oninput = e => { out.textContent = fmt(e.target.value); };
  $("narrRate").onchange = e => Narrator.save({ rate: +e.target.value });
  $("narrAuto").checked = !!c.auto; $("narrAuto").onchange = e => Narrator.save({ auto: e.target.checked });
  const list = (await Narrator.voices()).filter(v => v.lang.replace("_", "-").slice(0, 2).toLowerCase() === "pt");
  const sel = $("narrVoice");
  if (!list.length) { sel.add(new Option("Nenhuma voz em português neste aparelho", "")); sel.disabled = true; }
  else {
    sel.add(new Option("Automática (a melhor disponível)", ""));
    list.sort((a, b) => (b.localService - a.localService) || a.name.localeCompare(b.name))
        .forEach(v => sel.add(new Option(v.name + " (" + v.lang + ")" + (v.localService ? "" : " · online"), v.voiceURI)));
    sel.value = (c.voices || {}).pt || "";
    sel.onchange = () => Narrator.save({ voices: { ...(Narrator.settings().voices || {}), pt: sel.value } });
  }
  $("narrTest").onclick = () => Narrator.sample("pt", "Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro.");
}
async function initDict() {
  await Dict.ready;
  const fsel = $("dictFont"), sample = $("dictSample");
  Dict.fonts.forEach(f => fsel.add(new Option(FONT_NAMES[f.id] || f.id, f.id)));
  const paint = () => { const f = Dict.fonts.find(x => x.id === Dict.getFont()) || Dict.fonts[0]; sample.style.fontFamily = f.stack; fsel.value = f.id; };
  paint();
  fsel.onchange = async () => { await Dict.setFont(fsel.value); paint(); };
  const d = (await Dict.list()).find(x => x.id === "figueiredo");
  $("dictOn").checked = !!(d && d.enabled);
  $("dictOn").onchange = e => Dict.setEnabled("figueiredo", e.target.checked);
}
async function renderWorks() {
  const cat = await Library.list(), prog = await Library.progress();
  const imp = $("impList"); imp.replaceChildren();
  cat.works.filter(w => w.imported).forEach(w => {
    const row = el("div"); row.append(el("span", "", w.title + (w.year ? " (" + w.year + ")" : "")));
    const b = el("button", "danger", "Remover"); b.type = "button";
    b.onclick = async () => { if (confirm("Remover “" + w.title + "” deste aparelho?")) { await Library.removeImported(w.id); renderWorks(); } };
    row.append(b); imp.append(row);
  });
  const pl = $("progList"); pl.replaceChildren();
  const ids = Object.keys(prog);
  if (!ids.length) pl.append(el("p", "hint", "Nenhuma leitura começada ainda."));
  ids.forEach(id => {
    const w = cat.works.find(x => x.id === id); if (!w) return;
    const row = el("div"); row.append(el("span", "", w.title + " — " + (prog[id].done ? "concluída" : Library.percent(prog[id], w.chapters) + "%")));
    const b = el("button", "", "Recomeçar"); b.type = "button";
    b.onclick = async () => { if (confirm("Zerar o progresso de “" + w.title + "”?")) { await Library.reset(id); renderWorks(); } };
    row.append(b); pl.append(row);
  });
}
function initWorks() {
  $("impBtn").onclick = () => { $("impFile").value = ""; $("impFile").click(); };
  $("impFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const m = $("impMsg");
    try { const w = await Library.importText(await f.text()); m.className = "hint"; m.textContent = "“" + w.title + "” adicionada à biblioteca (" + w.chapters + " capítulos)."; }
    catch (err) { m.className = "hint err"; m.textContent = err.message || String(err); }
    renderWorks();
  };
  $("resetAll").onclick = async () => { if (confirm("Zerar o progresso de todas as obras?")) { await Library.reset(); renderWorks(); } };
}
(async () => {
  await I18N.ready; I18N.apply();
  $("ver").textContent = "Versão " + chrome.runtime.getManifest().version;
  await initReading(); initWorks(); await renderWorks();
  initNarr(); initDict();
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
})();
