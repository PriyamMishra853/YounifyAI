# YounifyAI

**Capture anything. Document everything.** Lecture videos, voice notes, photos, chats and files go in;
structured notes, reports, diaries and bills come out, for a person to review, approve and export.

Built for CSJMU Ideathon 2026 by Team UnfilteredEngineers (Priyam Mishra, Ashish Kumar, Ayush Srivastav).

## Run it

Requires Node 20.11+ (tested on 24). No database or Docker needed: Postgres runs in-process (PGlite).

```bash
npm install
npm run dev
```

- Website and app: http://localhost:5173
- API: http://localhost:8787 (the website proxies `/api` to it)

Data lives in `backend/data/pg` (database) and `backend/storage` (uploads). Delete both folders to start fresh.

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev:web` | Website only. With no API running, the app switches to an in-browser preview mode (localStorage). |
| `npm run dev:mock` | Website forced into preview mode, even if the API is running |
| `npm test` | Shared domain tests and backend integration tests (in-memory Postgres) |
| `npm start` | Production: builds the website and serves it from the API process on port 8787 |

## AI providers

Without any key the pipeline runs offline: pasted text and `.txt`/`.md`/`.csv` files are structured by rules
(including Hinglish bills priced from your price list). To read voice, video, images, PDFs and Word files, add a key to
`backend/.env` (copy `backend/.env.example`):

```bash
GROQ_API_KEY=...        # Whisper + Llama + vision
# or
OPENAI_API_KEY=...
```

## Where things are

```
frontend/   React + Vite site and app (3D hero in src/three, pages in src/pages)
backend/    Express API, Postgres schema (src/db/migrations), pipeline (src/pipeline), AI providers (src/ai)
shared/     Templates, plans, validation, exports, offline structuring — used by both
docs/       Design spec, architecture, SQL schema, data flow, API reference, handoff guide
```

Start with `docs/README.md`.
