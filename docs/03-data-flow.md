# Data flow

## Capture to approved document

```
person                 frontend              API                    worker                 provider
  │ pick template        │                     │                       │                      │
  │ add inputs ─────────►│                     │                       │                      │
  │ (files / recording / │                     │                       │                      │
  │  pasted text / link) │                     │                       │                      │
  │                      │ POST /api/jobs ────►│                       │                      │
  │                      │   multipart          │ lock workspace row    │                      │
  │                      │                     │ check daily quota      │                      │
  │                      │                     │ store files            │                      │
  │                      │                     │ insert job + inputs    │                      │
  │                      │                     │ + 7 stage rows         │                      │
  │                      │◄── 201 job ─────────│ emit 'job:queued' ───►│ claim with            │
  │                      │                     │                       │ FOR UPDATE SKIP LOCKED│
  │                      │ GET /jobs/:id/events│                       │                      │
  │ watches stages ◄─────│◄═══ SSE ════════════│◄── stage updates ─────│ 1 capture            │
  │                      │                     │                       │ 2 extract ──────────►│ STT / OCR / vision
  │                      │                     │                       │ 3 normalize          │ / parsers / YouTube
  │                      │                     │                       │ 4 retrieve ─────────►│ embed + search
  │                      │                     │                       │ 5 generate ─────────►│ language model
  │                      │                     │                       │ 6 validate (rules)   │
  │                      │                     │                       │ 7 deliver → document │
  │ review ─────────────►│ PATCH /documents/:id│ new version + audit    │                      │
  │ approve ────────────►│ POST …/approve      │ blocked if errors      │                      │
  │ export ─────────────►│ GET …/export?format │ PDF / DOCX / MD / JSON │                      │
```

## The seven stages

| # | Stage | Does | Writes |
|---|---|---|---|
| 1 | Capture | Confirms every stored input is really on disk | log lines |
| 2 | Extract | Each input → text: speech-to-text, OCR or vision, PDF/DOCX/PPTX parsing, YouTube captions | `job_inputs.extracted_text`, `meta` |
| 3 | Normalize | Cleans whitespace, joins inputs with headers, guesses the language | in-memory state |
| 4 | Retrieve | Embeds the text, searches the workspace's reference chunks (pgvector or Qdrant) | log lines; `skipped` when there is no reference material |
| 5 | Generate | Fills the template's JSON schema (model, or offline rules). Long transcripts are condensed part by part first | in-memory content |
| 6 | Validate | Runs the shared rules: required fields, types, bill arithmetic, action items without owners | issue list in the log |
| 7 | Deliver | Inserts the document, version 1 and an audit event; links the job to it | `documents`, `document_versions`, `audit_events`, `jobs.document_id` |

Each stage marks itself `running`, does its work outside the transaction (network calls do not hold
database locks), then writes `done`/`skipped` with its logs. The job's `locked_at` is refreshed at every
stage, which is how stale-job recovery tells a slow job from a dead worker.

**Failure.** A stage throwing `PipelineError` fails the job with a message meant for the person
("…has no captions on YouTube, so there is no transcript to work from"). Anything else is logged with a
stack trace and the job shows "Something went wrong while processing. Try again."

**Crash recovery.** A job whose worker died is re-queued after 10 minutes, up to 3 attempts, then failed.
Delivery is idempotent: it re-uses `jobs.document_id` when it already exists, so a re-run never creates a
second document.

## Review, versions and approval

```
generated (v1, draft) ──edit──► v2 draft ──approve──► approved
                                    ▲                    │
                                    └───── edit ─────────┘  (approval withdrawn)
```

- Every save writes a new `document_versions` row. Nothing is overwritten.
- `expectedVersion` on the PATCH makes a stale editor fail with 409 instead of overwriting someone's work.
- Approval is refused while validation has errors (warnings do not block).
- Restoring an old version appends a new version rather than rewinding history.
- Every one of these writes an audit event with the actor and a short detail.

## Daily allowance

A "document" is one job. The count is `jobs` created since midnight **India time** (`istDay()`), compared
with the plan's `tasksPerDay`. The check happens inside the job transaction, after
`select … from app.workspaces where id = $1 for update`, so two captures sent at the same moment cannot
both slip past the limit.

## Reference material (retrieval)

```
source text ──chunk (~700 chars, line-aligned)──► embed (384 dims) ──► source_chunks.embedding
                                                                       └─► Qdrant (optional)

capture text ──embed──► nearest chunks in this workspace ──► prompt context
```

Price lists and other short sources are also passed to the generator whole (under 12k characters), because
a bill needs every line, not the top four.

## What the frontend holds

Nothing durable. `lib/api` has two implementations behind one interface: `live` (HTTP) and `mock`
(localStorage, for the no-server preview). On start-up `detectApi()` pings `/api/health` once and picks.
Everything else is fetched per page and re-fetched after a write.
