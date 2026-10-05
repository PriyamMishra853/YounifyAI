# Handoff

Everything needed to pick this up cold — including by a different AI model or a new developer.

## Start from nothing

```bash
git clone https://github.com/PriyamMishra853/YounifyAI.git
cd YounifyAI
npm install          # one install for all three workspaces
npm run dev          # API on :8787, site on :5173
```

Open http://localhost:5173, create an account, and capture something. No database to install: Postgres
runs in-process (PGlite) and writes to `backend/data/pg`. Uploads go to `backend/storage`. Delete both
folders for a clean slate.

Requirements: Node 20.11+ (tested on 24). Windows, macOS and Linux all work; `ffmpeg` ships with the
`ffmpeg-static` dependency.

## Turning on real AI

```bash
cp backend/.env.example backend/.env
# then put one key in it:
GROQ_API_KEY=gsk_...
```

Restart the API. `GET /api/health` reports the provider. Groq's free tier is enough for a demo: Whisper
for voice, Llama for writing documents, Llama 4 Scout for images. OpenAI works the same way with
`OPENAI_API_KEY` and also provides embeddings.

Without a key everything still runs offline: pasted text, documents, images (OCR) and **YouTube links**
work; only voice and video recordings ask for a provider.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | API + site together |
| `npm run dev:web` | site only (falls back to the in-browser preview) |
| `npm run dev:mock` | site, forced into preview mode |
| `npm test` | 16 shared tests + 41 backend tests (fresh in-memory database per file) |
| `YT_LIVE=1 npm test --workspace backend` | also runs the live YouTube test |
| `npm run build` | builds the site |
| `npm start` | production: build, then one process serves site + API on :8787 |
| `npm run migrate --workspace backend` | apply migrations to whatever `DATABASE_URL` points at |

## Deploying

1. **Database.** Create a Supabase project (or any Postgres 15+). Put the pooled connection string in
   `DATABASE_URL`. Run `npm run migrate --workspace backend`.
2. **Files.** The local disk works on a server with a persistent volume. For object storage, replace
   `createLocalStorage` in `backend/src/storage.js` — five methods: `put`, `putBuffer`, `read`, `exists`,
   `remove` (plus `localPath` for ffmpeg and OCR, which can write to a temp file first).
3. **Process.** `NODE_ENV=production npm start`. Set `APP_ORIGIN` to the public URL, and `COOKIE_SECURE=true`
   behind HTTPS. Scale the API horizontally; set `RUN_WORKER=false` on API replicas and run one or more
   worker-only processes (`RUN_WORKER=true`) if captures get heavy.
4. **Secrets.** `GROQ_API_KEY` / `OPENAI_API_KEY`, `DATABASE_URL`, and optionally `QDRANT_URL` +
   `QDRANT_API_KEY`. Nothing else is required.

## Changing things

**A new document type.** Add a template to `shared/src/catalog.js` (`fields`, `accepts`, `description`).
It appears in capture, the editor, exports and validation at once; the backend upserts built-ins on boot.
Template-specific checks go in `validateDocument`, derived values in `computeDerived`.

**A new AI model.** Set `AI_CHAT_MODEL` / `AI_VISION_MODEL` / `AI_TRANSCRIBE_MODEL` / `AI_FAST_MODEL`.

**A new AI vendor.** If it speaks the OpenAI HTTP API, add a file like `backend/src/ai/groq.js` with its
base URL and model ids. Otherwise write a provider exporting `extract`, `embed`, `generate` and `models`
(see [05-ai-pipeline.md](05-ai-pipeline.md)) and register it in `backend/src/ai/index.js`. Nothing outside
`src/ai/` knows which vendor is in use.

**Swapping authentication.** `users` and `sessions` are ours on purpose, so the project runs without any
hosted service. To move to Supabase Auth: verify the Supabase JWT in `middleware.js` instead of
`resolveSession`, map `auth.uid()` to `memberships.user_id`, and drop our two tables. The rest of the API
and all row-level security keep working, because everything downstream depends on
`req.ctx.workspace.id`, not on how the person signed in.

**Changing the embedder.** Point `embed()` at the new model, keep 384 dimensions (or change the column
type in a migration), and re-embed: delete `source_chunks` rows and re-add the sources.

## Where things live

```
shared/src/
  catalog.js      templates, plans, roles, input kinds        ← start here to change the product
  document.js     empty/normalize/validate/derive/markdown/JSON-schema
  heuristics.js   offline structuring (bills, meetings, diaries)
  transcript.js   offline lecture notes from a transcript
backend/src/
  routes.js       every endpoint          middleware.js  auth, roles, uploads, errors
  db/             migrations, driver (PGlite or pg), seed
  services/       auth, workspaces, templates, sources, jobs, documents, exports, audit, serialize
  pipeline/       stages.js (the seven), worker.js (claiming, retries)
  ai/             index.js (choose provider), offline, groq, openai, openaiCompatible,
                  extract.js (files), media.js (ffmpeg), youtube.js, prompt.js, vectors.js
frontend/src/
  pages/, components/, three/ (hero), lib/api (live + mock), lib/auth.jsx, styles/index.css
```

## Testing approach

- **Shared** (`node --test`): pure functions — validation, coercion, exports, Hinglish parsing, transcripts.
- **Backend**: every test boots the real stack (Express + Postgres in memory + worker) and drives it over
  HTTP with supertest. Workspace isolation, roles, quotas, versioning, approval, exports and the full
  pipeline are covered end to end.
- **No vendor keys needed**: a stub HTTP server speaks the OpenAI API, and another speaks Qdrant. The live
  YouTube test is behind `YT_LIVE=1`.

Run one file: `node --test test/documents.test.js` from `backend/`.

## Known limits

| Limit | Detail |
|---|---|
| No payments | Plan switching is instant and free; wire a provider to `PUT /workspace/plan` |
| No emails | Invitations wait until that person signs up with the same email |
| Scanned PDFs | Reported rather than OCR'd; upload the pages as images |
| YouTube without captions | Refused with an explanation. Download the audio yourself and upload it |
| Hindi notes | Transcripts in Hindi are translated by YouTube when possible; the offline summariser is tuned for English |
| Single-process events | SSE pushes come from the local worker; other processes are caught by the 1.5 s poll |
| Rate limits | Free AI tiers limit tokens per minute; long lectures are condensed in parts and retried, which can take a minute or two |

## If something breaks

| Symptom | Look at |
|---|---|
| "Cannot reach the YounifyAI server" | the API process; `curl localhost:8787/api/health` |
| App says "Preview mode" | the API was down when the page loaded — start it and reload |
| Job failed with a provider message | `GET /api/health` → provider and models; check the key and model ids |
| YouTube link refused | the message says why (no captions, private, live). Try another lecture |
| Everything 401 after a restart | cookies survive restarts, but `backend/data` deleted means a new database — sign up again |
| Port already in use | another copy is running: `netstat -ano | findstr :8787` |
