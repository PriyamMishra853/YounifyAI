# Frontend

React 19 + Vite 8, Tailwind v4, react-router v7, three.js via react-three-fiber, GSAP ScrollTrigger,
Lenis smooth scroll. `frontend/src`.

## Routes

| Route | File | What it is |
|---|---|---|
| `/` | `pages/Landing.jsx` | hero, problem, insight, pinned pipeline, use cases, trust, pricing, roadmap, CTA |
| `/pricing` | `pages/PricingPage.jsx` | plan comparison and FAQ |
| `/login`, `/signup` | `pages/AuthPages.jsx` | split screen with a live document specimen |
| `/app` | `pages/app/Dashboard.jsx` | usage, awaiting review, quick start, recent documents |
| `/app/capture` | `pages/app/Capture.jsx` | template, inputs (files, recording, text, YouTube link), instructions |
| `/app/jobs/:id` | `pages/app/Job.jsx` | the seven stages live over SSE |
| `/app/documents` | `pages/app/Documents.jsx` | search, filters, library |
| `/app/documents/:id` | `pages/app/DocumentEditor.jsx` | schema-driven editor, checks, versions, activity, export |
| `/app/templates` | `pages/app/Templates.jsx` | built-ins and the custom template builder |
| `/app/knowledge` | `pages/app/Knowledge.jsx` | reference material |
| `/app/settings` | `pages/app/Settings.jsx` | profile, plan and usage, members |

`RequireAuth` guards `/app`; unauthenticated visits bounce to `/login?next=…`.

## Data

`lib/api/index.js` picks one of two implementations with identical signatures:

- `live.js` — HTTP to `/api`, SSE for job progress with a polling fallback.
- `mock.js` — localStorage, so the whole product can be clicked through with no server. It structures
  pasted text offline with the same `shared` code the backend uses.

`detectApi()` pings `/api/health` once at start-up; `VITE_API_MODE=live|mock` forces one. In mock mode the
app shows a banner, and YouTube links explain they need the server.

`lib/auth.jsx` holds the session (`user`, `workspace`, `role`, `can('edit'|'admin')`).

## Design system

Tokens in `styles/index.css` (`@theme`), derived from the pitch deck:

| Token | Use |
|---|---|
| `abyss` `#07182A`, `navy` `#0D2B45` | the dark "raw signal" half |
| `paper` `#EEF2F6`, `card` `#fff`, `ink` `#16202A` | the light "structured" half, and the whole app |
| `amber` `#F4A900` | structure, approval, primary action |
| `m-voice` `#7056C8`, `m-video` `#D95A5A`, `m-image` `#1F9D76`, `m-text` `#2D6CDF`, `m-docs` `#F4A900` | input types, used identically in 3D, chips and the pipeline |

Type: Bricolage Grotesque (display), Hanken Grotesk (body), Martian Mono (labels, data), self-hosted.

The idea the page is built on: **it performs the product.** The top is dark and chaotic; the pinned
pipeline section turns the page to paper as the example moves through the seven stages; everything after
it is laid out like a document.

## The 3D hero

`three/HeroScene.jsx` with textures drawn in code (`three/textures.js`) — no downloads.

- A glass prism (`MeshTransmissionMaterial`) with amber edges, lying along the camera axis.
- Input cards in the five modality colours curve in along bezier paths and are pushed aside by the cursor.
- Document sheets leave in an orderly line: chaos in, order out.
- Scroll drives it through `heroState` (a mutable object, so the canvas never re-renders React):
  shards speed up, and the camera flies into the prism.
- It pauses when off-screen, drops quality on small screens or few CPU cores, holds still for
  `prefers-reduced-motion`, and falls back to a static poster without WebGL.

## Patterns worth knowing

- **Schema-driven editing.** `pages/app/fields.jsx` renders an editor for each field type; the document
  editor never hard-codes a template. `components/DocPreview.jsx` does the read-only version, and is also
  what the landing page and the sign-in page show.
- **Validation in two places, one implementation.** The editor calls `validateDocument` from `shared` on
  every keystroke; the server runs the same function before approving.
- **Optimistic version guard.** Saving sends `expectedVersion`; a 409 tells the person someone else saved.
- **Unsaved-changes guard.** `useBlocker` for in-app navigation, `beforeunload` for closing the tab.
- **Accessibility floor.** Visible focus rings, labelled inputs, `aria-live` on the job stages, keyboard
  tabs, custom cursor only on fine pointers, motion off when the system asks.

## Build

`npm run build --workspace frontend` → `frontend/dist`. In production the API serves it
(`SERVE_FRONTEND=true`), so one process answers both the site and `/api`. three.js is a lazy chunk, so the
first paint does not wait for it.
