/* app.js — UI 로직 (감정서 디자인) */
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
const dzCode = document.getElementById("dzCode");
const resultsEl = document.getElementById("results");
const resultsSection = document.getElementById("resultsSection");
const resultsCount = document.getElementById("resultsCount");

const DZ_CODE_IDLE = "ORIGINAL FILES ONLY";
const DZ_CODE_DRAG = "놓으면 바로 감정합니다";

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
  e.preventDefault(); dz.classList.add("dragover"); dzCode.textContent = DZ_CODE_DRAG;
}));
["dragleave", "dragend"].forEach(ev => dz.addEventListener(ev, e => {
  e.preventDefault(); dz.classList.remove("dragover"); dzCode.textContent = DZ_CODE_IDLE;
}));
dz.addEventListener("drop", e => {
  e.preventDefault(); dz.classList.remove("dragover"); dzCode.textContent = DZ_CODE_IDLE;
  if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

/* ---------- 결과 목록 ---------- */
let resultSeq = 0; // 오래된 결과가 No. 01

function updateResultsMeta() {
  const n = resultsEl.children.length;
  resultsSection.classList.toggle("has-items", n > 0);
  resultsCount.textContent = "총 " + n + "건";
}

async function handleFiles(fileList) {
  for (const file of Array.from(fileList)) {
    const no = String(++resultSeq).padStart(2, "0");
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = cardHtml({
      no, badgeClass: "", badge: "분석 중",
      model: escapeHtml(file.name),
      rows: [row("파일", file.name), row("형식", null), row("촬영 일시", null)],
      right: "",
    });
    resultsEl.prepend(card);
    updateResultsMeta();
    try {
      const parsed = await parseImageFile(file);
      const r = extractShutterCount(parsed);
      renderResult(card, no, file, parsed, r);
    } catch (err) {
      renderError(card, no, file, err.message || String(err));
    }
  }
}

/* 스탬프 상태 매핑 */
function stampOf(status) {
  if (status === "ok") return { cls: "ok", text: "판독 성공" };
  if (status === "warn") return { cls: "warn", text: "실험적 지원" };
  if (status === "unsupported") return { cls: "warn", text: "미지원" };
  return { cls: "err", text: "판독 실패" };
}

function row(k, v, mono = true) {
  const val = v == null || v === "" ? "—" : v;
  return `<div class="info-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(val)}</span></div>`;
}

function scaleHtml(count) {
  const left = Math.min(100, count / 500000 * 100);
  return `
    <div class="scale">
      <div class="scale-caption">제조사 내구 기준 대비 위치</div>
      <div class="scale-track">
        <div class="scale-base"></div>
        <div class="scale-band b1"></div>
        <div class="scale-band b2"></div>
        <div class="scale-band b3"></div>
        <div class="scale-mark" style="left:${left}%"></div>
      </div>
      <div class="scale-labels">
        <span class="l1">보급기 5~10만</span>
        <span class="l2">중급기 15~20만</span>
        <span class="l3">플래그십 30~50만</span>
      </div>
    </div>`;
}

function cardHtml({ no, badgeClass, badge, model, rows, right }) {
  return `
    <div class="stamp ${badgeClass}"><div class="stamp-inner">${escapeHtml(badge)}</div></div>
    <div class="card-left">
      <div class="card-no">No. ${no}</div>
      <div class="card-model">${model}</div>
      <div class="info-table">${rows.join("")}</div>
    </div>
    <div class="card-right">${right}</div>`;
}

function renderResult(card, no, file, parsed, r) {
  const stamp = stampOf(r.status);
  const modelName = [parsed.make, parsed.model].filter(Boolean).join(" ") || "기종 정보 없음";

  const rows = [
    row("파일", file.name),
    row("형식", parsed.container),
    row("촬영 일시", parsed.dateTime),
  ];
  if (r.extras) {
    for (const x of r.extras) rows.push(row(x.label, Number(x.value).toLocaleString("ko-KR")));
  }

  let right = "";
  if (r.count != null) {
    right += `
      <div class="count-label">${escapeHtml(r.countLabel || "셔터 카운트")}</div>
      <div class="count-line"><span class="count-num">${r.count.toLocaleString("ko-KR")}</span><span class="count-unit">회</span></div>
      ${scaleHtml(r.count)}`;
  }
  if (r.notes && r.notes.length) {
    right += r.notes.map(n => `<div class="result-note">※ ${escapeHtml(n)}</div>`).join("");
  }

  card.innerHTML = cardHtml({
    no, badgeClass: stamp.cls, badge: stamp.text,
    model: escapeHtml(modelName), rows, right,
  });
}

function renderError(card, no, file, message) {
  card.innerHTML = cardHtml({
    no, badgeClass: "err", badge: "오류",
    model: "읽기 실패",
    rows: [row("파일", file.name), row("형식", null), row("촬영 일시", null)],
    right: `<div class="result-note">※ ${escapeHtml(message)}</div>`,
  });
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
    let html = `<div class="cat-name">${escapeHtml(cat)}</div>`;
    for (const sub in data[cat]) {
      html += `<div class="sub-name">${escapeHtml(sub)}</div>` +
        data[cat][sub].map(m => `<div class="model">${escapeHtml(m)}</div>`).join("");
    }
    div.innerHTML = html;
    root.appendChild(div);
  }
})();
