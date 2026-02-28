<div align="center">

# Agent M

### AI-Powered Database Desktop App

Query your databases in plain English. Visualize results instantly. Import spreadsheets with AI-designed schemas.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-28-47848F)](https://www.electronjs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/amit221/AgentM/pulls)

</div>

---

## What is Agent M?

Agent M is an open-source desktop app that puts an AI layer on top of your databases. Instead of writing queries by hand, you describe what you want — and Agent M generates the query, runs it, and displays the results. It works with MongoDB, PostgreSQL, and Supabase, and supports the latest models from OpenAI and Google.

Everything runs locally. Your data never leaves your machine.

---

## Features

- **Natural language querying** — Describe what you want, get back a query and results. No SQL or MongoDB shell required.
- **Dashboards** — Turn any query into a chart, table, summary card, or map. Drag, drop, and auto-refresh.
- **Spreadsheet import** — Drop an Excel or CSV file. AI designs the schema and creates the database for you.
- **AI error repair** — When a query fails, the AI explains why and suggests a fix.
- **Field descriptions** — Generate plain-English descriptions for every field in your database from sample data.
- **Query history & favorites** — Every query is saved locally. Bookmark the ones you reuse.

---

## Supported Databases

| Database | Connection | Notes |
|---|---|---|
| **MongoDB** | Local or Atlas URI | Shell-style queries: `find()`, `aggregate()`, `insertOne()`, etc. |
| **PostgreSQL** | Standard URI | Full SQL: `SELECT`, `JOIN`, `CTE`, DDL, and more |
| **Supabase** | Supabase connection string | PostgreSQL-based with connection pooling support |

Multiple connections can be open simultaneously. Each connection has its own conversation workspace.

---

## Supported AI Models

Agent M works with **any OpenAI or Google Gemini model**. Set your API key and type any model name — the provider is auto-detected from the name.

| Provider | API Key env var | Example models |
|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `o3`, `o4-mini`, any future model |
| **Google** | `GEMINI_API_KEY` | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`, any future model |

The UI shows a list of suggested models, but you can type any model ID that your API key has access to.

Default: `gpt-4.1-mini`

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (included with Node.js)
- An API key from [OpenAI](https://platform.openai.com/api-keys) or [Google AI Studio](https://aistudio.google.com/apikey)

### Install & Run

```bash
git clone https://github.com/amit221/AgentM.git
cd AgentM

# Set your API key(s)
cp .env.example .env
# Edit .env and add OPENAI_API_KEY or GEMINI_API_KEY

# Install all dependencies
npm install

# Start the app
npm start
```

The backend starts on port `8787`. The Electron app opens automatically.

### Environment Variables

```env
# Provide at least one
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=your_gemini_key_here

# Which provider to use by default: "openai" or "gemini"
AI_PROVIDER=openai

# Backend port (defaults to 8787)
PORT=8787
```

---

## Project Structure

This is an npm workspace monorepo with two packages.

```
AgentM/
├── app/                        # Electron + React desktop app
│   ├── electron/
│   │   ├── main.js             # Electron entry point
│   │   ├── preload.js          # IPC bridge (context isolation)
│   │   ├── database/           # Connection manager + adapters
│   │   │   ├── connection-manager.js
│   │   │   └── adapters/       # MongoDB + PostgreSQL adapters
│   │   ├── services/           # Spreadsheet service, shell manager
│   │   └── storage/            # Encrypted local storage
│   └── src/
│       ├── components/
│       │   ├── views/          # Query, Dashboard, Spreadsheet, Settings ...
│       │   ├── chat/           # Chat UI, message renderer
│       │   ├── dashboard/      # Widget system
│       │   ├── connection/     # Connection form + management
│       │   └── results/        # Table, chart, JSON, tree result views
│       ├── context/            # React state (Query, App, Connection)
│       └── utils/              # HTTP client, helpers
│
├── backend/                    # Express.js AI API server (TypeScript)
│   └── src/
│       ├── v1/                 # REST endpoints
│       │   ├── agent.routes.ts       # /decide, /error, /field-descriptions
│       │   ├── metadata.routes.ts    # /generate, /select-collections
│       │   ├── spreadsheet.routes.ts # /analyze
│       │   └── chart.routes.ts
│       ├── ai/                 # Agent logic, prompt builder, protocol
│       └── services/           # OpenAI + Gemini provider wrappers
│
├── .env.example
├── package.json                # Root workspace config
└── LICENSE
```

---

## Development

```bash
# Start everything (backend + Electron app)
npm start

# Start only the backend
npm run dev:backend

# Start only the Electron app (backend must already be running)
npm run dev:app
```

The backend uses `tsx watch` for hot-reload on TypeScript changes.
The frontend uses Vite for fast HMR.

---

## How It Works

```
User types a question
        │
        ▼
  Electron renderer
  (React + Vite)
        │  HTTP
        ▼
  Express backend  ──────► OpenAI / Gemini
  (port 8787)               (AI model)
        │
        │  Returns query + explanation
        ▼
  Electron main process
  (runs query against your DB)
        │
        ▼
  Results rendered in app
  (table / chart / JSON / tree)
```

The backend only handles AI calls. All database operations happen in the Electron main process, directly from your machine — your data never passes through the backend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 28 |
| Frontend | React 18, Material UI 7, Vite 5 |
| Code editors | CodeMirror 6 (SQL + JavaScript) |
| Charts | MUI X Charts 8 |
| Maps | Leaflet + React Leaflet |
| Backend | Express.js, TypeScript |
| AI SDKs | OpenAI 4, Google Generative AI |
| Database drivers | mongodb 6, pg 8 |
| Data import | xlsx, csv-parser |

---

## Contributing

Contributions are welcome — bug fixes, new features, database adapters, or new AI providers.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
