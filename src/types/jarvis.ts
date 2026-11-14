export enum JarvisStatus {
  BOOTING = 'booting',
  IDLE = 'idle',
  LISTENING = 'listening',
  THINKING = 'thinking',
  SPEAKING = 'speaking',
}

export enum ViewMode {
  CORE = 'core',
  STANDBY = 'standby',
  WAKING = 'waking',
}

export enum DspPreset {
  NATURAL = 'natural',
  STARK_STUDIO = 'stark_studio',
  HELMET_HUD = 'helmet_hud',
}

export type JarvisLlmModelId =
  | 'gpt-oss-120b'
  | 'deepseek-r1-distill-llama-70b'
  | 'llama-3.3-70b-versatile'
  | 'llama3-8b-8192'
  | 'llama-3.1-8b-instant';

export interface VoiceConfig {
  voiceId: string;
  rate: number;
  pitch: number;
  dspPreset: DspPreset;
  groqModel: JarvisLlmModelId;
  handsFreeMode: boolean;
  showSubtitles: boolean;
  soundEffects: boolean;
  autoStandbyMinutes: number;
  clapWakeEnabled: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  engine?: string;
}

export interface AssistantNote {
  id: string;
  title: string;
  createdAt: number;
  completed: boolean;
}

export interface AssistantTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
}

export type JarvisMediaCardMode = 'news' | 'images';

export interface JarvisNewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  imageUrl?: string;
  snippet?: string;
  category?: string;
}

export interface JarvisImageItem {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string;
  description?: string;
  sourceUrl?: string;
  sourceName?: string;
}

export interface JarvisYoutubeCandidate {
  videoId: string;
  title: string;
}

export interface JarvisYoutubeTrack {
  videoId: string;
  title: string;
  query: string;
  startedAt: number;
  /**
   * Fallback ladder: YouTube blocks embedding on many official music videos
   * (player error 150). The mini-player walks this list until one actually plays.
   */
  candidates?: JarvisYoutubeCandidate[];
}

export interface GroundingWebLink {
  title: string;
  uri: string;
}

export interface JarvisMediaCardPayload {
  mode: JarvisMediaCardMode;
  query: string;
  title: string;
  summary?: string;
  newsItems?: JarvisNewsItem[];
  imageItems?: JarvisImageItem[];
  groundingLinks?: GroundingWebLink[];
  updatedAt?: number;
}
export interface VoiceOption {
  id: string;
  label: string;
  subtitle: string;
  recommendedRate: number;
  recommendedPitch: number;
}

export interface LlmModelOption {
  id: JarvisLlmModelId;
  label: string;
  subtitle: string;
  badge: string;
}

export const JARVIS_VOICE_OPTIONS: VoiceOption[] = [
  {
    id: 'en-US-BrianMultilingualNeural',
    label: 'Brian Multilingual (Barítono Stark)',
    subtitle: 'Português fluente com tom grave de laboratório',
    recommendedRate: 1.04,
    recommendedPitch: -2,
  },
  {
    id: 'en-AU-WilliamMultilingualNeural',
    label: 'William Multilingual (Clássico Britânico)',
    subtitle: 'Cadência culta inspirada em Paul Bettany',
    recommendedRate: 1.03,
    recommendedPitch: -2,
  },
];

export const JARVIS_LLM_OPTIONS: LlmModelOption[] = [
  {
    id: 'gpt-oss-120b',
    label: 'GPT-OSS 120B (Cérebro Supremo & Raciocínio Avançado)',
    subtitle: 'Modelo de altíssima precisão com análise profunda e respostas impecáveis',
    badge: 'Máxima Precisão',
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 70B (Raciocínio Lógico Proativo)',
    subtitle: 'Excelente para resolução de problemas complexos e raciocínio lógico',
    badge: 'Raciocínio R1',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Groq Llama 3.3 70B Versatile',
    subtitle: 'Respostas articuladas, tom culto e compreensão contextual elevada',
    badge: 'Recomendado',
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Groq Llama 3.1 8B Instant',
    subtitle: 'Latência ultra-baixa para respostas rápidas de comandos',
    badge: 'Ultra-Rápido',
  },
];

export const DEFAULT_CONFIG: VoiceConfig = {
  voiceId: 'en-US-BrianMultilingualNeural',
  rate: 1.04,
  pitch: -2,
  dspPreset: DspPreset.STARK_STUDIO,
  groqModel: 'gpt-oss-120b',
  handsFreeMode: false,
  showSubtitles: true,
  soundEffects: true,
  autoStandbyMinutes: 0,
  clapWakeEnabled: true,
};
