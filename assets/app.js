const state = { books: [], kademe: "", sinif: "", ders: "", q: "", onlyQa: false };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const KADEME_ORDER = ["Temel Eğitim", "Ortaöğretim", "Anadolu İmam Hatip Liseleri", "Spor Ortaokulları", "Müzik Okulları"];
const SINIF_ORDER = ["36-48 Ay", "48-60 Ay", "60-72 Ay", "1.Sınıf", "2.Sınıf", "3.Sınıf", "4.Sınıf", "5.Sınıf", "6.Sınıf", "7.Sınıf", "8.Sınıf", "Hazırlık", "9.Sınıf", "10.Sınıf", "11.Sınıf", "12.Sınıf", "Ortaokul Seçmeli Dersler", "Ortaöğretim Seçmeli Dersler"];

const norm = (s) => (s || "").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

async function load() {
  const res = await fetch("data/books.json");
  state.books = await res.json();
  const withQa = state.books.filter((b) => (b.qaCount || 0) + (b.fullCount || 0) > 0).length;
  $("#heroStats").innerHTML =
    `<b>${state.books.length}</b> kitap · <b>${withQa}</b> kitapta soru‑cevap · ` +
    `resmi PDF ve etkileşimli kitap bağlantıları`;
  buildKademe();
  render();
  $("#searchInput").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#sinifSelect").addEventListener("change", (e) => { state.sinif = e.target.value; render(); });
  $("#dersSelect").addEventListener("change", (e) => { state.ders = e.target.value; render(); });
  $("#onlyQa").addEventListener("change", (e) => { state.onlyQa = e.target.checked; render(); });
  $("#clearBtn").addEventListener("click", () => {
    state.kademe = state.sinif = state.ders = state.q = ""; state.onlyQa = false;
    $("#searchInput").value = ""; $("#onlyQa").checked = false; buildKademe(); render();
  });
  $("#brand").addEventListener("click", (e) => { e.preventDefault(); location.reload(); });
}

function buildKademe() {
  const box = $("#kademeChips");
  const all = ["", ...KADEME_ORDER];
  const present = all.filter((k) => k === "" || state.books.some((b) => b.kademe === k));
  box.innerHTML = present.map((k) =>
    `<span class="chip ${state.kademe === k ? "active" : ""}" data-k="${esc(k)}">${k === "" ? "Tümü" : esc(k)}</span>`
  ).join("");
  box.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      state.kademe = c.dataset.k; state.sinif = ""; state.ders = "";
      buildKademe(); render();
    }));
}

function baseFilter() {
  return state.books.filter((b) => {
    if (state.kademe && b.kademe !== state.kademe) return false;
    if (state.sinif && b.sinif !== state.sinif) return false;
    if (state.ders && b.ders !== state.ders) return false;
    if (state.onlyQa && !((b.qaCount || 0) + (b.fullCount || 0) > 0)) return false;
    if (state.q) {
      const hay = norm(b.title + " " + b.ders + " " + b.sinif);
      if (!state.q.split(" ").every((w) => !w || hay.includes(norm(w)))) return false;
    }
    return true;
  });
}

function fillSelects(list) {
  const sinifs = [...new Set(list.map((b) => b.sinif))].sort(
    (a, b) => (SINIF_ORDER.indexOf(a) + 1 || 99) - (SINIF_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b, "tr"));
  const dersler = [...new Set(list.map((b) => b.ders))].sort((a, b) => a.localeCompare(b, "tr"));
  const ss = $("#sinifSelect"), ds = $("#dersSelect");
  ss.innerHTML = `<option value="">Tüm sınıflar</option>` + sinifs.map((s) => `<option ${state.sinif === s ? "selected" : ""} value="${esc(s)}">${esc(s)}</option>`).join("");
  ds.innerHTML = `<option value="">Tüm dersler</option>` + dersler.map((s) => `<option ${state.ders === s ? "selected" : ""} value="${esc(s)}">${esc(s)}</option>`).join("");
}

