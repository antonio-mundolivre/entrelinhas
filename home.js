// Biblioteca (tela inicial) do Entrelinhas
const $ = id => document.getElementById(id);
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
const open = (id, cap) => { location.href = "reader.html?obra=" + encodeURIComponent(id) + (cap != null ? "&cap=" + cap : ""); };

async function render() {
  const cat = await Library.list(), prog = await Library.progress(), lastId = await Library.last();
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
  // estantes
  const box = $("shelves"); box.replaceChildren();
  for (const g of cat.groups) {
    const ws = cat.works.filter(w => w.genre === g.id);
    if (!ws.length) continue;
    box.append(el("h2", "", g.name));
    const shelf = el("div", "shelf");
    ws.forEach(w => {
      const b = el("button", "work"); b.type = "button";
      const t = el("div", "wt");
      t.append(el("div", "wname", w.title), el("div", "wmeta", [w.year, w.chapters ? w.chapters + " capítulos" : "", w.imported ? "importada" : ""].filter(Boolean).join(" · ")));
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
