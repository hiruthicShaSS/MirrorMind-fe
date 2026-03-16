# Mirror Mind UI

Minimal notes to get a **repeatable test run** on any machine or CI.

## 1) Prerequisites
- Node.js 20.x (LTS) and npm 10.x (lockfile was generated with npm 10).
- A clean git checkout (avoid stray deps or build artefacts).

## 2) One-time setup
```bash
npm ci
```
`npm ci` is deterministic and installs exactly what is in `package-lock.json`.

## 3) Environment
- Copy `.env.example` to `.env` and fill any required values (e.g., API keys).  
- For purely frontend builds/linting, empty or placeholder values are fine.

## 4) Reproducible checks
Run in this exact order; each step should pass before moving on:
```bash
# Typecheck + production build
npm run build

# Lint (same ESLint rules CI would run)
npm run lint
```

## 5) Local smoke test (optional but recommended)
```bash
npm run dev -- --host --port 5173
```
Open http://localhost:5173 and verify the app renders the login flow and live view without console errors.

## 6) Quick clean/reset
If you need to reset the workspace before re-running tests:
```bash
git clean -fdX   # removes untracked files like node_modules, dist, *.log
npm ci
```

## 7) What’s not here (yet)
- No automated unit/e2e test suite is defined. Until tests are added, treat `npm run build` + `npm run lint` as the reproducible gate.
