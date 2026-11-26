// Biblioteca do Entrelinhas: tomos (obra completa de um autor), obras, "plus" (fichas e resenhas) e progresso de leitura.
//
// tomos/index.json            { tomos: [ { id, file } ] }                     (file relativo a tomos/)
// tomos/<id>/tomo.json        { format:"entrelinhas-tomo", version:1, id, author, title, life, color, intro,
//                               groups:[{id,name}], works:[{ id, title, year, genre, file?, plus?, chapters?, chars? }] }
//                             file e plus são relativos à pasta do tomo; chars = tamanho do texto (para o "tomo %").
// obra (file)                 { format:"entrelinhas-obra", version:1, id, title, author, year, credit,
//                               chapters:[ { n, title: T, paras:[ T, ... ] } ] }, T = texto ou [grafia atual, grafia original]
// plus                        { format:"entrelinhas-plus", version:1, work, autoria, ficha:[[rótulo, valor]],
//                               resenha:{ antes:[...], depois:[...] }, personagens:[{ nome, tambem, primeira, papel, resumo, fatos:[{cap,t}] }] }
const Library = (() => {
  const PK = "progress", LAST = "lastWork", IMP = "importedWorks";
  let cache = null;
  const mem = {}, plusMem = {};
  const url = p => chrome.runtime.getURL(p);

  async function getJson(path, what) {
    const r = await fetch(url(path));
    if (!r.ok) throw new Error("Não consegui abrir " + what + " (HTTP " + r.status + ").");
    return r.json();
  }

  // ---------- tomos e catálogo ----------
  async function tomos() {
    if (!cache) {
      const idx = await getJson("tomos/index.json", "a lista de tomos");
      cache = [];
      for (const t of idx.tomos || []) {
        try {
          const j = await getJson("tomos/" + t.file, "o tomo " + t.id);
          const base = "tomos/" + t.file.replace(/[^/]*$/, "");
          cache.push({ ...j, base, works: (j.works || []).map(w => ({ ...w, tomo: j.id })) });
        } catch (e) { console.error(e); }
      }
    }
    const out = cache.map(t => ({ ...t, works: t.works.map(w => ({ ...w })) }));
    // obras importadas: vão para o tomo indicado no arquivo, ou para "Outras obras"
    const { [IMP]: imp } = await chrome.storage.local.get(IMP);
    Object.values(imp || {}).forEach(m => {
      const w = { ...m, imported: true };
      let t = out.find(x => x.id === m.tomo);
      if (!t) {
        t = out.find(x => x.id === "_outras");
        if (!t) { t = { id: "_outras", title: "Outras obras", author: "", groups: [{ id: "romance", name: "Romances" }, { id: "contos", name: "Contos" }, { id: "poesia", name: "Poesia" }, { id: "teatro", name: "Teatro" }], works: [] }; out.push(t); }
        w.tomo = "_outras";
      }
      const i = t.works.findIndex(x => x.id === w.id);
      if (i >= 0) t.works[i] = { ...t.works[i], ...w }; else t.works.push(w);
    });
    return out;
  }
  // compatível com a versão anterior: todas as obras numa lista só
  async function list() {
    const ts = await tomos();
    return { groups: (ts[0] && ts[0].groups) || [], works: ts.flatMap(t => t.works) };
  }
  async function find(id) {
    for (const t of await tomos()) { const w = t.works.find(x => x.id === id); if (w) return { tomo: t, work: w }; }
    return null;
  }
  const available = w => !!(w.file || w.imported);

  // ---------- textos ----------
  function check(j) {
    if (!j || j.format !== "entrelinhas-obra" || !Array.isArray(j.chapters) || !j.chapters.length)
      throw new Error("Este arquivo não é uma obra do Entrelinhas (formato “entrelinhas-obra”).");
    j.chapters.forEach((c, i) => { if (!Array.isArray(c.paras)) throw new Error("Capítulo " + (i + 1) + " sem parágrafos."); });
    return j;
  }
  async function work(id) {
    if (mem[id]) return mem[id];
    const f = await find(id);
    if (!f) throw new Error("Obra desconhecida: " + id);
    const w = f.work;
    let j;
    if (w.imported) j = (await chrome.storage.local.get("obra_" + id))["obra_" + id];
    else if (w.file) j = await getJson(f.tomo.base + w.file, "“" + w.title + "”");
    if (!j) throw new Error("“" + w.title + "” ainda não está na biblioteca.");
    return (mem[id] = check(j));
  }
  async function plus(id) {
    if (id in plusMem) return plusMem[id];
    const f = await find(id);
    let j = null;
    if (f && f.work.plus) { try { j = await getJson(f.tomo.base + f.work.plus, "os extras"); } catch (e) { console.error(e); } }
    else if (f && f.work.imported) { j = (await chrome.storage.local.get("plus_" + id))["plus_" + id] || null; }
    return (plusMem[id] = j);
  }
  const pick = (x, orth) => Array.isArray(x) ? (orth === "orig" ? x[1] : x[0]) : x;
  const hasOrig = j => j.chapters.some(c => Array.isArray(c.title) || c.paras.some(Array.isArray));
  const chapLabel = (c, orth) => {
    const t = pick(c.title, orth);
    return c.n ? (t ? c.n + " · " + t : "Capítulo " + c.n) : (t || "");
  };
  // tamanho do texto até o começo de cada capítulo (para o "tomo %")
  function charMap(j) {
    if (j._chars) return j._chars;
    const starts = []; let acc = 0;
    j.chapters.forEach(c => { starts.push(acc); c.paras.forEach(p => { acc += pick(p, "atual").length; }); });
    return (j._chars = { starts, total: acc });
  }

  async function importText(text) {
    let j; try { j = JSON.parse(text); } catch (e) { throw new Error("O arquivo não é um JSON válido."); }
    check(j);
    if (!j.id || !j.title) throw new Error("A obra precisa dos campos id e title.");
    await chrome.storage.local.set({ ["obra_" + j.id]: j });
    const { [IMP]: imp } = await chrome.storage.local.get(IMP);
    const all = imp || {};
    const cm = charMap(j);
    all[j.id] = { id: j.id, title: j.title, year: j.year, genre: j.genre || "romance", tomo: j.tomo || "", chapters: j.chapters.length, chars: cm.total, at: Date.now() };
    await chrome.storage.local.set({ [IMP]: all });
    delete mem[j.id];
    return all[j.id];
  }
  async function removeImported(id) {
    const { [IMP]: imp } = await chrome.storage.local.get(IMP);
    if (!imp || !imp[id]) return;
    delete imp[id];
    await chrome.storage.local.set({ [IMP]: imp });
    await chrome.storage.local.remove(["obra_" + id, "plus_" + id]);
    delete mem[id]; delete plusMem[id];
  }

  // ---------- progresso ----------
  // progress[id] = { ch, p, max, done, rc, tc, at }
  //   ch/p: onde parei (capítulo e parágrafo); max: capítulo mais adiante já alcançado;
  //   rc/tc: texto lido / texto total da obra (caracteres), para o "tomo %"
  async function progress() { return (await chrome.storage.local.get(PK))[PK] || {}; }
  async function setPos(id, ch, p, total, rc, tc) {
    const all = await progress();
    const cur = all[id] || { max: 0 };
    const atEnd = p === "end";
    all[id] = { ch, p: atEnd ? 0 : (p || 0), max: Math.max(cur.max || 0, ch), done: !!(cur.done || atEnd), at: Date.now(),
                rc: atEnd && tc ? tc : (rc != null ? Math.max(rc, cur.done ? (cur.tc || 0) : 0) : cur.rc), tc: tc || cur.tc };
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
  // quanto do tomo já foi lido (fração 0..1), pelo tamanho do texto; live = { id, rc } da obra aberta no leitor
  function tomoFraction(tomo, prog, live) {
    let read = 0, tot = 0, n = 0;
    for (const w of tomo.works) {
      const tc = w.chars || (prog[w.id] && prog[w.id].tc);
      if (!tc) continue;
      n++; tot += tc;
      const pr = prog[w.id];
      if (live && live.id === w.id) read += Math.min(tc, live.rc);
      else if (pr) read += pr.done ? tc : Math.min(tc, pr.rc != null ? pr.rc : (w.chapters ? pr.ch / w.chapters * tc : 0));
    }
    return { frac: tot ? read / tot : 0, works: n };
  }
  function fmtPct(f) {
    const v = f * 100;
    if (v > 0 && v < 10) return v.toFixed(1).replace(".", ",") + "%";
    return Math.floor(v) + "%";
  }

  return { tomos, list, find, available, work, plus, pick, hasOrig, chapLabel, charMap, importText, removeImported,
           progress, setPos, reset, last, percent, tomoFraction, fmtPct };
})();
