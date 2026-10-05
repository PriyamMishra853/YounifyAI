# YounifyAI

**Capture anything. Document everything.** Lecture videos, YouTube links, voice notes, photos, chats and
files go in; structured notes, reports, diaries and bills come out, for a person to review, approve and export.

Built for CSJMU Ideathon 2026 by Team UnfilteredEngineers (Priyam Mishra, Ashish Kumar, Ayush Srivastav).

## Run it

Requires Node 20.11+ (tested on 24). No database or Docker to install: Postgres runs in-process.

```bash
npm install
npm run dev
```

- Website and app: http://localhost:5173
- API: http://localhost:8787

Data lives in `backend/data/pg` and `backend/storage`. Delete both folders to start fresh.

## Demo: a YouTube lecture becomes notes

1. Open http://localhost:5173 and create an account (any email; it is stored locally).
2. **New capture** → template **Lecture Notes** → **YouTube link**.
3. Paste a lecture with captions, for example `https://www.youtube.com/watch?v=aircAruvnKk`, and press
   **Add video**. The title, channel, length and "captions available" appear.
4. **Generate document.** The seven stages run live: the captions are fetched, cleaned, structured,
   checked and saved.
5. Review the notes (summary, key points per chapter with timestamps, concepts, revision questions),
   **Approve**, then **Export** as PDF.

This works with no API key. Add one for better writing:

```bash
cp backend/.env.example backend/.env   # then set GROQ_API_KEY=... and restart
```

With a key, voice notes and video recordings are transcribed (Whisper), photos are read by a vision model,
and a language model writes the documents. Without one, pasted text, documents, images (OCR) and YouTube
links still work through local rules.

## Other scripts

| Command | What it does |
|---|---|
| `npm run dev:web` | Website only. With no API running, the app switches to an in-browser preview (localStorage). |
| `npm run dev:mock` | Website forced into preview mode |
| `npm test` | Shared domain tests and backend integration tests (in-memory Postgres, no API keys) |
| `npm start` | Production: builds the website and serves it from the API process on port 8787 |

## Where things are

```
frontend/   React + Vite site and app (3D hero in src/three, pages in src/pages)
backend/    Express API, Postgres schema (src/db/migrations), pipeline (src/pipeline), AI providers (src/ai)
shared/     Templates, plans, validation, exports, offline structuring — used by both
docs/       Design spec, architecture, data model, data flow, API, AI pipeline, frontend, handoff
```

Start with [docs/README.md](docs/README.md).
