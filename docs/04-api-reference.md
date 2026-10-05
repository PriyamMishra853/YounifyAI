# API reference

Base path `/api`. JSON in, JSON out, except uploads (multipart) and exports (file download).
Authentication is the `yf_session` cookie, set by sign-up and sign-in — send credentials with every
request (`fetch(..., { credentials: 'same-origin' })`).

The same contract is implemented twice: `backend/src/routes.js` (server) and
`frontend/src/lib/api/mock.js` (in-browser preview). Changing one means changing the other.

## Errors

```json
{ "error": { "code": "quota_exceeded", "message": "You have used all 5 documents for today…", "fields": { "email": "Already registered." } } }
```

`message` is written for the person and shown as-is. `fields` appears on validation failures and maps to
form inputs. Codes: `unauthenticated` 401, `forbidden` 403, `not_found` 404, `invalid` 422,
`version_conflict` / `email_taken` / `exists` / `last_owner` / `self` 409, `plan_required` / `plan_limit` 402,
`quota_exceeded` 429, `rate_limited` 429, `upload` / `too_large` 400/413, `server_error` 500.

## Roles

`owner` everything · `editor` capture, edit, approve · `viewer` read and export.
Endpoints marked **editor** need owner or editor; **owner** needs owner.

---

## Health

`GET /health` → `{ ok, database: "pglite"|"postgres", ai: { provider, models }, time }`

## Authentication

| Endpoint | Body | Returns |
|---|---|---|
| `POST /auth/signup` | `{ name, email, password }` (password ≥ 8) | 201 `{ user, workspace, role }`, sets cookie. Creates the workspace, three sample documents and a sample price list; activates any pending invitations for that email |
| `POST /auth/login` | `{ email, password }` | `{ user, workspace, role }`, sets cookie |
| `POST /auth/logout` | – | 204, clears the cookie |
| `GET /auth/me` | – | `{ user, workspace, role }` or `null` |

Sign-up and sign-in are rate limited (20 per 15 minutes per IP in production).

## Account and workspace

| Endpoint | Notes |
|---|---|
| `PATCH /me` `{ name }` | the signed-in person's name |
| `GET /workspaces` | every workspace this person belongs to, with their role |
| `POST /workspaces/switch` `{ workspaceId }` | changes which workspace the session works in |
| `PATCH /workspace` `{ name }` | **owner** |
| `GET /workspace/usage` | `{ plan, used, limit, unlimited, resetsAt }` — counted from midnight India time |
| `PUT /workspace/plan` `{ plan }` | **owner**. `free | premium | pro`. No payment in the MVP |
| `GET /workspace/members` | list |
| `POST /workspace/members` `{ email, role }` | **owner**, Pro only. An existing account joins at once; otherwise the membership waits as `invited` |
| `PATCH /workspace/members/:id` `{ role }` | **owner**. The last owner cannot be demoted |
| `DELETE /workspace/members/:id` | **owner**. You cannot remove yourself |

## Templates

| Endpoint | Notes |
|---|---|
| `GET /templates` | built-ins + this workspace's custom templates (not deleted) |
| `POST /templates` | **editor**, Pro only. Body: `{ name, description?, instructions?, vertical?, flow?, accepts[], fields[] }` |
| `PATCH /templates/:id` | **editor**, custom only |
| `DELETE /templates/:id` | **editor**. Soft delete: documents keep their schema |

A field: `{ key, label, type, required?, columns? }`.
`type` is `text | longtext | number | money | date | list | table`; `table` needs `columns`
(each `{ key, label, type }` with a scalar type). Keys are lowercase with underscores and unique.

## Reference material

| Endpoint | Notes |
|---|---|
| `GET /sources` | `{ id, title, templateId, kind, chars, preview, createdAt }[]` |
| `POST /sources` | **editor**, multipart: `title`, optional `templateId`, and either `text` or `file` (.txt, .md, .csv, .pdf, .docx). Enforces the plan's source limit |
| `DELETE /sources/:id` | **editor**. Also removes its vectors |

