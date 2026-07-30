/* app.js — UI 로직 */
"use strict";

/* ---------- 탭 ---------- */
document.querySelectorAll(".navbtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".navbtn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

/* ---------- 드롭존 ---------- */
const dz = document.getElementById("dropzone");
const resultsEl = document.getElementById("results");

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.multiple = true;
fileInput.accept = ".jpg,.jpeg,.arw,.nef,.nrw,.pef,.raf,.cr2,.cr3,.dng,.tif,.tiff";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

dz.addEventListener("click", () => { fileInput.value = ""; fileInput.click(); });
dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

["dragover", "dragenter"].forEach(ev => dz.addEventListener(ev, e => {
  e.preventDefault(); dz.classList.add("dragover");
}));
["dragleave", "dragend"].forEach(ev => dz.addEventListener(ev, e => {
  e.preventDefault(); dz.classList.remove("dragover");
}));
dz.addEventListener("drop", e => {
  e.preventDefault(); dz.classList.remove("dragover");
  if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

async function handleFiles(fileList) {
  for (const file of Array.from(fileList)) {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `<div class="file">${escapeHtml(file.name)}</div><div class="meta">분석 중…</div>`;
    resultsEl.prepend(card);
    try {
      const parsed = await parseImageFile(file);
      const r = extractShutterCount(parsed);
      renderResult(card, file, parsed, r);
    } catch (err) {
      renderError(card, file, err.message || String(err));
    }
  }
}

function renderResult(card, file, parsed, r) {
  const badge =
    r.status === "ok" ? `<span class="badge ok">판독 성공</span>` :
    r.status === "warn" ? `<span class="badge warn">실험적 지원</span>` :
    r.status === "unsupported" ? `<span class="badge warn">미지원</span>` :
    `<span class="badge err">판독 실패</span>`;

  const modelName = [parsed.make, parsed.model].filter(Boolean).join(" ") || "기종 정보 없음";
  let html = `
    <div class="file">${escapeHtml(file.name)} · ${escapeHtml(parsed.container)}</div>
    <div class="model-line">
      <span class="model">${escapeHtml(modelName)}</span>
      ${badge}
    </div>`;

  if (r.count != null) {
    html += `
      <div class="count-line">
        <span class="count-num">${r.count.toLocaleString("ko-KR")}</span>
        <span class="count-label">${escapeHtml(r.countLabel || "셔터 카운트")}</span>
      </div>`;
    if (r.extras) {
      html += r.extras.map(x =>
        `<div class="sub-counts">${escapeHtml(x.label)}: <b>${x.value.toLocaleString("ko-KR")}</b></div>`).join("");
    }
  }
  if (parsed.dateTime) {
    html += `<div class="meta">촬영 일시: ${escapeHtml(parsed.dateTime)}</div>`;
  }
  if (r.notes && r.notes.length) {
    html += `<div class="result-note">${r.notes.map(escapeHtml).join("<br>")}</div>`;
  }
  card.innerHTML = html;
}

function renderError(card, file, message) {
  card.innerHTML = `
    <div class="file">${escapeHtml(file.name)}</div>
    <div class="model-line"><span class="model">읽기 실패</span><span class="badge err">오류</span></div>
    <div class="result-note">${escapeHtml(message)}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- 지원 카메라 목록 렌더 ---------- */
(function renderSupported() {
  const root = document.getElementById("supportedList");
  const data = supportedSummary();
  for (const cat in data) {
    const div = document.createElement("div");
    div.className = "cat";
    let html = `<h3>${escapeHtml(cat)}</h3>`;
    for (const sub in data[cat]) {
      html += `<h4>${escapeHtml(sub)}</h4><ul>` +
        data[cat][sub].map(m => `<li>${escapeHtml(m)}</li>`).join("") + `</ul>`;
    }
    div.innerHTML = html;
    root.appendChild(div);
  }
})();
