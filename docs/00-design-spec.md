# YounifyAI — Design Spec

Status: approved 2026-09-21 · Source: *YounifyAI Ideathon 2026 Pitch Deck* (Team UnfilteredEngineers)

## 1. Product in one line

YounifyAI turns information in any format — lecture video, voice notes, photos, chat messages, files —
into structured documents a person reviews, edits, approves and exports.

Pipeline (from the deck): **Capture → Extract → Normalize → Retrieve → Generate → Validate → Deliver.**

MVP outputs (templates): **Lecture Notes**, **Meeting Report**, **Journey Diary**, **Voice Bill**.

## 2. Decisions

| Area | Decision | Why |
|---|---|---|
| Location | `C:\Users\Priyam\younifyai`, npm workspaces `frontend/` + `backend/` | Empty dir, isolated from other projects |
| Frontend | React + Vite, Tailwind v4, react-router | Deck: "React • Web App • Responsive UI" |
| 3D | Custom Three.js via react-three-fiber + drei (no Spline account needed) | Approved by user; cursor + scroll reactive |
| Motion | GSAP ScrollTrigger + Lenis smooth scroll, custom cursor | Scroll-driven story, pinned pipeline |
| API | Node + Express 5, zod validation, RBAC middleware, per-plan quotas | Deck: "Node.js • Express • Auth / RBAC / Validation" |
| DB (local) | PGlite (Postgres in WASM, with pgvector) | No Docker/Postgres installed; same SQL as Supabase |
| DB (prod) | Supabase Postgres via `DATABASE_URL` (node-postgres) | Deck: "Supabase PostgreSQL • Storage" |
| Vectors | pgvector locally; Qdrant when `QDRANT_URL` is set | Deck: "Qdrant Cloud" |
| AI | Provider interface: Groq (LLM + Whisper + vision) when `GROQ_API_KEY` set; offline fallback otherwise | App runs end-to-end with no keys |
| Frontend ↔ API | `src/lib/api` with `mock` and `live` implementations, same function signatures | Phase 1 ships on mock data; Phase 2 swaps to live |
| Git | Local repo, one commit per phase, never pushed | Approved by user |

## 3. Visual identity

Palette (from the deck, tuned for screens):

| Token | Hex | Role |
|---|---|---|
| `abyss` | `#07182A` | Base background, "raw signal" world |
| `navy` | `#0D2B45` | Surfaces on dark, app sidebar |
| `amber` | `#F4A900` | Structure / approval / primary action |
| `paper` | `#EEF2F6` | Documents, light "structured" world |
| `ink` | `#16202A` | Text on paper |
| `slate` | `#657589` | Muted text on paper (`#8FA3B8` on dark) |

Modality colors — used everywhere an input type appears (chips, 3D shards, pipeline):
voice `#7056C8` violet · video `#D95A5A` red · image `#1F9D76` green · text `#2D6CDF` blue · docs `#F4A900` amber.

Type: **Bricolage Grotesque** (display, tight tracking, used sparingly) · **Hanken Grotesk** (body/UI) ·
**Martian Mono** (field labels, stage markers, data). Self-hosted via Fontsource.

Signature: **the page performs the product.** The top of the landing page is the dark "raw signal"
world with a glass prism in 3D; input shards (colored by modality) drift into the prism and ruled paper
sheets exit it. As the visitor scrolls through the pinned pipeline, the page itself transitions from dark
to paper, and everything after (use cases, trust, pricing) is laid out like a structured document with
mono field labels.

Quality floor: responsive to 360px, visible focus rings, `prefers-reduced-motion` disables Lenis,
cursor and 3D motion (static poster instead), custom cursor disabled on touch.

## 4. Information architecture

### Public
| Route | Content |
|---|---|
| `/` | Hero (3D prism) → Problem (4 manual workflows, steps struck through on scroll) → Insight (one conversion) → Pipeline (pinned, 7 stages, dark→paper) → Use cases (input/output specimens, tabbed) → Trust (RLS, RBAC, audit, review) → Pricing → Roadmap → CTA |
| `/pricing` | Plan comparison + FAQ (fair use, limits) |
| `/login`, `/signup` | Email + password |

### App (signed in)
| Route | Content |
|---|---|
| `/app` | Today: tasks used vs plan limit, recent documents, awaiting-review queue, quick capture |
| `/app/capture` | 1) pick template 2) add inputs (files drag-drop, record voice, paste text) 3) optional instructions → creates a job |
| `/app/jobs/:id` | Live 7-stage progress, per-stage logs, link to the resulting document |
| `/app/documents` | Library: search, filter by template/status, sort |
| `/app/documents/:id` | Review editor: structured fields per template schema, source inputs panel, approve, export PDF/DOCX/JSON, version history, audit trail |
| `/app/templates` | System templates (4) + custom templates (Pro): name, field schema, instructions |
| `/app/knowledge` | Reference sources used for retrieval (syllabus, price list, policy), per template |
| `/app/settings` | Profile, plan & usage, workspace members + roles (Pro) |

## 5. Plans (from the deck)

| Plan | Price | Tasks/day | Extras |
|---|---|---|---|
| Free | ₹0 | 5 | Core inputs, basic templates, 30-day history |
| Premium | ₹299/mo | 50 | Advanced templates, exports, 5 GB storage |
| Pro | ₹2,999/mo | Unlimited (fair use: 500) | Custom templates, workspace members, roles |

A "task" = one job (one capture → one document). Quota resets at 00:00 Asia/Kolkata.

## 6. Roles

`owner` (billing, members, everything) · `editor` (capture, edit, approve) · `viewer` (read, export).
Every write is scoped by `workspace_id`; locally enforced in the API, in Supabase also by RLS policies.

## 7. Phases

1. **Frontend** — all routes, 3D hero, scroll story, cursor; app on the mock API. Run on localhost.
2. **Backend** — schema + migrations, auth/sessions, workspaces/RBAC, uploads, job runner + stage log,
   documents/versions/audit, quotas, exports. Frontend switched to the live API.
3. **AI** — extraction (Whisper, OCR, vision, PDF/DOCX parsing, video via ffmpeg), normalization,
   retrieval (pgvector/Qdrant), structured generation with schema validation, offline fallback.
4. **Docs** — architecture, SQL schema, data flow, API reference, handoff guide.

## 8. Out of scope for MVP

Real payments (plan change is a stub endpoint), email delivery, mobile apps, integrations marketplace,
template marketplace, model fine-tuning.
