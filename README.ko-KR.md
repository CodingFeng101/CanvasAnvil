<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>Flow, CAD, PPT를 하나로 묶은 멀티 캔버스 AI 제작 플랫폼.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">Simplified Chinese</a> ·
  <a href="README.zh-TW.md">Traditional Chinese</a> ·
  <a href="README.ja-JP.md">Japanese</a> ·
  <a href="README.ko-KR.md">Korean</a> ·
  <a href="README.fr-FR.md">French</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v1.0.2-2563eb?style=for-the-badge" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-Flow%20%7C%20CAD%20%7C%20PPT-0f766e?style=for-the-badge" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-7c3aed?style=for-the-badge" />
</p>

> CanvasAnvil은 플로우차트 생성, CAD 워크플로, PPT 제작을 하나의 작업 공간에 통합한 AI 플랫폼입니다.

## 릴리스

현재 버전: `v1.0.2`

- `v1.0.2`: PPT를 이미지 우선 워크플로로 전환하고, OCR 및 텍스트 재배치를 편집 가능한 PPTX 내보내기 시점으로 미루었으며, PPT 템플릿을 IndexedDB에 영속화
- `v1.0.1`: PPT와 CAD 작업 공간 이미지의 영속성 문제를 수정

## ✨ 개요

| 캔버스 | 핵심 역할 | 대표 산출물 |
| --- | --- | --- |
| `Flow` | draw.io XML 기반 생성 및 부분 편집 | 플로우차트, 시스템 다이어그램, 논리도 |
| `CAD` | 인테리어 워크플로 설계 및 분석 | 분석 보드, 2D 평면도, 렌더 작업, BOM |
| `PPT` | 구조화된 슬라이드 생성과 이미지 우선 반복 작업 | 프레젠테이션 자료, 슬라이드 비주얼, 다중 형식 내보내기 |

## 🚀 이번 업데이트

- PPT가 이제 이미지 우선 워크플로로 동작합니다
- 편집 영역에서의 미세 조정과 재렌더링은 생성 단계에서 편집 가능한 텍스트 레이어를 미리 처리하지 않고, 슬라이드 이미지를 직접 다시 생성합니다
- 내보내기는 `PDF`, `이미지 기반 PPT`, `편집 가능한 PPTX` 세 가지로 나뉩니다
- OCR, 텍스트 제거 배경 생성, 텍스트 재배치는 `편집 가능한 PPTX`를 내보낼 때만 실행됩니다
- 업로드한 PPT 템플릿과 숨긴 프리셋 템플릿 설정은 이제 IndexedDB 기반 로컬 저장으로 유지됩니다

## 🖼️ 캔버스 미리보기

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

## 🌐 온라인 데모

- [CanvasAnvil 열기](https://canvasanvil.codingfgd.asia)

## 🎬 영상 튜토리얼

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## 🧩 기능 개요

- `Flow`: draw.io XML 기반 플로우차트 생성 및 부분 편집
- `CAD`: 인테리어 워크플로 계획, 분석 보드, 2D 평면도, 렌더 작업, BOM
- `PPT`: 구조화된 슬라이드 생성, 이미지 우선 반복 작업, 템플릿 저장, 다중 형식 내보내기

## ⚡ 빠른 시작

1. 의존성 설치

```bash
npm install
```

2. 로컬 개발 시작

```bash
npm run dev
```

기본 URL: `http://localhost:5173`

3. 타입 체크 실행

```bash
npm run check
```

4. 프로덕션 빌드

```bash
npm run build
```

## 🛠️ 자주 쓰는 명령

- `npm run dev`: Vite 개발 서버 시작
- `npm run dev:full`: Web과 API 개발 서버를 함께 시작
- `npm run dev:web`: 프런트엔드 개발 서버 시작
- `npm run dev:api`: API 개발 서버 시작
- `npm run check`: TypeScript 검사
- `npm run lint`: ESLint 검사
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 미리보기
- `npm start`: API 서비스 시작

## 🧪 개발 메모

- AI 설정은 로컬 앱 설정에서 읽으며, 사용자 지정 모델 제공자와 연결할 수 있습니다
- PPT 로컬 개발은 로컬 `/api/ppt-ai` 프록시 라우트에 의존합니다
- `vite.config.ts`의 로컬 API 라우팅을 변경한 경우 개발 서버를 다시 시작해야 합니다

## 🗂️ 프로젝트 구조

```text
.
├── agent/                      # Agent 프롬프트와 서브 Agent 명세
├── public/                     # 정적 에셋
├── src/
│   └── workspaces/
│       ├── flow/               # Flow 캔버스
│       ├── cad/                # CAD 캔버스
│       └── ppt/                # PPT 캔버스
├── api/                        # 로컬 API 라우트
└── README.md
```

## 🔗 출처와 통합

- Flow 캔버스: [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)를 통합하고 확장
- PPT 캔버스: [banana-slides](https://github.com/Anionex/banana-slides.git)를 통합하고 확장
- CAD 캔버스: agent 워크플로, 2D SVG 편집, 렌더 오케스트레이션, BOM 파이프라인을 포함한 자체 구현

## 📚 문서

- 배포 가이드: [deploy/README.md](deploy/README.md)

## 📮 연락처

아래 WeChat QR 코드를 스캔해 작성자에게 연락할 수 있습니다.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
