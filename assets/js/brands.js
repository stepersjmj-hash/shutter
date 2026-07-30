/* brands.js — 브랜드별 셔터 카운트 추출 로직
   오프셋/알고리즘 출처: ExifTool(Sony.pm, Nikon.pm, Pentax.pm, FujiFilm.pm, Canon.pm) 문서화된 태그 정의 */
"use strict";

/* ---------- 공용: 임의 base/endian IFD 파서 (MakerNote 내부용) ---------- */
function parseIfdRaw(bytes, ifdAbs, le, valueBaseAbs) {
  const u16 = a => le ? bytes[a] | (bytes[a + 1] << 8) : (bytes[a] << 8) | bytes[a + 1];
  const u32 = a => le
    ? (bytes[a] | (bytes[a + 1] << 8) | (bytes[a + 2] << 16) | (bytes[a + 3] << 24)) >>> 0
    : ((bytes[a] << 24) | (bytes[a + 1] << 16) | (bytes[a + 2] << 8) | bytes[a + 3]) >>> 0;
  const entries = [];
  if (ifdAbs + 2 > bytes.length) return entries;
  const n = u16(ifdAbs);
  let p = ifdAbs + 2;
  for (let i = 0; i < n && p + 12 <= bytes.length; i++, p += 12) {
    const tag = u16(p);
    const format = u16(p + 2);
    const count = u32(p + 4);
    const unit = TIFF_FMT_SIZE[format] || 1;
    const byteLen = unit * count;
    const valueAbs = byteLen <= 4 ? p + 8 : valueBaseAbs + u32(p + 8);
    entries.push({ tag, format, count, byteLen, valueAbs });
  }
  return entries;
}
const _leU16 = (b, a) => b[a] | (b[a + 1] << 8);
const _leU24 = (b, a) => b[a] | (b[a + 1] << 8) | (b[a + 2] << 16);
const _leU32 = (b, a) => (b[a] | (b[a + 1] << 8) | (b[a + 2] << 16) | (b[a + 3] << 24)) >>> 0;
const _beU32 = (b, a) => ((b[a] << 24) | (b[a + 1] << 16) | (b[a + 2] << 8) | b[a + 3]) >>> 0;

/* =========================================================
   SONY
   ========================================================= */
const SONY_GROUPS = {
  // 구형 A-mount DSLR: 태그 0x0020 블롭, 카운터 @0x0846
  OLD_DSLR: ["DSLR-A230","DSLR-A290","DSLR-A330","DSLR-A380","DSLR-A390","DSLR-A850","DSLR-A900"],
  // A450/500/550: 태그 0x0020 → 서브태그 0x0201 → @330
  DSL5: ["DSLR-A450","DSLR-A500","DSLR-A550"],
  // A55 세대 + 초기 NEX: 서브태그 0x0201 → 노출 @283 / 셔터 @293
  DSLT: ["DSLR-A560","DSLR-A580","NEX-3","NEX-C3","NEX-5","SLT-A33","SLT-A35","SLT-A55","SLT-A55V"],
  // Tag9050a: 카운터 @0x32
  T9050A: ["NEX-F3","NEX-3N","NEX-5N","NEX-5R","NEX-5T","NEX-6","NEX-7",
    "SLT-A37","SLT-A57","SLT-A58","SLT-A65","SLT-A65V","SLT-A77","SLT-A77V","SLT-A99","SLT-A99V",
    "ILCA-68","ILCA-77M2",
    "ILCE-3000","ILCE-3500","ILCE-5000","ILCE-5100","ILCE-6000","ILCE-6001",
    "ILCE-7","ILCE-7M2","ILCE-7R","ILCE-7S","ILCE-QX1"],
  // Tag9050b: 카운터 @0x3A
  T9050B: ["ILCE-6100","ILCE-6100A","ILCE-6300","ILCE-6400","ILCE-6400A","ILCE-6500","ILCE-6600",
    "ILCE-7C","ILCE-7M3","ILCE-7RM2","ILCE-7RM3","ILCE-7RM3A","ILCE-7RM4","ILCE-7RM4A",
    "ILCE-7SM2","ILCE-9","ILCE-9M2","ILCA-99M2","ZV-E10"],
  // Tag9050c: 카운터 @0x3A
  T9050C: ["ILCE-1","ILCE-7M4","ILCE-7M4A","ILCE-7RM5","ILCE-7SM3","ILME-FX3"],
  // Tag9050d: 카운터 @0x0A (기계식 셔터 사용 시에만 기록)
  T9050D: ["ILCE-6700","ILCE-7CM2","ILCE-7CR","ILCE-1M2","ILCE-7M5","ILCE-7RM6",
    "ZV-E1","ZV-E10M2","ILME-FX2"],
};
const SONY_NO_MECH = ["ILCE-9M3"]; // 글로벌 셔터: 기계식 셔터 없음