function card(b) {
  const total = (b.qaCount || 0) + (b.fullCount || 0);
  const qa = total > 0
    ? `<button class="btn qa" data-open="${b.id}">Cevap (${total})</button>`
    : `<button class="btn muted" data-open="${b.id}">Cevap yok</button>`;
  return `<article class="card">
    <div class="cover"><img loading="lazy" src="${esc(b.cover)}" alt="${esc(b.title)}" onerror="this.style.opacity=.15"></div>
    <div class="body">
      <div class="badges">
        <span class="badge">${esc(b.sinif)}</span>
        <span class="badge ders">${esc(b.ders)}</span>
        ${total > 0 ? `<span class="badge qa">${total} soru</span>` : ""}
      </div>
      <h3>${esc(b.title)}</h3>
      <div class="actions">
        ${qa}
        ${b.pdf ? `<button class="btn book" data-book="${b.id}">Kitap (tüm sayfalar)</button>` : ""}
        ${b.pdf ? `<a class="btn pdf" target="_blank" rel="noopener" href="${esc(b.pdf)}">PDF</a>` : ""}
        ${b.interactive ? `<a class="btn" target="_blank" rel="noopener" href="${esc(b.interactive)}">Etkileşimli</a>` : ""}
      </div>
    </div>
  </article>`;
}

function render() {
  const all = state.books.filter((b) => !state.kademe || b.kademe === state.kademe);
  fillSelects(all.filter((b) => !state.sinif || b.sinif === state.sinif));
  const list = baseFilter().sort((a, b) =>
    (SINIF_ORDER.indexOf(a.sinif) + 1 || 99) - (SINIF_ORDER.indexOf(b.sinif) + 1 || 99) ||
    a.ders.localeCompare(b.ders, "tr") || a.title.localeCompare(b.title, "tr"));
  $("#count").textContent = `${list.length} kitap`;
  const grid = $("#grid");
  grid.innerHTML = list.slice(0, 600).map(card).join("");
  $("#empty").hidden = list.length > 0;
  grid.querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", () => openBook(+el.dataset.open)));
  grid.querySelectorAll("[data-book]").forEach((el) =>
    el.addEventListener("click", () => openBookViewer(+el.dataset.book)));
}

async function openBook(id) {
  const b = state.books.find((x) => x.id === id);
  const modal = $("#modal");
  const body = $("#modalBody");
  body.innerHTML = `<div class="modal-head">
      <img src="${esc(b.cover)}" alt="" onerror="this.style.opacity=.15">
      <div>
        <h2>${esc(b.title)}</h2>
        <div class="badges"><span class="badge">${esc(b.kademe)}</span><span class="badge">${esc(b.sinif)}</span><span class="badge ders">${esc(b.ders)}</span></div>
        <div class="modal-actions">
          ${b.pdf ? `<button class="btn book" id="openBookFull">Kitabı tüm sayfalarda aç</button>` : ""}
          ${b.pdf ? `<a class="btn pdf" target="_blank" rel="noopener" href="${esc(b.pdf)}">PDF indir / aç</a>` : ""}
          ${b.interactive ? `<a class="btn" target="_blank" rel="noopener" href="${esc(b.interactive)}">Etkileşimli Kitap</a>` : ""}
          ${b.detail ? `<a class="btn" target="_blank" rel="noopener" href="${esc(b.detail)}">MEB sayfası</a>` : ""}
        </div>
      </div>
    </div>
    <div id="qaArea">${(b.qaCount || 0) + (b.fullCount || 0) > 0 ? "Sorular yükleniyor…" : `<div class="noqa">Bu kitap için henüz soru‑cevap hazırlanmadı. PDF ve etkileşimli kitaba yukarıdan ulaşabilirsiniz.</div>`}</div>`;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  modal.querySelectorAll("[data-close]").forEach((el) => el.onclick = closeModal);
  const fullBtn = modal.querySelector("#openBookFull");
  if (fullBtn) fullBtn.onclick = () => openBookViewer(b.id);
  document.addEventListener("keydown", escClose);
  if ((b.qaCount || 0) + (b.fullCount || 0) > 0) {
    try {
      const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [curated, full] = await Promise.all([
        b.qaCount > 0 ? getJson(`data/qa/${b.id}.json`) : Promise.resolve(null),
        b.fullCount > 0 ? getJson(`data/qa_full/${b.id}.json`) : Promise.resolve(null),
      ]);
      const blocks = [];
      if (curated) for (const u of (curated.units || [])) blocks.push(u);
      if (curated && !(curated.units || []).length && curated.questions?.length)
        blocks.push({ name: "Sorular", questions: curated.questions });
      if (full && full.pages) {
        const pages = Object.keys(full.pages)
          .map(Number).sort((a, b2) => a - b2);
        for (const p of pages) {
          const qs = (full.pages[String(p)] || []).filter((x) => x.q);
          if (qs.length) blocks.push({ name: `Sayfa ${p}`, questions: qs.map((x) => ({ ...x, page: p })) });
        }
      }
      renderQa(blocks, b);
    } catch (e) {
      $("#qaArea").innerHTML = `<div class="noqa">Sorular yüklenemedi.</div>`;
    }
  }
}

