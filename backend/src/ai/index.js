import { createOfflineProvider } from './offline.js'

/**
 * The AI layer. Every provider implements the same four methods:
 *   extract(input, { readFile })  → { text, engine, note? }   one input → text (STT / OCR / vision / parsing)
 *   embed(texts)                  → number[384][]             for retrieval
 *   generate({ template, text, context, sources, instructions, now }) → { content, engine, model }
 *   models                        → which model does what (shown in job logs and /api/health)
 * Swapping models or vendors means writing one more provider; nothing else changes.
 * See docs/05-handoff.md → "Changing the AI model".
 */
export async function createAi(config, log) {
  const ai = { ...config.ai, ocrCacheDir: config.ai.ocrCacheDir || `${config.storageDir}/ocr-cache` }
  const offline = createOfflineProvider({ ocrCacheDir: ai.ocrCacheDir })
  let provider = offline
  const want = config.ai.provider
  if (want === 'groq' || (want === 'auto' && config.ai.groqApiKey)) {
    const { createGroqProvider } = await import('./groq.js')
    if (config.ai.groqApiKey) provider = createGroqProvider(ai, offline, log)
  } else if (want === 'openai' || (want === 'auto' && config.ai.openaiApiKey)) {
    const { createOpenAiProvider } = await import('./openai.js')
    if (config.ai.openaiApiKey) provider = createOpenAiProvider(ai, offline, log)
  }
  log?.info({ provider: provider.name, models: provider.models }, 'ai provider ready')
  return provider
}
