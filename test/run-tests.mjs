/* run-tests.mjs — 브랜드별 EXIF 구조를 합성해 파서를 검증 (node test/run-tests.mjs) */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---- 브라우저 전역 셈 ---- */
class FileReaderShim {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      ab => { this.result = ab; this.onload && this.onload(); },
      err => { this.error = err; this.onerror && this.onerror(); },
    );
  }
}
const ctx = { FileReader: FileReaderShim, File, console };
vm.createContext(ctx);
for (const f of ["assets/js/exif.js", "assets/js/brands.js"]) {
  vm.runInContext(readFileSync(join(root, f), "utf8"), ctx, { filename: f });
}

/* ---- 바이트 빌더 ---- */
class B {
  constructor() { this.a = []; }
  get len() { return this.a.length; }
  bytes(...bs) { this.a.push(...bs); return this; }
  ascii(s) { for (const c of s) this.a.push(c.charCodeAt(0)); return this; }
  u16le(v) { return this.bytes(v & 255, (v >> 8) & 255); }
  u32le(v) { return this.bytes(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
  u16be(v) { return this.bytes((v >> 8) & 255, v & 255); }
  u32be(v) { return this.bytes((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255); }
  pad(n, v = 0) { for (let i = 0; i < n; i++) this.a.push(v); return this; }
  patchU32le(pos, v) {
    this.a[pos] = v & 255; this.a[pos + 1] = (v >> 8) & 255;
    this.a[pos + 2] = (v >> 16) & 255; this.a[pos + 3] = (v >>> 24) & 255;
    return this;
  }
  out() { return new Uint8Array(this.a); }
}

/* TIFF(LE) 생성: IFD0(Make/Model/ExifIFD) + ExifIFD(DateTimeOriginal/MakerNote)
   makerNoteFn(b, tiffStart) → MakerNote 바이트를 b에 직접 쓰고 [mnOffset(rel tiff), mnLength] 반환 */
function buildTiff(make, model, makerNoteFn) {
  const b = new B();
  const tiffStart = b.len; // 0
  b.ascii("II").u16le(42).u32le(8);
  // IFD0: 3 entries
  b.u16le(3);
  const makeStr = make + "\0", modelStr = model + "\0";
  // 오프셋 자리는 나중에 패치
  b.u16le(0x010f).u16le(2).u32le(makeStr.length); const pMake = b.len; b.u32le(0);
  b.u16le(0x0110).u16le(2).u32le(modelStr.length); const pModel = b.len; b.u32le(0);
  b.u16le(0x8769).u16le(4).u32le(1); const pExif = b.len; b.u32le(0);
  b.u32le(0); // next IFD
  // 문자열 데이터
  b.patchU32le(pMake, b.len - tiffStart); b.ascii(makeStr);
  b.patchU32le(pModel, b.len - tiffStart); b.ascii(modelStr);
  // Exif IFD
  b.patchU32le(pExif, b.len - tiffStart);
  const dt = "2024:05:01 12:00:00\0";
  b.u16le(2);
  b.u16le(0x9003).u16le(2).u32le(dt.length); const pDt = b.len; b.u32le(0);
  b.u16le(0x927c).u16le(7); const pMnLen = b.len; b.u32le(0); const pMn = b.len; b.u32le(0);
  b.u32le(0);
  b.patchU32le(pDt, b.len - tiffStart); b.ascii(dt);
  const [mnOff, mnLen] = makerNoteFn(b, tiffStart);
  b.patchU32le(pMn, mnOff);
  b.patchU32le(pMnLen, mnLen);
  return b;
}

function wrapJpeg(tiffBytes) {
  const b = new B();
  b.bytes(0xff, 0xd8); // SOI
  const segLen = 2 + 6 + tiffBytes.length;
  b.bytes(0xff, 0xe1).u16be(segLen).ascii("Exif\0\0");
  b.a.push(...tiffBytes);
  b.bytes(0xff, 0xd9);
  return b.out();
}

/* ---- Sony 암호화 (역함수 검증용 정방향) ---- */
const fwd = new Uint8Array(256);
for (let i = 0; i < 249; i++) fwd[i] = (i * i * i) % 249;
for (let i = 249; i < 256; i++) fwd[i] = i;

function sonyMakerNote(countOffset, count) {
  return (b, tiffStart) => {
    const mnStart = b.len;
    b.ascii("SONY DSC ").bytes(0, 0, 0);
    // IFD (오프셋: 메인 TIFF 기준)
    b.u16le(1);
    b.u16le(0x9050).u16le(7).u32le(0x60); const pVal = b.len; b.u32le(0);
    b.u32le(0);
    const blobOff = b.len - tiffStart;
    b.patchU32le(pVal, blobOff);
    const blob = new Uint8Array(0x60);
    blob[countOffset] = fwd[count & 255];
    blob[countOffset + 1] = fwd[(count >> 8) & 255];
    blob[countOffset + 2] = fwd[(count >> 16) & 255];
    b.a.push(...blob);
    return [mnStart - tiffStart, b.len - mnStart];
  };
}

function sonyOldDslrMakerNote(count) {
  return (b, tiffStart) => {
    const mnStart = b.len;
    b.ascii("SONY DSC ").bytes(0, 0, 0);
    b.u16le(1);
    b.u16le(0x0020).u16le(7).u32le(0x900); const pVal = b.len; b.u32le(0);
    b.u32le(0);
    b.patchU32le(pVal, b.len - tiffStart);
    const blob = new Uint8Array(0x900);
    blob[0x846] = count & 255; blob[0x847] = (count >> 8) & 255; blob[0x848] = (count >> 16) & 255;
    b.a.push(...blob);
    return [mnStart - tiffStart, b.len - mnStart];
  };
}

function nikonMakerNote(count) {
  return (b, tiffStart) => {
    const mnStart = b.len;
    b.ascii("Nikon\0").bytes(0x02, 0x11, 0x00, 0x00);
    // 내장 TIFF (오프셋은 이 지점 기준)
    b.ascii("II").u16le(42).u32le(8);
    b.u16le(1);
    b.u16le(0x00a7).u16le(4).u32le(1).u32le(count);
    b.u32le(0);
    return [mnStart - tiffStart, b.len - mnStart];
  };
}

function pentaxMakerNote(count) {
  return (b, tiffStart) => {
    const mnStart = b.len;
    b.ascii("AOC\0").ascii("II");
    const date = [0x07, 0xe8, 5, 1];   // 2024-05-01 (연도 BE u16 + 월 + 일)
    const time = [12, 0, 0];
    const dateKey = ((date[0] << 24) | (date[1] << 16) | (date[2] << 8) | date[3]) >>> 0;
    const timeKey = ((time[0] << 24) | (time[1] << 16) | (time[2] << 8)) >>> 0;
    const raw = (count ^ dateKey ^ ((0xffffffff - timeKey) >>> 0)) >>> 0;
    b.u16le(3);
    b.u16le(0x0006).u16le(7).u32le(4).bytes(...date);
    b.u16le(0x0007).u16le(7).u32le(3).bytes(...time).bytes(0);
    b.u16le(0x005d).u16le(7).u32le(4).u32be(raw);
    b.u32le(0);
    return [mnStart - tiffStart, b.len - mnStart];
  };
}

function fujiMakerNote(count) {
  return (b, tiffStart) => {
    const mnStart = b.len;
    b.ascii("FUJIFILM").u32le(12); // IFD는 MakerNote 시작 +12
    b.u16le(1);
    b.u16le(0x1438).u16le(3).u32le(1).u16le(count | 0x8000).u16le(0);
    b.u32le(0);
    return [mnStart - tiffStart, b.len - mnStart];
  };
}

function canonMakerNote(count, blobSize, countOffset) {
  return (b, tiffStart) => {
    const mnStart = b.len; // 캐논: 헤더 없음, IFD 바로 시작 (메인 TIFF 기준 오프셋)
    b.u16le(1);
    b.u16le(0x000d).u16le(7).u32le(blobSize); const pVal = b.len; b.u32le(0);
    b.u32le(0);
    b.patchU32le(pVal, b.len - tiffStart);
    const blob = new Uint8Array(blobSize);
    blob[countOffset] = count & 255; blob[countOffset + 1] = (count >> 8) & 255;
    blob[countOffset + 2] = (count >> 16) & 255; blob[countOffset + 3] = (count >>> 24) & 255;
    b.a.push(...blob);
    return [mnStart - tiffStart, b.len - mnStart];
  };
}

/* CR3 합성: ftyp(crx) + CMT1 + CMT3 */
function buildCr3(model, count, blobSize, countOffset) {
  const b = new B();
  b.u32be(24).ascii("ftyp").ascii("crx ").u32be(1).ascii("crx isom");
  // CMT1 박스: [size][CMT1][TIFF...]
  const cmt1 = buildTiff("Canon", model, (bb, ts) => [0, 0]).out();
  b.u32be(8 + cmt1.length).ascii("CMT1"); b.a.push(...cmt1);
  // CMT3 박스: IFD0 자체가 캐논 MakerNote
  const c3 = new B();
  c3.ascii("II").u16le(42).u32le(8);
  c3.u16le(1);
  c3.u16le(0x000d).u16le(7).u32le(blobSize); const pVal = c3.len; c3.u32le(0);
  c3.u32le(0);
  c3.patchU32le(pVal, c3.len);
  const blob = new Uint8Array(blobSize);
  blob[countOffset] = count & 255; blob[countOffset + 1] = (count >> 8) & 255;
  blob[countOffset + 2] = (count >> 16) & 255; blob[countOffset + 3] = (count >>> 24) & 255;
  c3.a.push(...blob);
  const cmt3 = c3.out();
  b.u32be(8 + cmt3.length).ascii("CMT3"); b.a.push(...cmt3);
  return b.out();
}

/* RAF 합성: 헤더 + @84 BE 오프셋 → 내장 JPEG */
function buildRaf(jpegBytes) {
  const b = new B();
  b.ascii("FUJIFILMCCD-RAW 0201FF129502X-T5\0");
  b.pad(84 - b.len);
  const jpegOff = 96;
  b.u32be(jpegOff).u32be(jpegBytes.length);
  b.pad(jpegOff - b.len);
  b.a.push(...jpegBytes);
  return b.out();
}

/* ---- 테스트 실행 ---- */
const cases = [
  { name: "Sony A7 III (9050b @0x3a)", file: wrapJpeg(buildTiff("SONY", "ILCE-7M3", sonyMakerNote(0x3a, 123456)).out()), expect: { brand: "Sony", count: 123456 } },
  { name: "Sony A7R V (9050c @0x3a)", file: wrapJpeg(buildTiff("SONY", "ILCE-7RM5", sonyMakerNote(0x3a, 4321)).out()), expect: { brand: "Sony", count: 4321 } },
  { name: "Sony A6700 (9050d @0x0a)", file: wrapJpeg(buildTiff("SONY", "ILCE-6700", sonyMakerNote(0x0a, 777)).out()), expect: { brand: "Sony", count: 777 } },
  { name: "Sony A6000 (9050a @0x32)", file: wrapJpeg(buildTiff("SONY", "ILCE-6000", sonyMakerNote(0x32, 250101)).out()), expect: { brand: "Sony", count: 250101 } },
  { name: "Sony A900 (구형 DSLR @0x846)", file: wrapJpeg(buildTiff("SONY", "DSLR-A900", sonyOldDslrMakerNote(55555)).out()), expect: { brand: "Sony", count: 55555 } },
  { name: "Sony A9 III (글로벌 셔터)", file: wrapJpeg(buildTiff("SONY", "ILCE-9M3", sonyMakerNote(0x3a, 1)).out()), expect: { brand: "Sony", status: "unsupported" } },
  { name: "Nikon Z6 (0x00A7)", file: wrapJpeg(buildTiff("NIKON CORPORATION", "NIKON Z 6", nikonMakerNote(98765)).out()), expect: { brand: "Nikon", count: 98765 } },
  { name: "Pentax K-5 (XOR 복호화)", file: wrapJpeg(buildTiff("PENTAX", "PENTAX K-5", pentaxMakerNote(31415)).out()), expect: { brand: "Pentax", count: 31415 } },
  { name: "Fuji X-T5 (0x1438 &0x7fff)", file: wrapJpeg(buildTiff("FUJIFILM", "X-T5", fujiMakerNote(12345)).out()), expect: { brand: "Fujifilm", count: 12345 } },
  { name: "Canon R6 JPEG (0x0AF1)", file: wrapJpeg(buildTiff("Canon", "Canon EOS R6", canonMakerNote(200000, 0x0c00, 0x0af1)).out()), expect: { brand: "Canon", count: 200000 } },
  { name: "Canon R8 JPEG (0x0D29)", file: wrapJpeg(buildTiff("Canon", "Canon EOS R8", canonMakerNote(3000, 0x0e00, 0x0d29)).out()), expect: { brand: "Canon", count: 3000 } },
  { name: "Canon R5 CR3 (CMT3 0x0AF1)", file: buildCr3("Canon EOS R5", 87654, 0x0c00, 0x0af1), expect: { brand: "Canon", count: 87654 } },
  { name: "Fuji RAF (내장 JPEG)", file: buildRaf(wrapJpeg(buildTiff("FUJIFILM", "X-T5", fujiMakerNote(31000)).out())), expect: { brand: "Fujifilm", count: 31000 } },
  { name: "Canon 90D (미지원 안내)", file: wrapJpeg(buildTiff("Canon", "Canon EOS 90D", canonMakerNote(1, 0x100, 0x10)).out()), expect: { brand: "Canon", status: "unsupported" } },
  { name: "Olympus (미지원 안내)", file: wrapJpeg(buildTiff("OLYMPUS CORPORATION", "E-M1MarkIII", (b, t) => [0, 0]).out()), expect: { brand: "Olympus/OM", status: "unsupported" } },
  { name: "EXIF 없는 JPEG (오류 처리)", file: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), expectError: true },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const file = new File([c.file], "test.bin");
  try {
    const parsed = await vm.runInContext("parseImageFile", ctx)(file);
    const r = vm.runInContext("extractShutterCount", ctx)(parsed);
    let ok = true, why = [];
    if (c.expectError) { ok = false; why.push("오류가 나야 하는데 성공함"); }
    if (c.expect) {
      if (c.expect.brand && r.brand !== c.expect.brand) { ok = false; why.push(`brand ${r.brand} != ${c.expect.brand}`); }
      if (c.expect.count != null && r.count !== c.expect.count) { ok = false; why.push(`count ${r.count} != ${c.expect.count}`); }
      if (c.expect.status && r.status !== c.expect.status) { ok = false; why.push(`status ${r.status} != ${c.expect.status}`); }
      if (c.expect.count != null && r.status !== "ok" && r.status !== "warn") { ok = false; why.push(`status=${r.status}, notes=${(r.notes || []).join("/")}`); }
    }
    console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : " — " + why.join(", ")}`);
    ok ? pass++ : fail++;
  } catch (err) {
    if (c.expectError) { console.log(`✅ ${c.name} (예상된 오류: ${err.message})`); pass++; }
    else { console.log(`❌ ${c.name} — 예외: ${err.message}`); fail++; }
  }
}
console.log(`\n${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
