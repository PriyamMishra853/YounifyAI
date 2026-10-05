import { createOpenAiCompatibleProvider } from './openaiCompatible.js'

// Groq: fast chat + vision and Whisper transcription. No embeddings API,
// so retrieval keeps the local hashing embedder.
//
// Groq's catalogue changes often, and an account only sees some of it. These are
// defaults, not promises: the provider checks /models on first use and swaps in
// something available (see PREFER below) rather than failing the capture.
// Override explicitly with AI_CHAT_MODEL, AI_VISION_MODEL, AI_TRANSCRIBE_MODEL, AI_FAST_MODEL.
export const GROQ_DEFAULTS = {
  chat: 'qwen/qwen3.8-27b',
  vision: 'qwen/qwen3.8-27b',
  transcribe: 'whisper-large-v3-turbo',
  fast: 'openai/gpt-oss-20b',
  embed: null,
}

/** Tried in order when the configured model is not in the account's list. */
export const GROQ_PREFER = {
  chat: [/^qwen/, /llama-3\.3.*versatile/, /llama-4/, /^openai\/gpt-oss-120b/, /^openai\/gpt-oss/, /llama-3\.1/],
  vision: [/^qwen/, /llama-4.*(scout|maverick)/, /vision/],
  fast: [/^openai\/gpt-oss-20b/, /llama-3\.1-8b/, /^qwen/, /^openai\/gpt-oss/],
  transcribe: [/^whisper-large-v3-turbo/, /^whisper/],
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
    prefer: GROQ_PREFER,
    ocrCacheDir: ai.ocrCacheDir,
  }, offline, log)
}
