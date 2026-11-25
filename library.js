// Biblioteca do Entrelinhas: catálogo de obras, textos e progresso de leitura.
// Pacote de obra (obras/<id>.json): { format:"entrelinhas-obra", version:1, id, title, author, year, genre, source, orthography, credit,
//   chapters:[ { n:"I", title: T, paras:[ T, ... ] } ] }   onde T é um texto ou um par [grafia atual, grafia original].
const Library = (() => {
  const PK = "progress", LAST = "lastWork", IMP = "importedWorks";
  let catalog = null;
  const mem = {};

  // ---------- catálogo ----------
  async function list() {
    if (!catalog) {
      const r = await fetch(chrome.runtime.getURL("obras/index.json"));
      if (!r.ok) throw new Error("Não consegui abrir o catálogo de obras (HTTP " + r.status + ").");
      catalog = await r.json();
    }
    const { [IMP]: imp } = await chrome.storage.local.get(IMP);
    const works = catalog.works.map(w => ({ ...w }));
    Object.values(imp || {}).forEach(m => {
      const i = works.findIndex(w => w.id === m.id);
      const w = { ...m, imported: true };
      if (i >= 0) works[i] = { ...works[i], ...w }; else works.push(w);
    });
    return { ...catalog, works };
  }
  const available = w => !!(w.file || w.imported);

  // ---------- textos ----------
  function check(j) {
    if (!j || j.format !== "entrelinhas-obra" || !Array.isArray(j.chapters) || !j.chapters.length)
      throw new Error("Este arquivo não é uma obra do Entrelinhas (formato “entrelinhas-obra”).");
    j.chapters.forEach((c, i) => {
      if (!Array.isArray(c.paras)) throw new Error("Capítulo " + (i + 1) + " sem parágrafos.");
    });
    return j;
  }
  async function work(id) {
    if (mem[id]) return mem[id];
    const c = await list();
    const w = c.works.find(x => x.id === id);
    if (!w) throw new Error("Obra desconhecida: " + id);
    let j;
    if (w.imported) j = (await chrome.storage.local.get("obra_" + id))["obra_" + id];
    else if (w.file) {
      const r = await fetch(chrome.runtime.getURL("obras/" + w.file));
      if (!r.ok) throw new Error("Não consegui abrir “" + w.title + "” (HTTP " + r.status + ").");
      j = await r.json();
    }
    if (!j) throw new Error("“" + w.title + "” ainda não está na biblioteca.");
    return (mem[id] = check(j));
  }
  // texto de um parágrafo/título na grafia pedida ("atual" ou "orig")
  const pick = (x, orth) => Array.isArray(x) ? (orth === "orig" ? x[1] : x[0]) : x;
  const hasOrig = j => j.chapters.some(c => Array.isArray(c.title) || c.paras.some(Array.isArray));
  const chapLabel = (c, orth) => {
    const t = pick(c.title, orth);
    return c.n ? (t ? c.n + " · " + t : "Capítulo " + c.n) : (t || "");
  };

  async function importText(text) {
    let j; try { j = JSON.parse(text); } catch (e) { throw new Error("O arquivo não é um JSON válido."); }
    check(j);
    if (!j.id || !j.title) throw new Error("A obra precisa dos campos id e title.");
    await chrome.storage.local.set({ ["obra_" + j.id]: j });
    const { [IMP]: imp } = await chrome.storage.local.get(IMP);
    const all = imp || {};
    all[j.id] = { id: j.id, title: j.title, year: j.year, genre: j.genre || "romance", chapters: j.chapters.length, at: Date.now() };
    await chrome.storage.local.set({ [IMP]: all });
    delete mem[j.id];
    return all[j.id];
  }
  async function removeImported(id) {
    const { [IMP]: imp } = await chrome.storage.local.get(IMP);
    if (!imp || !imp[id]) return;
    delete imp[id];
    await chrome.storage.local.set({ [IMP]: imp });
    await chrome.storage.local.remove("obra_" + id);
    delete mem[id];
  }

  // ---------- progresso ----------
  // progress[id] = { ch, p, max, done, at }   ch/p: onde parei (capítulo e parágrafo); max: capítulo mais adiante já alcançado
  async function progress() { return (await chrome.storage.local.get(PK))[PK] || {}; }
  async function setPos(id, ch, p, total) {
    const all = await progress();
    const cur = all[id] || { max: 0 };
    const atEnd = p === "end";
    all[id] = { ch, p: p === "end" ? 0 : (p || 0), max: Math.max(cur.max || 0, ch), done: !!(cur.done || atEnd), at: Date.now() };
    await chrome.storage.local.set({ [PK]: all, [LAST]: id });
    return all[id];
  }
  async function reset(id) {
    const all = await progress();
    if (id) delete all[id]; else Object.keys(all).forEach(k => delete all[k]);
    await chrome.storage.local.set({ [PK]: all });
  }
  async function last() { return (await chrome.storage.local.get(LAST))[LAST] || null; }
  function percent(pr, total) {
    if (!pr || !total) return 0;
    if (pr.done) return 100;
    return Math.min(99, Math.round(Math.max(pr.ch, pr.max || 0) / total * 100));
  }

  return { list, available, work, pick, hasOrig, chapLabel, importText, removeImported, progress, setPos, reset, last, percent };
})();
