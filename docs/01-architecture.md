# Architecture

## The shape of it

```
                    browser
    ┌──────────────────────────────────────────┐
    │ React app (Vite)                         │
    │  marketing site · workspace app          │
    │  3D hero (three.js) · scroll (GSAP)      │
    └───────────────┬──────────────────────────┘
                    │ fetch /api  (cookie: yf_session, SameSite=Lax)
                    │ SSE /api/jobs/:id/events
    ┌───────────────▼──────────────────────────┐
    │ Express API            backend/src       │
    │  middleware: origin guard, session,      │
    │              roles, zod validation       │
    │  routes.js  → services/* → db            │
    └───────┬──────────────────────┬───────────┘
            │                      │
   ┌────────▼─────────┐   ┌────────▼────────────────────┐
   │ Pipeline worker  │   │ Postgres (schema "app")     │
   │  claims jobs     │◄──┤  PGlite locally             │
   │  runs 7 stages   │   │  Supabase in production     │
   └───┬──────────┬───┘   │  pgvector for retrieval     │
       │          │       └─────────────────────────────┘
       │          │
┌──────▼────┐ ┌───▼──────────────┐
│ Storage   │ │ AI provider      │
│ uploads   │ │ groq / openai /  │
│ (disk or  │ │ offline rules    │
│ Supabase) │ │ + YouTube, OCR,  │
└───────────┘ │ ffmpeg, parsers  │
              └──────────────────┘
```

Everything runs in **one Node process** by default: the API and the worker share a database handle and
an in-process event emitter. `RUN_WORKER=false` splits them: run one process for the API and another
for workers, pointed at the same `DATABASE_URL`. Nothing else changes, because workers claim jobs with
`FOR UPDATE SKIP LOCKED` rather than from memory.

## Why these pieces

| Decision | Reason | Where to change it |
|---|---|---|
| Postgres everywhere | Same SQL locally and on Supabase. No "works on my machine" schema drift. | `backend/src/db/index.js` |
| PGlite for local dev | Real Postgres 18 in-process: no Docker, no install, and tests get a fresh database in memory. | `PGLITE_DIR`, or set `DATABASE_URL` |
| Tables in schema `app` | Supabase exposes `public` through its REST API. Nothing of ours should be reachable that way. | `001_schema.sql` |
| Row-level security through `app_user` | The database enforces workspace isolation even if a query forgets `WHERE workspace_id = …`. | `002_security.sql`, `db.withWorkspace` |
| Jobs in a table, not a queue service | One fewer moving part; survives restarts; any number of workers; easy to inspect while demoing. | `pipeline/worker.js` |
| Provider interface for AI | Groq, OpenAI, or local rules behind four methods. Swapping vendors is one file. | `backend/src/ai/` |
| `shared` package | The editor validates with exactly the same code the server approves with. | `shared/src/` |

## Request path

1. `originGuard` rejects writes from origins that are not allowed (second layer behind SameSite cookies).
2. `authenticate` turns the `yf_session` cookie into `req.ctx = { user, workspace, role, sessionId }`.
3. `requireAuth` / `requireRole('owner','editor')` gate the route.
4. Zod parses the body; failures become a 422 whose `fields` map onto form inputs.
5. The handler runs its work inside `inWorkspace(db, req, fn)`, a transaction that does:

   ```sql
   set local role app_user;
   select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true);
   ```

   From here on, row-level security limits every statement to that workspace.
6. Services return plain objects shaped by `services/serialize.js`.

Identity tables (`users`, `sessions`) are deliberately outside that role: `app_user` cannot read a
password hash or a session token at all.

## Processes and state

| Thing | Where it lives | Lost on restart? |
|---|---|---|
| Documents, jobs, audit | Postgres (`backend/data/pg` locally) | No |
| Uploaded files | `backend/storage/ws/<workspace>/…` | No |
| Session cookies | `app.sessions` rows, hashed | No |
| Job progress events | In-process emitter; SSE also polls the database every 1.5 s | Harmless |
| OCR language data | `backend/storage/ocr-cache` (downloaded once) | Re-downloads |

## Scaling path

- **More traffic:** the API is stateless. Run several copies behind a load balancer; sessions are rows,
  not memory.
- **More captures:** run more worker processes (`RUN_WORKER=true`, API disabled or not). `SKIP LOCKED`
  keeps them from colliding.
- **Bigger retrieval:** `QDRANT_URL` moves vectors out of Postgres without touching the pipeline.
- **Files:** swap `createLocalStorage` for a Supabase Storage or S3 adapter with the same five methods.

## Security summary

- Passwords: scrypt (N=16384) with a per-user salt.
- Sessions: 32 random bytes, stored as SHA-256, httpOnly + SameSite=Lax cookie, sliding 30-day expiry.
- Cross-workspace access: blocked by RLS, verified by tests (`another workspace cannot see, edit or export your documents`).
- Roles: owner / editor / viewer, checked in middleware before the handler runs.
- Audit: every generate, edit, approve, export and delete is appended; `app_user` has no UPDATE or DELETE on that table.
- Uploads: size-capped, stored outside the web root, served only through authenticated endpoints.
- Headers: helmet with a content security policy; the API sets no CORS allowance by default (same-origin).
