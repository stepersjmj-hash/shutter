# 셔터 카운트 감정서 (shutter)

카메라 원본 JPG/RAW 파일에서 셔터 카운트를 읽어주는 100% 클라이언트 사이드 정적 웹앱.
Sony · Nikon · Pentax · Fujifilm · Canon(일부) 지원. 파일은 서버로 업로드되지 않는다.

- 배포: GitHub Pages — https://stepersjmj-hash.github.io/shutter/ (main 브랜치 루트, 푸시하면 자동 재배포)
- 저장소: https://github.com/stepersjmj-hash/shutter

## 파일 구성

- `index.html` — 단일 페이지 (확인하기 / 지원 카메라 / FAQ 탭)
- `assets/css/style.css` — "감정서(Certificate)" 디자인. 토큰·수치의 원본은
  `design_handoff_certificate/README.md` (하이파이 스펙, 다크모드 없음)
- `assets/js/exif.js` — 컨테이너 판별(JPEG/TIFF계 RAW/RAF/CR3) + TIFF/EXIF 파서.
  파일 앞 8MB만 읽음 (`EXIF_READ_LIMIT`)
- `assets/js/brands.js` — 브랜드별 추출 로직 + 모델 테이블 + `supportedSummary()`
- `assets/js/app.js` — UI 렌더링 (드롭존, 결과 카드, 도장, 내구 스케일)
- `test/run-tests.mjs` — 합성 EXIF 픽스처 테스트
- `design_handoff_certificate/` — 디자인 핸드오프 문서·레퍼런스·파비콘 원본 (배포와 무관한 소스 자료)
- `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png` — 루트 파비콘
  (원본은 design_handoff_certificate/assets/)

## 반복 작업 절차

- **테스트**: `node test/run-tests.mjs` — 16케이스. UI 변경 후에도 항상 통과 확인
- **로컬 미리보기**: `.claude/launch.json`의 `shutter-static` (`npx -y serve -l 5500 .`)
- **배포**: main에 커밋 → 푸시하면 끝. 별도 빌드 없음
- **UI 수정 시**: `exif.js`/`brands.js`(파싱 로직)는 건드리지 않는 것이 원칙.
  디자인 수치는 design_handoff_certificate/README.md 스펙을 따른다

## 기종 추가 방법 (brands.js)

- **Sony**: `SONY_GROUPS`에 EXIF 모델명(예: `ILCE-7M5`)을 해당 세대 그룹에 추가.
  그룹별 카운터 오프셋 — T9050A: 0x32, T9050B/C: 0x3A, T9050D: 0x0A (3바이트 LE, 치환암호 복호화)
- **Canon**: `CANON_OFFSETS`에 모델 정규식 + CameraInfo(0x000D) 블롭 내 오프셋 추가.
  근거는 ExifTool Canon.pm의 CameraInfo 테이블에서 찾는다
- 오프셋 출처는 항상 ExifTool 모듈(Sony.pm 등, github.com/exiftool/exiftool)

## 도메인 지식 / 함정

- Sony 0x9050 태그는 치환암호: 암호화 `EB=(B³) mod 249` (249~255는 그대로). 복호화는 역테이블
- Sony 신형(T9050D 세대)은 기계식 셔터 촬영에만 카운트 기록 — 전자셔터 파일이면 0
- A9 III는 글로벌 셔터라 기계식 카운트 개념 자체가 없음 (`SONY_NO_MECH`)
- Pentax 0x005D는 `raw ^ date ^ (0xFFFFFFFF - time)` XOR 복호화 (date=0x0006 4바이트 BE, time=0x0007 3바이트+널 BE)
- Fujifilm 0x1438 ImageCount는 15비트 → 32,767에서 순환. "총 컷수"로 단정하면 안 됨 (안내 문구 유지)
- Canon은 대부분 EXIF 미기록. R5/R6 세대 이후 일부만 지원, R3/R5II/R6III 오프셋은 실험적
- Nikon 0x00A7 값 `4294965247`은 n/a 의미
- CR3는 TIFF가 아니라 ISO-BMFF — CMT1(IFD0)/CMT3(MakerNote) 박스를 ascii 스캔으로 찾음
- Fuji 마커노트는 항상 리틀엔디안 + 오프셋이 마커노트 시작 기준 (표준과 다름)
- Nikon 마커노트는 +10 위치에 자체 TIFF 헤더, 오프셋은 그 헤더 기준

## 관례

- 바닐라 HTML/CSS/JS, 빌드 도구 없음. ES 모듈 미사용(file:// 호환 위해 전역 스크립트)
- 커밋 메시지: 한국어 요약 한 줄 + 본문
- 테스트 픽스처는 실제 파일이 아니라 바이트 단위 합성 EXIF — 실기 파일 검증은 수동