let _sonyInv = null;
function sonyDecipherTable() {
  if (_sonyInv) return _sonyInv;
  _sonyInv = new Uint8Array(256);
  for (let i = 0; i < 249; i++) _sonyInv[(i * i * i) % 249] = i;
  for (let i = 249; i < 256; i++) _sonyInv[i] = i;
  return _sonyInv;
}

function sonyGroupOf(model) {
  for (const g in SONY_GROUPS) if (SONY_GROUPS[g].includes(model)) return g;
  return null;
}

function extractSony(parsed) {
  const { tiff, model, makerNote } = parsed;
  const notes = [];
  if (SONY_NO_MECH.includes(model)) {
    return { status: "unsupported", notes: ["이 기종은 글로벌(전자식) 셔터 전용이라 기계식 셔터 카운트 개념이 없습니다."] };
  }
  const group = sonyGroupOf(model);
  if (!group) {
    return { status: "unsupported", notes: ["이 소니 기종의 저장 위치가 아직 알려지지 않았습니다. (신기종이거나 컴팩트 기종일 수 있음)"] };
  }
  if (!makerNote || !makerNote.entry) {
    return { status: "error", notes: ["MakerNote가 없습니다. 원본 파일인지 확인하세요."] };
  }
  const b = tiff.b;
  // Sony MakerNote: "SONY ..." 12바이트 헤더가 있으면 건너뜀, IFD 오프셋은 메인 TIFF 기준
  let ifdAbs = makerNote.entry.valueAbs;
  if (startsWithAscii(b, ifdAbs, "SONY")) ifdAbs += 12;
  const entries = parseIfdRaw(b, ifdAbs, tiff.le, tiff.base);

  const find = t => entries.find(e => e.tag === t) || null;

  if (group === "T9050A" || group === "T9050B" || group === "T9050C" || group === "T9050D") {
    const e = find(0x9050);
    if (!e) return { status: "error", notes: ["0x9050 태그가 없습니다. 원본 파일인지 확인하세요."] };
    const off = group === "T9050A" ? 0x32 : group === "T9050D" ? 0x0a : 0x3a;
    if (e.byteLen < off + 3) return { status: "error", notes: ["MakerNote 데이터가 예상보다 짧습니다."] };
    const inv = sonyDecipherTable();
    const a = e.valueAbs + off;
    const count = inv[b[a]] | (inv[b[a + 1]] << 8) | (inv[b[a + 2]] << 16);
    if (group === "T9050D") notes.push("이 세대는 기계식 셔터로 촬영한 사진에만 카운트가 기록됩니다. (전자셔터 촬영 파일이면 0 또는 무효)");
    else notes.push("무음(전자식) 셔터 촬영은 카운트에 포함되지 않습니다.");
    if (count === 0) notes.push("값이 0입니다 — 전자셔터로 촬영된 파일일 수 있으니 기계식 셔터 사진으로 다시 시도해 보세요.");
    return { status: "ok", count, countLabel: "기계식 셔터 작동 횟수", notes };
  }

  // 이하 구형 기종: 태그 0x0020
  const e20 = find(0x0020);
  if (!e20) return { status: "error", notes: ["0x0020 태그가 없습니다. 원본 파일인지 확인하세요."] };

  if (group === "OLD_DSLR") {
    if (e20.byteLen < 0x846 + 3) return { status: "error", notes: ["데이터가 예상보다 짧습니다."] };
    const count = _leU24(b, e20.valueAbs + 0x846);
    return { status: "ok", count, countLabel: "셔터 작동 횟수", notes };
  }

  // DSL5 / DSLT: 블롭 내부에 [태그16][오프셋16] 형태의 서브 디렉터리
  const tStart = e20.valueAbs;
  const subCount = _leU16(b, tStart);
  let p = tStart + 4;
  let subOff = -1;
  for (let i = 0; i < subCount && p + 4 <= b.length; i++, p += 4) {
    if (_leU16(b, p) === 0x0201) { subOff = _leU16(b, p + 2); break; }
  }
  if (subOff < 0) return { status: "error", notes: ["서브태그 0x0201을 찾지 못했습니다."] };

  if (group === "DSL5") {
    const count = _leU24(b, tStart + subOff + 330);
    return { status: "ok", count, countLabel: "셔터 작동 횟수", notes };
  }
  // DSLT: 노출 횟수 + 셔터 횟수(라이브뷰 이중 동작으로 더 큼)
  const exposures = _leU24(b, tStart + subOff + 283);
  const shutter = _leU24(b, tStart + subOff + 293);
  notes.push("이 세대는 라이브뷰 구조상 셔터가 촬영당 2회 동작해 셔터 횟수가 노출 횟수보다 큽니다.");
  return {
    status: "ok", count: exposures, countLabel: "노출 횟수 (촬영 매수)",
    extras: [{ label: "기계식 셔터 동작 횟수", value: shutter }], notes,
  };
}

