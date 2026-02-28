# Contributing to Agent M

Thanks for taking the time to contribute. This document covers everything you need to get started.

---

## Table of Contents

- [Getting the code running](#getting-the-code-running)
- [Project structure](#project-structure)
- [How to contribute](#how-to-contribute)
- [Types of contributions](#types-of-contributions)
- [Code style](#code-style)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs](#reporting-bugs)

---

## Getting the code running

### 1. Fork and clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/AgentM.git
cd AgentM
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and add at least one AI API key:

```env
OPENAI_API_KEY=your_openai_key_here
# or
GEMINI_API_KEY=your_gemini_key_here
```

### 3. Install dependencies

```bash
npm install
```

This installs everything for both the `app` and `backend` workspaces in one step.

### 4. Start the app

```bash
npm start
```

The backend starts on port `8787`. The Electron window opens automatically.

If you want to run them separately:

```bash
# Terminal 1 — backend (auto-reloads on TypeScript changes)
npm run dev:backend

# Terminal 2 — Electron app (Vite HMR for the renderer)
npm run dev:app
```

---

## Project structure

```
AgentM/
├── app/              # Electron + React frontend
│   ├── electron/     # Main process (Node.js): DB connections, IPC, storage
│   └── src/          # Renderer process (React): UI components, contexts
├── backend/          # Express API server (TypeScript): AI calls only
└── package.json      # npm workspace root
```

**Key things to know:**

- All **database operations** run in the Electron main process (`app/electron/`). They never go through the backend.
- The **backend** (`backend/`) only handles AI API calls. It holds no user data.
- The **renderer** (`app/src/`) communicates with the main process via IPC (see `app/electron/preload.js` for the exposed API).

---

## How to contribute

### For small changes (typo, bug fix, minor improvement)

1. Create a branch from `main`:
   ```bash
   git checkout -b fix/short-description
   ```
2. Make your change, commit, and push.
3. Open a pull request.

### For larger changes (new feature, new database adapter, new AI provider)

1. **Open an issue first** and describe what you want to build. This avoids duplicate work and lets us discuss the approach before you invest time in it.
2. Once discussed, fork, branch, build, and open a PR that references the issue.

---

## Types of contributions

### Bug fixes
Found something broken? Check if there's already an open issue. If not, open one with steps to reproduce, then submit a fix.

### New database adapter
The app currently supports MongoDB and PostgreSQL. Adding a new database type means:
- Creating a new adapter in `app/electron/database/adapters/`
- Following the same interface as `mongodb-adapter.js` or `postgresql-adapter.js`
- Registering it in `app/electron/database/connection-manager.js`
- Adding connection string examples to `app/src/components/connection/ConnectionForm.jsx`

### New AI provider
AI providers live in `backend/src/services/`. Adding one means:
- Creating a new service file following the pattern of `openai.service.ts` or `gemini.service.ts`
- Registering it in `backend/src/services/manager.ts`
- Adding the model names to the `/models` endpoint in `backend/src/v1/agent.routes.ts`

### UI improvements
The frontend uses React 18 and Material UI 7. Components live in `app/src/components/`. Keep new UI consistent with the existing style.

### Documentation
Improving the README, fixing incorrect docs, or adding inline comments to complex code is always welcome.

---

## Code style

### JavaScript / JSX (frontend)
- No strict linting config — follow the surrounding code style
- Use functional components and hooks
- Prefer `async/await` over `.then()` chains

### TypeScript (backend)
The backend has ESLint configured. Before submitting, run:

```bash
cd backend
npm run lint
npm run typecheck
```

Fix any errors before opening a PR.

### General
- Keep commits focused — one logical change per commit
- Write clear commit messages that describe *why*, not just *what*
- Don't add comments that just narrate what the code does

---

## Submitting a pull request

1. Make sure the app still starts and works with your change (`npm start`)
2. Run the backend linter and typecheck (see above)
3. Push your branch and open a PR against `main`
4. Fill in the PR description:
   - What does this change?
   - Why is it needed?
   - Any trade-offs or known limitations?
5. Link any related issues

A maintainer will review and either merge, request changes, or explain if it's out of scope.

---

## Reporting bugs

Open an issue and include:

- **What you did** — steps to reproduce
- **What you expected** — what should have happened
- **What actually happened** — the actual behavior or error
- **Environment** — OS, Node.js version, which database, which AI provider
- **Logs** — any error messages from the Electron DevTools console or backend terminal

---

Thank you for contributing.