## Capture jobs

**`POST /jobs`** — **editor**, multipart:

| Field | Meaning |
|---|---|
| `templateId` | required |
| `instructions` | optional free text |
| `texts` | JSON array `[{ name?, text }]` (pasted text) |
| `links` | JSON array `[{ url, title? }]` (YouTube videos) |
| `files` | up to 10 files, each up to `MAX_UPLOAD_MB` |

Fails with 429 `quota_exceeded` at the daily limit, or 422 when the template does not accept one of the
input kinds, or when a link is not a YouTube video. Returns the job.

| Endpoint | Notes |
|---|---|
| `GET /jobs?limit=` | recent jobs |
| `GET /jobs/:id` | one job with its inputs and seven stages |
| `GET /jobs/:id/events` | server-sent events: `event: job` with the whole job on each change, then `event: end` |
| `POST /links/preview` `{ url }` | looks a YouTube video up before capture: `{ id, url, title, channel, durationSeconds, thumbnail, captions[], chapters[], hasCaptions }` |

Job shape:

```json
{ "id": "…", "templateId": "lecture_notes", "templateName": "Lecture Notes",
  "status": "queued|running|succeeded|failed",
  "inputs": [{ "id": "…", "kind": "video", "name": "…", "size": 0, "url": "https://www.youtube.com/watch?v=…" }],
  "stages": [{ "key": "capture", "status": "pending|running|done|skipped|failed", "startedAt": "…", "finishedAt": "…", "log": ["…"] }],
  "documentId": "…", "error": null, "createdAt": "…", "finishedAt": "…" }
```

## Documents

| Endpoint | Notes |
|---|---|
| `GET /documents?q=&status=&templateId=&sort=` | `sort`: `updated | created | title`. Full-text plus title/content matching. Returns list items (no `content`, with `excerpt`) |
| `GET /documents/:id` | full document, including `content`, `issues` and the embedded `template` |
| `PATCH /documents/:id` | **editor**. `{ title?, content?, expectedVersion? }`. Writes a new version; an approved document returns to draft. 409 on a stale `expectedVersion` |
| `POST /documents/:id/approve` | **editor**. 422 while validation has errors |
| `GET /documents/:id/versions` | newest first |
| `POST /documents/:id/versions/:versionId/restore` | **editor**. Appends a new version |
| `GET /documents/:id/export?format=pdf\|docx\|md\|json` | file download. Free plan: PDF and Markdown |
| `DELETE /documents/:id` | **editor**. The audit trail keeps the record |

Document shape (full):

```json
{ "id": "…", "templateId": "voice_bill", "templateName": "Voice Bill", "title": "Voice Bill #0412",
  "status": "draft|approved", "version": 2, "jobId": "…", "sample": false, "engine": "groq|offline|sample",
  "inputs": [{ "kind": "voice", "name": "counter.m4a", "size": 310000 }],
  "content": { "...": "fields named by the template" },
  "issues": [{ "field": "items", "row": 0, "column": "amount", "level": "warning|error", "message": "…" }],
  "template": { "...": "the definition, so a deleted template still renders" },
  "createdBy": { "id": "…", "name": "…" }, "approvedBy": null, "approvedAt": null,
  "createdAt": "…", "updatedAt": "…" }
```

## Overview and audit

| Endpoint | Returns |
|---|---|
| `GET /overview` | `{ usage, counts: { documents, awaitingReview, approved }, recent[], running[] }` |
| `GET /audit?documentId=` | newest 100 events: `{ id, documentId, action, actor, detail, at }` |

Actions: `workspace.created`, `workspace.renamed`, `workspace.plan_changed`, `member.invited`,
`member.role_changed`, `member.removed`, `template.created|updated|deleted`, `source.added|deleted`,
`job.created`, `document.generated|edited|approved|restored|exported|deleted`.
