/* exif.js — 컨테이너(JPEG/TIFF/RAF/CR3) 및 TIFF/EXIF 파싱 (100% 클라이언트) */
"use strict";

const EXIF_READ_LIMIT = 8 * 1024 * 1024; // 파일 앞 8MB만 읽음

const TIFF_FMT_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

function readSlice(file, start, length) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(start, start + length));
  });
}

/* bytes 배열 상의 TIFF 구조체. base = TIFF 헤더 시작 위치(bytes 내부 오프셋).
   태그의 오프셋 값은 모두 base 기준. */
class Tiff {
  constructor(bytes, base) {
    this.b = bytes;
    this.base = base;
    const b0 = bytes[base], b1 = bytes[base + 1];
    if (b0 === 0x49 && b1 === 0x49) this.le = true;
    else if (b0 === 0x4d && b1 === 0x4d) this.le = false;
    else throw new Error("TIFF 헤더가 아님");
    this.ifd0 = this.u32(base + 4);
  }
  u16(abs) {
    const b = this.b;
    return this.le ? b[abs] | (b[abs + 1] << 8) : (b[abs] << 8) | b[abs + 1];
  }
  u32(abs) {
    const b = this.b;
    return this.le
      ? (b[abs] | (b[abs + 1] << 8) | (b[abs + 2] << 16) | (b[abs + 3] << 24)) >>> 0
      : ((b[abs] << 24) | (b[abs + 1] << 16) | (b[abs + 2] << 8) | b[abs + 3]) >>> 0;
  }
  /* base+relOffset에서 IFD 파싱 → entry 배열
     entry: {tag, format, count, byteLen, valueAbs} (valueAbs = 실제 값이 위치한 bytes 내부 절대 오프셋) */
  parseIFD(relOffset) {
    const entries = [];
    let p = this.base + relOffset;
    if (p + 2 > this.b.length) return entries;
    const n = this.u16(p);
    p += 2;
    for (let i = 0; i < n; i++, p += 12) {
      if (p + 12 > this.b.length) break;
      const tag = this.u16(p);
      const format = this.u16(p + 2);
      const count = this.u32(p + 4);
      const unit = TIFF_FMT_SIZE[format] || 1;
      const byteLen = unit * count;
      const valueAbs = byteLen <= 4 ? p + 8 : this.base + this.u32(p + 8);
      entries.push({ tag, format, count, byteLen, valueAbs, inlineAbs: p + 8 });
    }
    return entries;
  }
  findTag(entries, tag) {
    return entries.find(e => e.tag === tag) || null;
  }
  str(entry) {
    if (!entry) return "";
    let s = "";
    const end = Math.min(entry.valueAbs + entry.byteLen, this.b.length);
    for (let i = entry.valueAbs; i < end; i++) {
      const c = this.b[i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }
  num(entry) {
    if (!entry) return null;
    const a = entry.valueAbs;
    switch (entry.format) {
      case 1: case 6: case 7: return this.b[a];
      case 3: case 8: return this.u16(a);
      case 4: case 9: return this.u32(a);
      default: return null;
    }
  }
  bytesAt(abs, len) {
    return this.b.subarray(abs, abs + len);
  }
}

function asciiIndexOf(bytes, text, from = 0, to = bytes.length) {
  const pat = [];
  for (let i = 0; i < text.length; i++) pat.push(text.charCodeAt(i));
  const last = Math.min(to, bytes.length) - pat.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < pat.length; j++) {
      if (bytes[i + j] !== pat[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function startsWithAscii(bytes, offset, text) {
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/* JPEG 마커를 걸어가며 "Exif\0\0" APP1 세그먼트를 찾음 → TIFF base 반환 */
function findExifInJpeg(bytes, jpegStart = 0) {
  let p = jpegStart + 2; // SOI 건너뜀
  while (p + 4 < bytes.length) {
    if (bytes[p] !== 0xff) { p++; continue; }
    const marker = bytes[p + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break; // 이미지 데이터 시작/끝
    const segLen = (bytes[p + 2] << 8) | bytes[p + 3];
    if (marker === 0xe1 && startsWithAscii(bytes, p + 4, "Exif\0\0")) {
      return p + 10; // TIFF 헤더 시작
    }
    p += 2 + segLen;
  }
  return -1;
}

/* 파일 → { tiff, model, make, dateTime, makerNote:{entry, tiff}, container } */
async function parseImageFile(file) {
  const bytes = await readSlice(file, 0, Math.min(file.size, EXIF_READ_LIMIT));
  if (bytes.length < 16) throw new Error("파일이 너무 작습니다");

  // ---- 컨테이너 판별 ----
  let tiffBase = -1;
  let container = "unknown";
  let cr3 = null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    container = "JPEG";
    tiffBase = findExifInJpeg(bytes, 0);
    if (tiffBase < 0) throw new Error("EXIF 정보가 없습니다 (편집/전송 과정에서 제거된 파일일 수 있음)");
  } else if (startsWithAscii(bytes, 0, "FUJIFILMCCD-RAW")) {
    container = "RAF";
    // RAF: 내장 JPEG 오프셋(u32 BE @84), 길이(@88)
    const jpegOff = ((bytes[84] << 24) | (bytes[85] << 16) | (bytes[86] << 8) | bytes[87]) >>> 0;
    if (jpegOff + 4 < bytes.length && bytes[jpegOff] === 0xff && bytes[jpegOff + 1] === 0xd8) {
      tiffBase = findExifInJpeg(bytes, jpegOff);
    }
    if (tiffBase < 0) throw new Error("RAF 내장 JPEG에서 EXIF를 찾지 못했습니다");
  } else if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) {
    container = "TIFF"; // ARW / NEF / PEF / CR2 / DNG / ORF(변형)…
    tiffBase = 0;
  } else if (asciiIndexOf(bytes, "ftyp", 0, 64) >= 0 && asciiIndexOf(bytes, "crx ", 0, 64) >= 0) {
    container = "CR3";
    cr3 = parseCr3(bytes);
    if (!cr3) throw new Error("CR3 메타데이터(CMT 박스)를 찾지 못했습니다");
  } else {
    throw new Error("지원하지 않는 파일 형식입니다 (원본 JPG/RAW를 사용하세요)");
  }

  let make = "", model = "", dateTime = "", makerNote = null, tiff = null;

  if (container === "CR3") {
    make = cr3.make; model = cr3.model; dateTime = cr3.dateTime;
    makerNote = cr3.makerNote; // {tiff, entries}
  } else {
    tiff = new Tiff(bytes, tiffBase);
    const ifd0 = tiff.parseIFD(tiff.ifd0);
    make = tiff.str(tiff.findTag(ifd0, 0x010f));
    model = tiff.str(tiff.findTag(ifd0, 0x0110));
    const exifPtr = tiff.findTag(ifd0, 0x8769);
    if (exifPtr) {
      const exifIfd = tiff.parseIFD(tiff.num(exifPtr));
      dateTime = tiff.str(tiff.findTag(exifIfd, 0x9003)) || tiff.str(tiff.findTag(exifIfd, 0x9004));
      const mn = tiff.findTag(exifIfd, 0x927c);
      if (mn) makerNote = { entry: mn, tiff };
    }
  }

  return { bytes, container, tiff, make, model, dateTime, makerNote };
}

/* CR3: moov 안의 CMT1(IFD0) / CMT2(ExifIFD) / CMT3(MakerNote)를 스캔.
   각 CMT 박스는 자체 TIFF 헤더로 시작하는 독립 구조. */
function parseCr3(bytes) {
  function cmtTiff(name) {
    const idx = asciiIndexOf(bytes, name);
    if (idx < 0) return null;
    const tiffStart = idx + 4; // 박스 타입 뒤가 바로 TIFF 헤더
    try {
      const t = new Tiff(bytes, tiffStart);
      return { tiff: t, entries: t.parseIFD(t.ifd0) };
    } catch (e) { return null; }
  }
  const c1 = cmtTiff("CMT1");
  const c2 = cmtTiff("CMT2");
  const c3 = cmtTiff("CMT3");
  if (!c1 && !c3) return null;
  let make = "", model = "", dateTime = "";
  if (c1) {
    make = c1.tiff.str(c1.tiff.findTag(c1.entries, 0x010f));
    model = c1.tiff.str(c1.tiff.findTag(c1.entries, 0x0110));
  }
  if (c2) {
    dateTime = c2.tiff.str(c2.tiff.findTag(c2.entries, 0x9003));
  }
  return { make, model, dateTime, makerNote: c3 ? { cr3Ifd: c3 } : null };
}