/* =========================================================
   NIKON — MakerNote 태그 0x00A7 (int32u, 평문)
   ========================================================= */
function extractNikon(parsed) {
  const { tiff, makerNote } = parsed;
  if (!makerNote || !makerNote.entry) {
    return { status: "error", notes: ["MakerNote가 없습니다. 원본 파일인지 확인하세요."] };
  }
  const b = tiff.b;
  const mnAbs = makerNote.entry.valueAbs;
  let entries = null;

  if (startsWithAscii(b, mnAbs, "Nikon\0")) {
    // type-3 MakerNote: +10 위치에 자체 TIFF 헤더, 오프셋은 그 헤더 기준
    const embBase = mnAbs + 10;
    const le = b[embBase] === 0x49;
    const u32 = le ? _leU32(b, embBase + 4) : _beU32(b, embBase + 4);
    entries = parseIfdRaw(b, embBase + u32, le, embBase);
  } else {
    // 헤더 없는 구형: 메인 TIFF 기준
    entries = parseIfdRaw(b, mnAbs, tiff.le, tiff.base);
  }
  const e = entries.find(x => x.tag === 0x00a7);
  if (!e) {
    return { status: "unsupported", notes: ["이 기종은 셔터 카운트를 기록하지 않습니다. (2005년 이전 니콘 등)"] };
  }
  // 값은 inline int32u — 엔트리를 만든 파서의 endian으로 이미 위치 계산됨
  const le = startsWithAscii(b, mnAbs, "Nikon\0") ? b[mnAbs + 10] === 0x49 : tiff.le;
  const count = le ? _leU32(b, e.valueAbs) : _beU32(b, e.valueAbs);
  if (count === 4294965247) {
    return { status: "unsupported", notes: ["카메라가 이 파일에는 카운트를 기록하지 않았습니다(n/a)."] };
  }
  return {
    status: "ok", count, countLabel: "셔터 카운트",
    notes: ["니콘 카운터는 기종에 따라 전자식 셔터 촬영도 포함될 수 있습니다."],
  };
}

/* =========================================================
   PENTAX — 태그 0x005D, 날짜(0x0006)·시간(0x0007) 키 XOR 복호화
   count = raw ^ date ^ (0xFFFFFFFF - time)
   ========================================================= */
function extractPentax(parsed) {
  const { tiff, makerNote } = parsed;
  if (!makerNote || !makerNote.entry) {
    return { status: "error", notes: ["MakerNote가 없습니다. 원본 파일인지 확인하세요."] };
  }
  const b = tiff.b;
  const mnAbs = makerNote.entry.valueAbs;
  let ifdAbs, le = tiff.le, valueBase = tiff.base;

  if (startsWithAscii(b, mnAbs, "AOC\0")) {
    le = b[mnAbs + 4] === 0x49;
    ifdAbs = mnAbs + 6;
  } else if (startsWithAscii(b, mnAbs, "PENTAX \0")) {
    le = b[mnAbs + 8] === 0x49;
    ifdAbs = mnAbs + 10;
    valueBase = mnAbs;
  } else {
    ifdAbs = mnAbs; // 헤더 없는 경우
  }
  const entries = parseIfdRaw(b, ifdAbs, le, valueBase);
  const find = t => entries.find(e => e.tag === t) || null;
  const eDate = find(0x0006), eTime = find(0x0007), eCnt = find(0x005d);
  if (!eCnt) {
    return { status: "unsupported", notes: ["셔터 카운트 태그(0x005D)가 없습니다. (*istD 등 초기 기종은 미기록)"] };
  }
  if (!eDate || !eTime || eCnt.byteLen !== 4) {
    return { status: "error", notes: ["복호화에 필요한 날짜/시간 태그를 찾지 못했습니다."] };
  }
  const raw = _beU32(b, eCnt.valueAbs);
  const dateKey = _beU32(b, eDate.valueAbs);
  const t = eTime.valueAbs;
  const timeKey = _beU32(new Uint8Array([b[t], b[t + 1], b[t + 2], 0]), 0);
  const count = (raw ^ dateKey ^ ((0xffffffff - timeKey) >>> 0)) >>> 0;
  if (count > 10_000_000) {
    return { status: "error", notes: ["복호화 결과가 비정상입니다. 편집된 파일일 수 있습니다."] };
  }
  return {
    status: "ok", count, countLabel: "셔터 카운트",
    notes: ["라이브뷰/동영상용 셔터 동작은 포함되지 않으며, 서비스 수리 시 리셋될 수 있습니다."],
  };
}

