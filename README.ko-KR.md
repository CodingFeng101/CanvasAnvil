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

CanvasAnvil은 하나의 요구사항을 반복 가능한 결과물로 전환하는 멀티 캔버스 AI 제작 플랫폼입니다.

## 캔버스 미리보기

<table>
  <tr><td width="680" align="center"><strong>Flow 캔버스</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Flow 캔버스" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>CAD 캔버스</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="CAD 캔버스" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>PPT 캔버스</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="PPT 캔버스" width="680" /></td></tr>
</table>

## 동영상 튜토리얼

- [Bilibili에서 보기](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube에서 보기](https://youtu.be/n3Otj--aLRo)
- [Douyin에서 보기](https://v.douyin.com/JwlwhmE6R40/)

## CanvasAnvil 사용해보기

- [CanvasAnvil 열기](https://canvasanvil.codingfgd.asia)
- 참고: 현재 서버 사양이 높지 않아 간헐적으로 지연이 발생할 수 있습니다.

## 기능 개요 (사용자 관점)

- `Flow`: 플로우차트 생성 및 부분 편집 (draw.io XML)
- `CAD`: 실내 설계 계획, 분석 보드, 2D 평면도, 렌더 작업, BOM
- `PPT`: 프레젠테이션 초안 생성 및 반복 편집

## 일반 워크플로

1. 요구사항 입력
2. 설계안 생성 및 반복 개선
3. 분석 보드 생성 후 전략 확인
4. 2D 평면도 생성 및 편집
5. 결과물 내보내기 (다이어그램 / 목록 / 슬라이드)

## 빠른 시작

1. 의존성 설치
```bash
npm install
```
2. 개발 서버 시작
```bash
npm run dev
```
기본 URL: `http://localhost:5173`

3. 타입 검사
```bash
npm run check
```
4. 프로덕션 빌드
```bash
npm run build
```

## 출처 및 통합

- Flow 캔버스: [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) 기반 통합/개선
- PPT 캔버스: [banana-slides](https://github.com/Anionex/banana-slides.git) 기반 통합/개선
- CAD 캔버스: 자체 구현 (아키텍처, Agent 워크플로, 2D SVG 편집 파이프라인, BOM/렌더 파이프라인)

핵심 개선 사항:

- 캔버스 전반의 통합 UX (채팅, 코드 블록, 원클릭 적용)
- 더 안정적인 Agent 라우팅 및 재시도 메커니즘
- CAD 전용 기능 (patch / replace / BOM / 7-슬롯 렌더 워크플로)
- 캔버스 간 상태/버전/내보내기 파이프라인

## 핵심 기능 (개발자 관점)

- Flow: 채팅 기반 플로우차트 생성, patch/replace, 원클릭 적용, 스냅샷 복원
- CAD: `cad_plan` 출력, 분석 보드 병렬 생성, 분석 이미지 참조 기반 2D SVG 부분 업데이트, 렌더 작업 동시 실행, BOM 내보내기
- PPT: 구조화된 콘텐츠 생성, 페이지 단위 증분 편집, 스트리밍 반복

## 기술 스택

- 프론트엔드: React 18 + TypeScript + Vite
- UI: Tailwind CSS + Radix UI + Lucide
- 다이어그램 엔진: Flow는 draw.io/diagrams.net, CAD는 SVG-Edit
- 모델 통합: 구성 가능한 멀티 모델 접근 (채팅 / 이미지)

## 유용한 스크립트

- `npm run dev`: 개발 서버 시작
- `npm start`: 프로덕션 시작 (정적 사이트 + API)
- `npm run build`: 프로덕션 빌드
- `npm run check`: TypeScript 검사
- `npm run lint`: ESLint

## 프로젝트 구조 (핵심 경로)

```text
.
|- agent/                      # CAD/Flow/PPT 프롬프트 및 서브 Agent 명세
|- public/                     # 정적 자산 (SVG-Edit 포함)
|- src/
|  |- workspaces/
|  |  |- flow/                 # Flow 캔버스
|  |  |- cad/                  # CAD 캔버스 (자체 코어)
|  |  |- ppt/                  # PPT 캔버스
|- api/                        # API 로직
|- README.md
```

## 문서

- 배포 가이드: [배포 가이드 열기](deploy/README.md)

## 위챗 연락처

제 WeChat QR 코드는 아래에 있습니다. 편하게 연락해 주세요.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
