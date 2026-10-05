import { createHash } from 'node:crypto'
import { offlineStructure } from '@younifyai/shared'
import { createExtractor } from './extract.js'

// The provider used when no AI key is configured. Everything here is local and
// deterministic, so tests and demos behave the same on every machine.

export const EMBED_DIMS = 384

const TOKEN = /[\p{L}\p{N}]+/gu

/**
 * Feature-hashing embedder: unigrams and bigrams hashed into 384 buckets,
 * signed, L2-normalised. Lexical, not semantic, but it makes pgvector retrieval
 * work offline and matches the dimension of all-MiniLM-L6-v2 so a real model
 * can replace it without a migration (re-embed the chunks).
 */
export function hashEmbed(text) {
  const v = new Float64Array(EMBED_DIMS)
  const words = (String(text).toLowerCase().match(TOKEN) || []).filter((w) => w.length > 1)
  const grams = [...words, ...words.slice(1).map((w, i) => `${words[i]}_${w}`)]
  for (const g of grams) {
    const h = createHash('md5').update(g).digest()
    const idx = h.readUInt16LE(0) % EMBED_DIMS
    v[idx] += h[2] & 1 ? 1 : -1
  }
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm) || 1
  return Array.from(v, (x) => Math.round((x / norm) * 1e6) / 1e6)
}

export function createOfflineProvider({ ocrCacheDir } = {}) {
  // documents are parsed locally; images and video frames go through tesseract OCR;
  // speech needs a provider
  const extractor = createExtractor({ ocrCacheDir })
  return {
    name: 'offline',
    models: { chat: 'rules', transcribe: null, vision: 'tesseract-ocr', embed: 'hash-384' },

    /** Text for one input, or { text: '', note } when it cannot be read without a provider. */
    extract: (input, io) => extractor(input, io),

    async embed(texts) {
      return texts.map(hashEmbed)
    },

    async generate({ template, text, sources, instructions, hints, now }) {
      const content = offlineStructure(template, { text: [instructions, text].filter(Boolean).join('\n'), sources, hints, now })
      return { content, engine: 'offline', model: 'rules' }
    },
  }
}
