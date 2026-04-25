# Contributing to CanvasAnvil

Thanks for taking the time to improve CanvasAnvil. This project combines multiple creative workspaces, so the most helpful contributions are focused, reproducible, and easy to review.

## 🚀 Local Setup

Prerequisites:

- Node.js 20+
- npm 9+ or the npm version bundled with your Node.js installation

Install dependencies:

```bash
npm install
```

Start the full local development stack:

```bash
npm run dev:full
```

Default local services:

- 🧩 Main app: [http://127.0.0.1:8001](http://127.0.0.1:8001)
- 📑 PPTist Lab: [http://127.0.0.1:8003](http://127.0.0.1:8003)

## ✅ Quality Checks

Before opening a pull request, run:

```bash
npm run check
```

If your change touches `pptist-lab`, also run:

```bash
npm --prefix pptist-lab run type-check
```

## 🧭 What To Contribute

Good contribution areas include:

- 🐛 Bug fixes with clear reproduction steps
- ⚡ Performance and stability improvements
- 📝 Documentation improvements
- 🎨 UX improvements for Flow, CAD, PPT, Poster, Infographic, and Product workspaces
- 📦 Deployment improvements for the main app and standalone `pptist-lab` service

For large changes, open an issue first so the direction can be discussed before implementation.

## 📌 Pull Request Guidelines

- Keep pull requests focused and scoped to one clear outcome.
- Describe the problem, the approach, and any tradeoffs.
- Include screenshots or short recordings for visible UI changes.
- Mention any deployment or configuration changes explicitly.
- Run the relevant checks before submitting.
- Avoid mixing unrelated formatting-only edits into functional changes.

## 🧱 Coding Style

- Follow the patterns already used in the files you edit.
- Prefer TypeScript types for public APIs and shared data structures.
- Keep abstractions small and justified by real duplication or complexity.
- Keep user-facing text clear and consistent in English and Simplified Chinese where applicable.

## 🧹 Files Not To Commit

Do not commit local runtime artifacts or temporary debugging files, such as:

- `.tmp-*`
- `*.log`
- local downloaded bundles
- build output directories
- machine-specific environment files

If a file is only useful for local debugging, leave it out of the pull request.

## 🏷️ Commit Messages

Use clear, descriptive commit messages. Conventional-style messages are preferred:

```text
fix: handle missing ppt editor origin in production
docs: improve dual-service deployment guide
feat: add portal entry for product canvas
```

## 🛡️ Reporting Issues

For non-security issues, open a GitHub issue and include:

- What you expected
- What actually happened
- Steps to reproduce
- Logs, screenshots, or recordings when helpful
- Browser and deployment environment if the issue is UI or deployment related

For sensitive issues, contact the maintainers through the repository contact channel before opening a public report.
