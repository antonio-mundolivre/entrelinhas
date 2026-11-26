// Biblioteca (tela inicial) do Entrelinhas
const $ = id => document.getElementById(id);
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
const open = (id, cap) => { location.href = "reader.html?obra=" + encodeURIComponent(id) + (cap != null ? "&cap=" + cap : ""); };

async function render() {
  const cat = await Library.list(), prog = await Library.progress(), lastId = await Library.last();
  $("cont").hidden = true;
  // continuar lendo
  const lw = lastId && cat.works.find(w => w.id === lastId && Library.available(w));
  if (lw && prog[lw.id]) {
    const pr = prog[lw.id];
    let where = "";
    try {
      const j = await Library.work(lw.id);
      const c = j.chapters[pr.ch];
      where = pr.done ? "Leitura concluída" : (c ? Library.chapLabel(c, "atual") : "");
      lw.chapters = j.chapters.length;
    } catch (e) { where = ""; }
    $("contTitle").textContent = lw.title;
    $("contWhere").textContent = where + (lw.chapters && !pr.done ? " · " + Library.percent(pr, lw.chapters) + "%" : "");
    $("contBar").style.width = Library.percent(pr, lw.chapters) + "%";
    $("contBtn").textContent = pr.done ? "Ler de novo" : "Continuar";
    $("contBtn").onclick = () => open(lw.id, pr.done ? 0 : null);
    $("cont").hidden = false;
  }
  // tomos: uma aba por tomo (quando houver mais de um), cabeçalho do tomo e as estantes
  const ts = await Library.tomos();
  let sel = sessionStorage.getItem("tomo") || (lw && lw.tomo) || (ts[0] && ts[0].id);
  if (!ts.some(t => t.id === sel)) sel = ts[0] && ts[0].id;
  const tabs = $("tomoTabs"); tabs.replaceChildren();
  tabs.hidden = ts.length < 2;
  ts.forEach(t => {
    const b = el("button", "tomotab" + (t.id === sel ? " on" : ""), t.author || t.title); b.type = "button";
    b.onclick = () => { sessionStorage.setItem("tomo", t.id); render(); };
    tabs.append(b);
  });
  const tomo = ts.find(t => t.id === sel);
  const head = $("tomoHead"); head.replaceChildren();
  if (tomo) {
    const avail = tomo.works.filter(Library.available).length;
    const tf = Library.tomoFraction(tomo, prog);
    head.append(el("div", "tlabel", "Tomo"), el("div", "tname", tomo.author || tomo.title), el("div", "tlife", tomo.life || ""));
    if (tomo.intro) head.append(el("p", "tintro", tomo.intro));
    const bar = el("div", "bar"); const fill = el("div"); fill.style.width = (tf.frac * 100).toFixed(1) + "%"; bar.append(fill);
    head.append(bar, el("div", "tstat", Library.fmtPct(tf.frac) + " do tomo lido · " + avail + " de " + tomo.works.length + " obras já na biblioteca"));
  }
  const box = $("shelves"); box.replaceChildren();
  for (const g of (tomo ? tomo.groups : [])) {
    const ws = tomo.works.filter(w => w.genre === g.id);
    if (!ws.length) continue;
    box.append(el("h2", "", g.name));
    const shelf = el("div", "shelf");
    ws.forEach(w => {
      const b = el("button", "work"); b.type = "button";
      const t = el("div", "wt");
      const extras = [w.year, w.chapters ? w.chapters + " capítulos" : "", w.plus ? "com personagens e resenha" : "", w.imported ? "importada" : ""].filter(Boolean).join(" · ");
      t.append(el("div", "wname", w.title), el("div", "wmeta", extras));
      b.append(t);
      if (Library.available(w)) {
        const pr = prog[w.id], pct = Library.percent(pr, w.chapters);
        if (pr) { const r = el("div", "ring"); r.style.setProperty("--p", pct); r.title = pct + "% lido"; b.append(r); }
        b.append(el("div", "wstat" + (pr ? " on" : ""), pr ? (pr.done ? "lido" : pct + "%") : "ler"));
        b.onclick = () => open(w.id);
      } else {
        b.disabled = true;
        b.append(el("span", "soon", "em preparo"));
      }
      shelf.append(b);
    });
    box.append(shelf);
  }
}
(async () => { await I18N.ready; await render(); })();
