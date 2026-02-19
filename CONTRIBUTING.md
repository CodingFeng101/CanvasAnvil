# Contributing

Thanks for your interest in contributing to CanvasAnvil.

## Getting Started

Prerequisites:

- Node.js 20+
- npm 9+ (or the npm that ships with Node.js)

Install and run:

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run check
npm run lint
```

## What To Contribute

- Bug fixes
- Performance and stability improvements
- Documentation improvements
- UX improvements for the Flow/CAD/PPT canvases

If you plan to do a large change, open an issue first to align on direction.

## Pull Request Guidelines

- Keep PRs focused and small when possible.
- Describe the problem and the approach clearly.
- Include screenshots or short recordings for UI changes.
- Run `npm run check` before submitting.

## Coding Style

- TypeScript: prefer explicit types on public APIs.
- Keep changes consistent with existing code patterns in the edited area.
- Avoid unrelated formatting-only refactors.

## Commit Messages

No strict format required, but keep messages clear and descriptive, e.g.:

- `fix: handle missing svgedit assets in prod`
- `docs: improve deploy guide`

## Reporting Issues

For non-security issues, use GitHub Issues and include:

- what you expected vs what happened
- steps to reproduce
- logs / screenshots if helpful

For security issues, please follow `SECURITY.md`.