let viewCtx = null;

function renderQa(blocks, book) {
  const area = $("#qaArea");
  if (!area) return;
  blocks = blocks || [];
  if (!blocks.length) { area.innerHTML = `<div class="noqa">Soru bulunamadı.</div>`; return; }
  viewCtx = { book, blocks };
  area.innerHTML = blocks.map((u, ui) => `<section class="unit">
      <h4>${esc(u.name)}</h4>
      ${(u.questions || []).map((x, qi) => `<div class="qa">
          ${x.image ? `<img class="qa-img" loading="lazy" data-u="${ui}" data-q="${qi}" src="${esc(x.image)}" alt="">` : ""}
          <p class="q">${esc(x.q)}</p>
          <p class="a"><b>Cevap:</b> ${esc(x.a || "—")}</p>
          <div class="qa-foot">
            ${x.page ? `<span class="tag">Sayfa ${x.page}</span>` : `<span></span>`}
            <button class="btn open-full" data-u="${ui}" data-q="${qi}">Tam ekran</button>
          </div>
        </div>`).join("")}
    </section>`).join("");
  area.querySelectorAll(".open-full").forEach((el) =>
    el.addEventListener("click", () => openViewer(+el.dataset.u, +el.dataset.q)));
  area.querySelectorAll(".qa-img").forEach((el) =>
    el.addEventListener("click", () => openViewer(+el.dataset.u, +el.dataset.q)));
}

function openViewer(ui, qi) {
  if (!viewCtx) return;
  const unit = viewCtx.blocks[ui];
  const x = (unit.questions || [])[qi];
  if (!x) return;
  const title = [viewCtx.book?.title, unit.name].filter(Boolean).join(" · ");
  $("#viewerTitle").textContent = title;
  $("#viewerStage").innerHTML = `<div class="viewer-page">
      ${x.image ? `<img class="viewer-img" src="${esc(x.image)}" alt="">` : ""}
      <div class="viewer-text">
        <p class="vq">${esc(x.q)}</p>
        <p class="va"><b>Cevap:</b> ${esc(x.a)}</p>
        <div class="viewer-foot">
          ${x.page ? `<span class="tag">Sayfa ${x.page}</span>` : "<span></span>"}
          ${(x.page && viewCtx.book?.pdf) ? `<button class="btn book" id="viewerOpenPage">Kitapta bu sayfayı aç</button>` : ""}
        </div>
      </div>
    </div>`;
  const opb = $("#viewerOpenPage");
  if (opb) opb.onclick = () => openBookViewer(viewCtx.book.id, x.page);
  $("#viewer").hidden = false;
  document.body.style.overflow = "hidden";
  $("#viewerClose").onclick = closeViewer;
  $("#viewer").onclick = (e) => { if (e.target.id === "viewer") closeViewer(); };
}

function closeViewer() {
  const v = $("#viewer");
  if (!v || v.hidden) return false;
  v.hidden = true;
  if ($("#modal").hidden && $("#bookViewer").hidden) document.body.style.overflow = "";
  return true;
}

function openBookViewer(id, page) {
  const b = state.books.find((x) => x.id === id);
  if (!b || !b.pdf) return;
  $("#bviewerTitle").textContent = b.title;
  $("#bviewerPdf").href = b.pdf;
  const frame = $("#bviewerFrame");
  frame.src = "about:blank";
  const url = b.pdf + (page ? `#page=${page}` : "");
  setTimeout(() => { frame.src = url; }, 40);
  $("#bookViewer").hidden = false;
  document.body.style.overflow = "hidden";
  $("#bviewerClose").onclick = closeBookViewer;
}

function closeBookViewer() {
  const v = $("#bookViewer");
  if (!v || v.hidden) return false;
  v.hidden = true;
  $("#bviewerFrame").src = "about:blank";
  if ($("#modal").hidden && $("#viewer").hidden) document.body.style.overflow = "";
  return true;
}

function closeModal() {
  closeViewer();
  closeBookViewer();
  $("#modal").hidden = true;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", escClose);
}
function escClose(e) {
  if (e.key !== "Escape") return;
  if (closeViewer()) return;
  if (closeBookViewer()) return;
  closeModal();
}

load();
