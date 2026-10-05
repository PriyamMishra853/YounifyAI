import { localDate, toJsonSchema } from '@younifyai/shared'

const MAX_INPUT_CHARS = 48_000
const MAX_REFERENCE_CHARS = 12_000

export const SYSTEM_PROMPT = `You are the documentation engine inside YounifyAI. You turn raw captured information
(transcripts, OCR text, chat logs, notes, file contents) into one structured document that matches a JSON schema.

Rules:
- Use only facts present in the captured inputs or the reference material. Never invent names, numbers, prices, dates or quotes.
- When the inputs do not say something, leave that field empty: "" for text, [] for lists and tables, null for numbers.
- Prices and rates come from the reference material when it lists them. If an item is not listed, set its rate and amount to null.
- Money values are plain numbers in Indian rupees, without symbols or commas. Dates are YYYY-MM-DD.
- Keep people's names exactly as written. Write free text in clear, plain English unless the person asks otherwise; keep Hindi terms that have no good English equivalent.
- Be concise and specific. Lists hold one idea per item.
- Reply with a single JSON object and nothing else.`

function fieldGuide(template) {
  return template.fields.map((f) => {
    const cols = f.columns ? `; each row has ${f.columns.map((c) => `${c.key} (${c.type})`).join(', ')}` : ''
    return `- ${f.key}: ${f.label} [${f.type}${f.required ? ', required' : ''}${cols}]`
  }).join('\n')
}

/**
 * Chat messages for structured generation.
 * @param {{ template, text, context?: {title, content}[], sources?: string[], instructions?: string, now?: Date }} input
 */
export function buildMessages({ template, text, context = [], sources = [], instructions = '', hints = {}, now = new Date() }) {
  const reference = []
  let budget = MAX_REFERENCE_CHARS
  // short reference sets (price lists) go in whole; long ones contribute their best chunks
  const whole = sources.join('\n\n')
  if (whole && whole.length <= MAX_REFERENCE_CHARS) reference.push(whole)
  else {
    for (const c of context) {
      if (budget <= 0) break
      const chunk = `### ${c.title}\n${c.content}`.slice(0, budget)
      reference.push(chunk)
      budget -= chunk.length
    }
  }

  const user = [
    `Document type: ${template.name}`,
    template.description && `What it is for: ${template.description}`,
    template.instructions && `Template instructions: ${template.instructions}`,
    `Fields:\n${fieldGuide(template)}`,
    `JSON schema:\n${JSON.stringify(toJsonSchema(template))}`,
    `Today's date: ${localDate(now)} (India time).`,
    hints?.title && `Source: “${hints.title}”${hints.course ? ` by ${hints.course}` : ''}. Use this as the document title and course unless the content says otherwise.`,
    reference.length && `Reference material from the workspace:\n"""\n${reference.join('\n\n')}\n"""`,
    instructions && `Instructions from the person who captured this: ${instructions}`,
    `Captured inputs:\n"""\n${String(text || '').slice(0, MAX_INPUT_CHARS)}\n"""`,
    'Return the JSON object now.',
  ].filter(Boolean).join('\n\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ]
}

export const CONDENSE_PROMPT = `You condense one part of a long lecture or meeting transcript into dense study notes.
Write 8-15 bullet points covering every idea, definition, formula, example and conclusion in this part, in the order they come.
Start each bullet with the [mm:ss] timestamp where it is said. Use only what is in the text. No introduction, no closing remarks.`

/** Parse a model reply that should be JSON, tolerating code fences or stray prose. */
export function parseJsonReply(reply) {
  const s = String(reply || '').trim()
  try {
    return JSON.parse(s)
  } catch {
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) try { return JSON.parse(fenced[1]) } catch { /* fall through */ }
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1))
    throw new Error('The model did not return JSON')
  }
}

/** Speech-to-text hint so Whisper spells domain words right (Hinglish shop words, course terms). */
export function speechHintFor(template) {
  switch (template?.id) {
    case 'voice_bill': return 'Hinglish shop order: kilo, litre, packet, chawal, tel, atta, cheeni, dal, doodh, biscuit.'
    case 'lecture_notes': return 'University lecture.'
    case 'meeting_report': return 'Team meeting with names, decisions and action items.'
    default: return ''
  }
}
