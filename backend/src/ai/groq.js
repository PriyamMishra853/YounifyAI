import { createOpenAiCompatibleProvider } from './openaiCompatible.js'

// Groq: fast Llama chat + vision and Whisper transcription. No embeddings API,
// so retrieval keeps the local hashing embedder.
// Model ids change over time; override them with AI_CHAT_MODEL, AI_VISION_MODEL, AI_TRANSCRIBE_MODEL.
export const GROQ_DEFAULTS = {
  chat: 'llama-3.3-70b-versatile',
  vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
  transcribe: 'whisper-large-v3-turbo',
  embed: null,
  fast: 'llama-3.1-8b-instant',
}

export function createGroqProvider(ai, offline, log) {
  return createOpenAiCompatibleProvider({
    name: 'groq',
    baseUrl: ai.baseUrl || 'https://api.groq.com/openai/v1',
    apiKey: ai.groqApiKey,
    models: {
      chat: ai.chatModel || GROQ_DEFAULTS.chat,
      vision: ai.visionModel || GROQ_DEFAULTS.vision,
      transcribe: ai.transcribeModel || GROQ_DEFAULTS.transcribe,
      fast: ai.fastModel || GROQ_DEFAULTS.fast,
      embed: null,
    },
    ocrCacheDir: ai.ocrCacheDir,
  }, offline, log)
}
