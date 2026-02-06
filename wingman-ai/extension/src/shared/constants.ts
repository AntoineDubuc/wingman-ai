/**
 * Centralized constants for the Wingman AI extension.
 *
 * All magic numbers and configuration values should be defined here.
 * Use descriptive names and group by domain.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TIMING
// ─────────────────────────────────────────────────────────────────────────────

export const TIMING = {
  /** Minimum time between suggestions to avoid API quota limits */
  SUGGESTION_COOLDOWN_MS: 15_000,

  /** Minimum allowed cooldown (user configurable) */
  MIN_SUGGESTION_COOLDOWN_MS: 5_000,

  /** Maximum allowed cooldown (user configurable) */
  MAX_SUGGESTION_COOLDOWN_MS: 30_000,

  /** Default Deepgram endpointing threshold (silence before speech_final) */
  DEFAULT_ENDPOINTING_MS: 700,

  /** Base delay for exponential backoff on retries */
  RETRY_BASE_DELAY_MS: 1_000,

  /** Maximum delay for exponential backoff */
  RETRY_MAX_DELAY_MS: 30_000,

  /** Default backoff on 429 rate limit (when not specified in response) */
  DEFAULT_RATE_LIMIT_BACKOFF_S: 60,

  /** Cost ticker update interval */
  COST_UPDATE_INTERVAL_MS: 5_000,

  /** Mic permission popup timeout */
  MIC_PERMISSION_TIMEOUT_MS: 30_000,

  /** Content script injection retry delays */
  CONTENT_SCRIPT_RETRY_DELAYS_MS: [300, 700, 1_500] as const,

  /** Overlay initialization retry delays */
  OVERLAY_INIT_RETRY_DELAYS_MS: [500, 1_500] as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LIMITS
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITS = {
  /** Minimum words in transcript before processing */
  MIN_TRANSCRIPT_WORDS: 2,

  /** Minimum system prompt length */
  MIN_PROMPT_LENGTH: 50,

  /** Maximum system prompt length (truncate beyond this) */
  MAX_PROMPT_LENGTH: 20_000,

  /** Maximum conversation history turns to retain */
  MAX_HISTORY_TURNS: 20,

  /** Maximum KB search results to include in context */
  MAX_KB_RESULTS: 3,

  /** Maximum timeline entries before pruning */
  MAX_TIMELINE_ENTRIES: 500,

  /** Transcript entries to keep at start for summary context */
  SUMMARY_FIRST_ENTRIES: 50,

  /** Transcript entries to keep at end for summary detail */
  SUMMARY_LAST_ENTRIES: 400,

  /** Maximum retries for API calls */
  MAX_API_RETRIES: 3,

  /** Embedding batch size for KB indexing */
  EMBEDDING_BATCH_SIZE: 100,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIO = {
  /** Sample rate for Deepgram (16kHz) */
  SAMPLE_RATE: 16_000,

  /** Audio channels (mono) */
  CHANNELS: 1,

  /** Bits per sample */
  BIT_DEPTH: 16,

  /** Audio encoding for Deepgram */
  ENCODING: 'linear16' as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// UI DIMENSIONS
// ─────────────────────────────────────────────────────────────────────────────

export const UI = {
  /** Default overlay width */
  OVERLAY_DEFAULT_WIDTH: 350,

  /** Default overlay height */
  OVERLAY_DEFAULT_HEIGHT: 450,

  /** Minimum overlay width */
  OVERLAY_MIN_WIDTH: 280,

  /** Minimum overlay height */
  OVERLAY_MIN_HEIGHT: 200,

  /** Maximum overlay width */
  OVERLAY_MAX_WIDTH: 600,

  /** Default font size in overlay */
  FONT_SIZE_DEFAULT: 13,

  /** Minimum font size */
  FONT_SIZE_MIN: 10,

  /** Maximum font size */
  FONT_SIZE_MAX: 20,

  /** Scroll threshold for auto-scroll behavior */
  SCROLL_THRESHOLD: 50,

  /** Mic permission popup dimensions */
  MIC_PERMISSION_WIDTH: 420,
  MIC_PERMISSION_HEIGHT: 220,

  /** Overlay z-index (must be above Google Meet UI) */
  OVERLAY_Z_INDEX: 999999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LLM CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export const LLM = {
  /** Default max tokens for suggestions */
  SUGGESTION_MAX_TOKENS: 500,

  /** Max tokens for call summaries */
  SUMMARY_MAX_TOKENS: 2_000,

  /** Default confidence score for suggestions */
  DEFAULT_CONFIDENCE: 0.85,

  /** Gemini embedding model */
  EMBEDDING_MODEL: 'gemini-embedding-001',

  /** Embedding vector dimensions */
  EMBEDDING_DIMENSIONS: 768,

  /** Recent speakers to include in summary (unique) */
  SUMMARY_RECENT_SPEAKERS: 10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE KEYS
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  // API Keys
  DEEPGRAM_API_KEY: 'deepgramApiKey',
  GEMINI_API_KEY: 'geminiApiKey',
  OPENROUTER_API_KEY: 'openrouterApiKey',
  GROQ_API_KEY: 'groqApiKey',
  HUME_API_KEY: 'humeApiKey',
  HUME_SECRET_KEY: 'humeSecretKey',

  // Provider configuration
  LLM_PROVIDER: 'llmProvider',
  OPENROUTER_MODEL: 'openrouterModel',
  GROQ_MODEL: 'groqModel',
  SUGGESTION_COOLDOWN_MS: 'suggestionCooldownMs',

  // Personas
  PERSONAS: 'personas',
  ACTIVE_PERSONA_ID: 'activePersonaId',
  ACTIVE_PERSONA_IDS: 'activePersonaIds',
  CONCLAVES: 'conclaves',
  SYSTEM_PROMPT: 'systemPrompt', // Legacy, migrated to personas

  // Transcription
  ENDPOINTING_MS: 'endpointingMs',
  SPEAKER_FILTER: 'speakerFilter',

  // UI
  THEME: 'theme',
  OVERLAY_POSITION: 'overlayPosition',
  OVERLAY_SIZE: 'overlaySize',
  OVERLAY_MINIMIZED: 'overlayMinimized',
  FONT_SIZE: 'fontSize',

  // Drive
  DRIVE_OAUTH_TOKEN: 'driveOAuthToken',
  DRIVE_FOLDER_ID: 'driveFolderId',
  DRIVE_AUTO_SAVE: 'driveAutoSave',
  DRIVE_FILE_FORMAT: 'driveFileFormat',

  // LangBuilder
  LANGBUILDER_URL: 'langbuilderUrl',
  LANGBUILDER_API_KEY: 'langbuilderApiKey',
  LANGBUILDER_FLOW_ID: 'langbuilderFlowId',

  // Call Summary
  CALL_SUMMARY_ENABLED: 'callSummaryEnabled',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// DEEPGRAM PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────

export const DEEPGRAM = {
  /** Base WebSocket URL */
  WS_URL: 'wss://api.deepgram.com/v1/listen',

  /** Default query parameters */
  DEFAULT_PARAMS: {
    model: 'nova-3',
    version: 'latest',
    language: 'en',
    punctuate: 'true',
    diarize: 'true',
    smart_format: 'true',
    interim_results: 'true',
    utterance_end_ms: '1500',
    vad_events: 'true',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    endpointing: '700',
  } as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// HUME AI CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export const HUME = {
  /** WebSocket endpoint for Expression Measurement streaming */
  WS_URL: 'wss://api.hume.ai/v0/stream/models',

  /** OAuth token endpoint */
  TOKEN_URL: 'https://api.hume.ai/oauth2-cc/token',

  /** Token validity duration (30 minutes) */
  TOKEN_EXPIRY_MS: 30 * 60 * 1000,

  /** Refresh token when this many ms remain */
  TOKEN_REFRESH_THRESHOLD_MS: 5 * 60 * 1000,

  /** Audio buffer size before sending (100ms at 16kHz = 1600 samples) */
  AUDIO_BUFFER_SAMPLES: 1600,

  /** Maximum audio per message (5 seconds) */
  MAX_AUDIO_DURATION_MS: 5000,

  /** Emotion smoothing window (3 seconds) */
  SMOOTHING_WINDOW_MS: 3000,

  /** Minimum emotion score to consider significant (lowered — Hume has 48 emotions) */
  MIN_EMOTION_SCORE: 0.05,

  /** Reconnection attempts before giving up */
  MAX_RECONNECT_ATTEMPTS: 3,

  /** Base delay for reconnection backoff */
  RECONNECT_BASE_DELAY_MS: 1000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ICONS (SVG strings for overlay UI)
// ─────────────────────────────────────────────────────────────────────────────

export const ICONS = {
  MINIMIZE: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',

  CLOSE: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',

  WINGMAN: '<svg class="wingman-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1l1.5 4.5L13 7l-4.5 1.5L7 13l-1.5-4.5L1 7l4.5-1.5z"/></svg>',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type LLMProvider = 'gemini' | 'openrouter' | 'groq';
export type Theme = 'light' | 'dark';
export type DriveFileFormat = 'google-doc' | 'markdown' | 'text' | 'json';

/** Simplified emotion states derived from Hume's 48 emotions */
export type EmotionState = 'engaged' | 'neutral' | 'frustrated' | 'thinking';

/** Raw emotion from Hume API */
export interface HumeEmotion {
  name: string;
  score: number;
}

/** Emotion update message sent to content script */
export interface EmotionUpdate {
  state: EmotionState;
  confidence: number;
  topEmotions: HumeEmotion[];
  timestamp: number;
}