/* =========================================================
   FUJIFILM — 태그 0x1438 ImageCount (int16u & 0x7FFF), 2017년~
   ========================================================= */
function extractFuji(parsed) {
  const { tiff, makerNote } = parsed;
  if (!makerNote || !makerNote.entry) {
    return { status: "error", notes: ["MakerNote가 없습니다. 원본 파일인지 확인하세요."] };
  }
  const b = tiff.b;
  const mnAbs = makerNote.entry.valueAbs;
  if (!startsWithAscii(b, mnAbs, "FUJIFILM")) {
    return { status: "error", notes: ["후지필름 MakerNote 형식이 아닙니다."] };
  }
  // 후지 MakerNote: 항상 리틀엔디안, 오프셋은 MakerNote 시작점 기준
  const ifdOff = _leU32(b, mnAbs + 8);
  const entries = parseIfdRaw(b, mnAbs + ifdOff, true, mnAbs);
  const e = entries.find(x => x.tag === 0x1438);
  if (!e) {
    return { status: "unsupported", notes: ["ImageCount 태그가 없습니다. 2017년 이전 기종은 기록하지 않습니다."] };
  }
  const count = _leU16(b, e.valueAbs) & 0x7fff;
  return {
    status: "ok", count, countLabel: "ImageCount (촬영 매수)",
    notes: [
      "후지필름은 16비트 값이라 32,767매를 넘으면 0부터 다시 셉니다.",
      "펌웨어 업데이트 시 0으로 리셋될 수 있어 참고용으로만 보세요.",
    ],
  };
}

/* =========================================================
   CANON — 태그 0x000D CameraInfo 블롭, 모델별 오프셋 (R 시리즈 일부)
   ========================================================= */
const CANON_OFFSETS = [
  { re: /EOS R[56]$/,          off: 0x0af1, size: 4, label: "셔터 카운트 (기계+전자)", exp: false },
  { re: /EOS R3$/,             off: 0x0af1, size: 4, label: "셔터 카운트 (기계+전자)", exp: true },
  { re: /EOS (R6m2|R8|R50)$/,  off: 0x0d29, size: 4, label: "셔터 카운트 (기계+전자)", exp: false },
  { re: /EOS R5m2$/,           off: 0x069c, size: 4, label: "셔터 카운트 (기계+전자)", exp: true },
  { re: /EOS R6 Mark III$/,    off: 0x086d, size: 2, label: "ImageCount (카드 포맷 시 리셋)", exp: true },
];

function extractCanon(parsed) {
  const { model, makerNote } = parsed;
  const spec = CANON_OFFSETS.find(s => s.re.test(model));
  const g5x = /G5 X Mark II$/.test(model);
  if (!spec && !g5x) {
    return {
      status: "unsupported",
      notes: ["캐논은 대부분의 기종에서 셔터 카운트를 EXIF에 기록하지 않습니다. R5/R6 세대 이후 일부 기종만 지원되며, 그 외에는 USB 연결 유틸리티가 필요합니다."],
    };
  }
  let bytes, entries;
  if (makerNote && makerNote.cr3Ifd) {
    // CR3: CMT3 박스 = 자체 TIFF의 IFD0가 곧 캐논 MakerNote
    bytes = makerNote.cr3Ifd.tiff.b;
    entries = makerNote.cr3Ifd.entries;
  } else if (makerNote && makerNote.entry) {
    const tiff = parsed.tiff;
    bytes = tiff.b;
    entries = parseIfdRaw(bytes, makerNote.entry.valueAbs, tiff.le, tiff.base);
  } else {
    return { status: "error", notes: ["MakerNote가 없습니다. 원본 파일인지 확인하세요."] };
  }
  const e = entries.find(x => x.tag === 0x000d);
  if (!e) return { status: "error", notes: ["CameraInfo(0x000D) 태그를 찾지 못했습니다."] };

  let off, size, label, exp;
  if (g5x) {
    off = parsed.container === "CR3" ? 0x0a95 : 0x0293;
    size = 4; label = "셔터 카운트 (기계+전자)"; exp = false;
  } else {
    ({ off, size, label, exp } = spec);
  }
  if (e.byteLen < off + size) {
    return { status: "error", notes: ["CameraInfo 데이터가 예상보다 짧습니다. (펌웨어 차이일 수 있음)"] };
  }
  const a = e.valueAbs + off;
  const count = size === 4 ? _leU32(bytes, a) : _leU16(bytes, a);
  if (count > 5_000_000) {
    return { status: "error", notes: ["읽은 값이 비정상적으로 큽니다. 펌웨어에 따라 오프셋이 다를 수 있습니다."] };
  }
  const notes = [];
  if (exp) notes.push("이 기종의 오프셋은 커뮤니티 확인 단계라 값이 부정확할 수 있습니다(실험적).");
  return { status: exp ? "warn" : "ok", count, countLabel: label, notes };
}

