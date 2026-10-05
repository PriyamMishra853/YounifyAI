import { createOpenAiCompatibleProvider } from './openaiCompatible.js'

// OpenAI: chat, vision, transcription and embeddings (text-embedding-3-small at
// 384 dimensions, so it fits the same vector(384) column as the local embedder).
// Override model ids with AI_CHAT_MODEL, AI_VISION_MODEL, AI_TRANSCRIBE_MODEL.
export const OPENAI_DEFAULTS = {
  chat: 'gpt-4o-mini',
  vision: 'gpt-4o-mini',
  transcribe: 'whisper-1',
  embed: 'text-embedding-3-small',
}

export function createOpenAiProvider(ai, offline, log) {
  return createOpenAiCompatibleProvider({
    name: 'openai',
    baseUrl: ai.baseUrl || 'https://api.openai.com/v1',
    apiKey: ai.openaiApiKey,
    models: {
      chat: ai.chatModel || OPENAI_DEFAULTS.chat,
      vision: ai.visionModel || OPENAI_DEFAULTS.vision,
      transcribe: ai.transcribeModel || OPENAI_DEFAULTS.transcribe,
      embed: OPENAI_DEFAULTS.embed,
      fast: ai.fastModel || OPENAI_DEFAULTS.chat,
    },
    embedDims: 384,
    ocrCacheDir: ai.ocrCacheDir,
  }, offline, log)
}
