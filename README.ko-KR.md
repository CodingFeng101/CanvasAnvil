<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.fr-FR.md">Français</a>
</p>

CanvasAnvil은 플로우차트, CAD 워크플로우, PPT 생성 및 편집을 지원하는 멀티 캔버스 AI 제작 플랫폼입니다.

## 버전

현재 버전: `v1.0.1`

`v1.0.1`은 영속성 문제 수정에 초점을 맞춘 패치 릴리스입니다. 사용자가 작업공간을 명시적으로 비우지 않는 한, PPT 및 CAD 작업공간의 이미지는 새로고침 이후에도 더 안정적으로 유지됩니다.

`v1.0.0`은 첫 번째 주요 실사용 릴리스입니다. 특히 기존 PPT 편집을 강화했고, NotebookLM에서 내보낸 PPT의 텍스트 편집과 반복 수정 작업을 더 잘 지원합니다.

## v1.0.1 패치 업데이트

- PPT 작업공간의 대용량 이미지 상태를 IndexedDB로 옮겨 새로고침 후 이미지가 사라지는 문제를 수정
- PPT 복원 순서를 수정해 경량 스냅샷이 최신 이미지 영속 상태를 덮어쓰지 않도록 개선
- CAD 렌더 이미지와 분석 이미지를 IndexedDB 기반으로 영속화하고 플레이스홀더 처리도 개선해 새로고침 후 복원 안정성을 높임

## v1.0.0 주요 업데이트

- `Flow`, `CAD`, `PPT` 전반의 상호작용 경험 통합
- NotebookLM에서 내보낸 PPT에 대한 텍스트 편집 지원
- 첫 생성뿐 아니라 기존 PPT 수정과 반복 개선에 더 적합한 워크플로우
- PPT 이미지 업로드 시 raw base64 대용량 텍스트를 채팅 입력에 직접 넣지 않도록 개선
- PPT 이미지 생성 및 편집을 로컬 프록시 경로로 통일해 브라우저 호환성 향상
- 이미지 참조 체인에 수량 제한, 압축, 실패 시 폴백 재시도 추가
- PPT 워크스페이스와 문서의 깨진 문자 문제 다수 수정

## 캔버스 미리보기

<table>
  <tr><td width="680" align="center"><strong>Flow Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Flow canvas" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>CAD Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="CAD canvas" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>PPT Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="PPT canvas" width="680" /></td></tr>
</table>

## 온라인 데모

- [CanvasAnvil 열기](https://canvasanvil.codingfgd.asia)

## 튜토리얼 영상

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## 기능 개요

- `Flow`: draw.io XML 기반 플로우차트 생성 및 부분 편집
- `CAD`: 실내 워크플로우 기획, 분석 보드, 2D 평면도, 렌더 작업, BOM
- `PPT`: 구조화된 슬라이드 생성, 페이지 단위 편집, 이미지 보조 반복 작업, 내보내기

## 빠른 시작

1. 의존성 설치

```bash
npm install
```

2. 로컬 개발 시작

```bash
npm run dev
```

기본 주소: `http://localhost:5173`

3. 타입 검사

```bash
npm run check
```

4. 프로덕션 빌드

```bash
npm run build
```

## 자주 쓰는 명령

- `npm run dev`: Vite 개발 서버 시작
- `npm run dev:full`: Web과 API 개발 서버 동시 시작
- `npm run dev:web`: 프론트엔드 개발 서버 시작
- `npm run dev:api`: API 개발 서버 시작
- `npm run check`: TypeScript 검사
- `npm run lint`: ESLint 검사
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 미리보기
- `npm start`: API 서버 시작

## 개발 메모

- AI 설정은 로컬 앱 설정에서 읽으며, 사용자 지정 모델 서비스에 연결할 수 있습니다
- PPT 로컬 개발은 `/api/ppt-ai` 로컬 프록시 라우트에 의존합니다
- `vite.config.ts` 의 로컬 API 라우팅을 바꿨다면 개발 서버를 재시작해야 합니다

## 프로젝트 구조

```text
.
├─ agent/                      # Agent 프롬프트와 하위 Agent 사양
├─ public/                     # 정적 자산
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # Flow canvas
│     ├─ cad/                  # CAD canvas
│     └─ ppt/                  # PPT canvas
├─ api/                        # 로컬 API 라우트 진입점
└─ README.md
```

## 출처 및 통합

- Flow canvas: [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) 기반 통합 및 확장
- PPT canvas: [banana-slides](https://github.com/Anionex/banana-slides.git) 기반 통합 및 확장
- CAD canvas: agent 워크플로우, 2D SVG 편집, 렌더 오케스트레이션, BOM 파이프라인을 포함한 자체 구현

## 문서

- 배포 가이드: [deploy/README.md](deploy/README.md)

## 연락처

아래 WeChat QR 코드를 통해 작성자에게 연락할 수 있습니다.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