/* =========================================================
   진입점
   ========================================================= */
function extractShutterCount(parsed) {
  const make = (parsed.make || "").toUpperCase();
  let r;
  if (make.includes("SONY")) r = { brand: "Sony", ...extractSony(parsed) };
  else if (make.includes("NIKON")) r = { brand: "Nikon", ...extractNikon(parsed) };
  else if (make.includes("PENTAX") || make.includes("RICOH")) r = { brand: "Pentax", ...extractPentax(parsed) };
  else if (make.includes("FUJI")) r = { brand: "Fujifilm", ...extractFuji(parsed) };
  else if (make.includes("CANON")) r = { brand: "Canon", ...extractCanon(parsed) };
  else if (make.includes("OLYMPUS") || make.includes("OM DIGITAL")) {
    r = { brand: "Olympus/OM", status: "unsupported", notes: ["올림푸스/OM은 EXIF에 셔터 카운트를 기록하지 않습니다. 카메라의 숨겨진 서비스 메뉴에서 확인하세요."] };
  } else if (make.includes("PANASONIC")) {
    r = { brand: "Panasonic", status: "unsupported", notes: ["파나소닉은 EXIF에 셔터 카운트를 기록하지 않습니다. 서비스 메뉴 버튼 조합으로 확인하세요."] };
  } else {
    r = { brand: parsed.make || "알 수 없음", status: "unsupported", notes: ["지원하지 않는 제조사입니다. (지원: Sony · Nikon · Pentax · Fujifilm · Canon 일부)"] };
  }
  return r;
}

/* 지원 카메라 목록 (UI 표시용) */
function supportedSummary() {
  return {
    "Sony α (E-mount)": {
      "a7 계열": ["A7 / A7 II / A7 III / A7 IV / A7 V", "A7R ~ A7R V·VI", "A7S ~ A7S III", "A7C / A7C II / A7CR"],
      "a9 · a1 · 시네마": ["A9 / A9 II (A9 III은 글로벌 셔터라 제외)", "A1 / A1 II", "FX2 / FX3", "ZV-E1 / ZV-E10 / ZV-E10 II"],
      "APS-C": ["A5000 / A5100", "A6000 ~ A6700", "A3000 / A3500", "NEX 전 기종"],
    },
    "Sony A-mount": {
      "DSLR/DSLT": ["A230~A580, A850, A900", "A33~A99V, A68, A77 II, A99 II"],
    },
    "Nikon": {
      "DSLR": ["D40 이후 사실상 전 기종 (D3000~D6 등)"],
      "미러리스": ["Z 시리즈 전 기종 (Z30~Z9, Zf, Zfc 등)"],
    },
    "Pentax": {
      "DSLR": ["*istD 이후 대부분 (K10D, K-5, K-3, K-1, KP, K-70 등)"],
    },
    "Fujifilm": {
      "X / GFX (2017년 이후)": ["X-T2 후기 펌웨어 ~ X-T5, X-H2(S), X-Pro2/3, X100V/VI, GFX 등", "※ ImageCount 기준, 32,767 순환"],
    },
    "Canon (일부)": {
      "R 시리즈": ["R5, R6 (확정)", "R6 II, R8, R50 (확정)", "R3, R5 II, R6 III (실험적)", "PowerShot G5 X II"],
      "미지원": ["그 외 EOS DSLR/미러리스 대부분 — USB 유틸리티 필요"],
    },
  };
}
