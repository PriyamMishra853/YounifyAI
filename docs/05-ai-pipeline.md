# The AI pipeline

Code: `backend/src/pipeline/` (stages, worker) and `backend/src/ai/` (providers, extraction, prompts).

## Provider interface

Everything model-shaped goes through four methods (`backend/src/ai/index.js`):

```js
extract(input, { readFile, localPath })  // one input → { text, engine, meta?, note? }
embed(texts)                             // → number[384][]
generate({ template, text, context, sources, instructions, hints, now, log })
                                         // → { content, engine, model, note? }
models                                   // { chat, vision, transcribe, embed } — shown in /api/health and job logs
```

| Provider | When | chat | vision | speech | embeddings |
|---|---|---|---|---|---|
| `offline` | no key configured | rules in `shared` | tesseract OCR | — | local feature hashing (384) |
| `groq` | `GROQ_API_KEY` | `qwen/qwen3.8-27b` | `qwen/qwen3.8-27b` | `whisper-large-v3-turbo` | falls back to local hashing |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` | `gpt-4o-mini` | `whisper-1` | `text-embedding-3-small` at 384 dims |

`AI_PROVIDER=auto` (default) picks Groq, then OpenAI, then offline. Any OpenAI-compatible gateway works
through `AI_BASE_URL`.

**Model ids are defaults, not promises.** Catalogues change and two accounts rarely see the same list, so
on the first call the provider fetches `/models` and, if a configured id is missing, substitutes an
available one using the preference lists in `groq.js` (`GROQ_PREFER`) and logs the swap. `/api/health`
always reports what will really be used. A model that rejects JSON mode is retried once without it, since
the prompt asks for JSON anyway. Pin ids explicitly with `AI_CHAT_MODEL`, `AI_VISION_MODEL`,
`AI_TRANSCRIBE_MODEL` and `AI_FAST_MODEL`.

This is not theoretical: the Llama models these defaults originally named disappeared from Groq's
catalogue during development, and the first capture after that fell back to the offline rules with the
reason in the job log — which is how it was noticed.

Groq and OpenAI share one implementation (`openaiCompatible.js`) because both speak the OpenAI HTTP API.
A third vendor with a different API is a new file exporting the same four methods.

## Extraction, input by input

| Input | With a provider | Without one |
|---|---|---|
| Pasted text, `.txt` `.md` `.csv` | read directly | same |
| PDF | `unpdf`; a scan with no text layer is reported, not silently empty | same |
| DOCX / PPTX | `mammoth` / slide XML | same |
| Image | vision model (text, then a short description), OCR if it fails | tesseract OCR, English + Hindi |
| Voice | ffmpeg → mono 16 kHz MP3, split into 20-minute parts → speech-to-text | refused with a clear message |
| Video file | audio transcript + key frames through vision | key frames through OCR (slides still work) |
| YouTube link | captions (see below) | the same captions — no key needed |

Speech-to-text gets a per-template hint (`speechHintFor`), so a bill transcribes "do kilo chawal"
rather than "do kilo chawl".

## YouTube

`backend/src/ai/youtube.js`, through `youtubei.js` (YouTube's own internal API). No download, no key.

1. Look the video up (iOS client first: its caption URLs work without a browser token).
2. Pick a caption track: uploaded English → auto-generated English → another language translated to
   English by YouTube → the original language as is.
3. Fetch it as JSON3, falling back to the XML caption formats.
4. Build the text: title, channel, length, description, chapters parsed from the description, then the
   transcript grouped into `[mm:ss]` paragraphs.

Failures are explained rather than generic: no captions, private video, live stream, bad link.

The title and channel become the notes' title and course (`state.hints`).

## Generation

`buildMessages()` sends: the template's field guide and JSON schema, today's date in India time, the
reference material, the person's instructions, and the captured text. The system prompt forbids inventing
anything and requires empty fields where the input is silent.

**Long transcripts.** Over 24,000 characters the text is condensed first: ~12,000-character parts, each
turned into dense timestamped bullets by the fast model, then the structured pass reads those notes. This
is what keeps an hour-long lecture inside free-tier token limits.

**After the model.** The reply is parsed (tolerating code fences), coerced to the template's types
(`normalizeContent`), and derived fields are recomputed (`computeDerived` — a bill's amounts and totals
are arithmetic, never the model's word).

**When the API fails.** After retries (429 and 5xx with `retry-after`), generation falls back to the
offline rules and says so in the job log and on the document (`engine: "offline"`).

## Retrieval

Chunks (~700 characters, line-aligned) are embedded when a source is added and searched at capture time.
pgvector by default; Qdrant when `QDRANT_URL` is set, always filtered by `workspace_id`. Short reference
sets, such as a price list, are also passed whole, because a bill needs every line rather than the top four.

The offline embedder is feature hashing into 384 dimensions: lexical, not semantic, but it needs no
network and matches the dimension of `all-MiniLM-L6-v2` and `text-embedding-3-small` at 384, so a real
embedder can replace it by re-embedding the chunks. `embed_model` is stored per chunk so vectors from
different embedders are never compared.

## Validation

`shared/src/document.js` runs the same checks in the editor and on the server: required fields, types,
dates, and per-template rules — a bill's `amount = qty × rate`, subtotal and total; action items without
an owner. Errors block approval; warnings are shown for judgement.

## Offline quality

With no key the product still works end to end, which is what makes it demonstrable anywhere:

- **Bills:** Hinglish quantities ("dedh kilo", "paanch packet"), Hindi item names mapped to English, prices
  from the workspace's price list, arithmetic computed.
- **Meetings:** speakers, decisions, action items with owners and due dates ("by Friday" → a date).
- **Lectures from YouTube:** chapter-by-chapter key points with timestamps, recurring concepts with their
  defining sentence, revision questions.
- **Diaries:** timed moments from notes.

A language model writes better prose; the offline path never invents anything, because every sentence it
writes was in the source.
