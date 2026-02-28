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

### Natural Language Querying
Type what you want. Agent M figures out the query.

> *"Show me all orders from last week where the total is above $500"*
> *"Find users who signed up in January but never made a purchase"*
> *"Which products have low stock and high sales velocity?"*

The AI understands your database schema, conversation history, and picks the right operation — `find`, `aggregate`, `SELECT`, `JOIN`, or a full script. Write operations require your explicit confirmation before anything changes.

### AI Error Repair
When a query fails, Agent M analyzes the error, understands why it happened, and suggests a corrected query — with an explanation.

### Dashboards & Visualization
Build interactive dashboards with drag-and-drop widgets. Every query result can become a widget:

| Chart Type | Chart Type | Chart Type |
|---|---|---|
| Bar Chart | Line Chart | Area Chart |
| Stacked Area | Multi-Line | Scatter Plot |
| Pie Chart | Donut Chart | Summary Card |
| Data Table | Map (geo) | — |

Dashboards support auto-refresh (30s → 1hr) and AI-generated widget descriptions.

### Spreadsheet → Database Import
Drop in an Excel or CSV file. Agent M:
1. Analyzes the data structure and detects relationships between sheets
2. Designs an optimized database schema (collections/tables, field types, indexes)
3. Creates the database and imports your data

Supports `.xlsx`, `.xls`, and `.csv` up to 500MB.

### AI Field Descriptions
For any collection or table, Agent M can read sample field values and generate plain-English descriptions for every field — useful for onboarding and documentation.

### Metadata Generation
For databases with 10+ collections, Agent M generates AI-powered metadata that gives the query engine a deeper understanding of your data, improving query accuracy.

### Full Query History & Favorites
Every query is saved locally. Browse past queries, re-run them, or bookmark the ones you use most.

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

Agent M routes requests to whichever model you configure. At least one API key is required.

**OpenAI**
- `gpt-4.1` · `gpt-4.1-mini` · `gpt-4.1-nano`
- `o3` · `o4-mini`

**Google**
- `gemini-2.5-flash` · `gemini-2.5-pro`

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
npm run dev
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
npm run dev

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

1. Fork the repo
2. Create a branch: `git checkout -b my-feature`
3. Make your changes and commit
4. Open a pull request

Please open an issue first for large changes so we can discuss the approach.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
