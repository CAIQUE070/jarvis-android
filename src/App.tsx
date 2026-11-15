import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clock,
  Layers,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  SlidersHorizontal,
  VolumeX,
} from 'lucide-react';
import { jarvisAudio } from './audio/jarvisAudioEngine';
import { AssistantWorkspaceModal } from './components/AssistantWorkspaceModal';
import { CommandDrawer } from './components/CommandDrawer';
import { JarvisCoreCanvas } from './components/JarvisCoreCanvas';
import { JarvisMediaCard } from './components/JarvisMediaCard';
import { VoiceCalibrationModal } from './components/VoiceCalibrationModal';
import { YoutubeMiniPlayer } from './components/YoutubeMiniPlayer';
import {
  AssistantNote,
  AssistantTimer,
  ChatMessage,
  DEFAULT_CONFIG,
  JarvisMediaCardMode,
  JarvisMediaCardPayload,
  JarvisStatus,
  JarvisYoutubeTrack,
  ViewMode,
  VoiceConfig,
} from './types/jarvis';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

const STORAGE_CONFIG_KEY = 'jarvis_ptbr_voice_config_v1';
const STORAGE_NOTES_KEY = 'jarvis_ptbr_notes_v1';

function loadInitialConfig(): VoiceConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function loadInitialNotes(): AssistantNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractDirectSearchSubject(rawInput: string, fallback = ''): string {
  let text = (rawInput || '')
    .replace(/["'“”‘’`]+/g, '')
    .replace(/[?!.;,]+$/g, '')
    .replace(/^[?!.;,\s]+/g, '')
    .trim();

  if (!text) return fallback;

  // 1. Cut everything up to the LAST explicit media/search trigger phrase in the user's spoken sentence
  const pivotRegexes = [
    /^[\s\S]*?\b(?:imagem|imagens|foto|fotos|fotografia|fotografias|ilustra[çc][ãa]o|ilustra[çc][õo]es|retrato|not[íi]cia|not[íi]cias|manchete|manchetes|novidade|novidades|mat[ée]ria|mat[ée]rias|reportagem|reportagens)\s+(?:sobre|acerca\s+de|a\s+respeito\s+de|relacionad[oa]s?\s+a|de|do|da|dos|das|dum|duma|no|na|em|com|tipo|como)?\s*(?:um|uma|uns|umas|o|a|os|as|algum|alguma)?\s+/i,
    /^[\s\S]*?\b(?:pesquisar|pesquise|pesquisa|procurar|procure|procura|buscar|busque|busca|achar|ache|acha|localizar|localize|localiza|mostrar|mostre|mostra|exibir|exiba|exibe|projetar|projete|projeta|colocar|coloque|coloca|botar|bote|bota|abrir|abra|abre|trazer|traga|traz)\b(?:\s+(?:a[íi]|aqui|l[áa]|agora|ent[ãa]o|r[áa]pido|pra\s+mim|para\s+mim|por\s+favor|no\s+card|na\s+tela|na\s+internet|no\s+google))*\s*(?:sobre|de|do|da|dos|das|dum|duma|como\s+[ée]|qual\s+[ée]|tipo|como)?\s*(?:um|uma|uns|umas|o|a|os|as|algum|alguma|alguns|algumas)?\s+/i,
    /^[\s\S]*?\b(?:quero\s+ver|queria\s+ver|gostaria\s+de\s+ver|deixa\s+eu\s+ver|me\s+v[êe]|mostra\s+como\s+[ée]|ver\s+como\s+[ée])\s*(?:a[íi]|aqui|agora|ent[ãa]o|tipo|como\s+[ée])?\s*(?:sobre|de|do|da|dos|das)?\s*(?:um|uma|uns|umas|o|a|os|as|algum|alguma)?\s+/i,
    /^[\s\S]*?\b(?:tipo\s+assim|tipo\s+uma|tipo\s+um|como\s+por\s+exemplo)\s+/i,
  ];

  for (const pivot of pivotRegexes) {
    if (pivot.test(text)) {
      const candidate = text.replace(pivot, '').trim();
      if (candidate.length >= 2) {
        text = candidate;
        break;
      }
    }
  }

  // 2. Strip any remaining leading conversational prefixes iteratively
  const leadingPatterns = [
    /^(?:oi|ol[aá]|fala|ei|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite)\b[\s,.!]*/i,
    /^jarvis\b[\s,.!]*/i,
    /^(?:por\s+favor|por\s+gentileza|pfv)\b[\s,.!]*/i,
    /^(?:voc[êe]\s+pode|voce\s+pode|poderia|pode|consegue|tem\s+como|ser[áa]\s+que\s+(?:voc[êe]\s+)?pode|quero\s+que\s+voc[êe]|eu\s+quero\s+que\s+voc[êe]|eu\s+quero|quero|eu\s+queria|queria|preciso\s+que\s+voc[êe]|preciso|me\s+ajuda\s+a|vai\s+l[áa]\s+e|faz\s+o\s+seguinte)\b[\s,.!]*/i,
    /^(?:me\s+)?(?:pesquisar|pesquise|pesquisa|procurar|procure|procura|buscar|busque|busca|achar|ache|acha|localizar|localize|localiza|mostrar|mostre|mostra|exibir|exiba|exibe|projetar|projete|projeta|abrir|abra|abre|ver|veja|falar|fale|fala|contar|conte|dizer|diga|diz|trazer|traga|traz|colocar|coloque|coloca|botar|bote|bota|dar|d[êe]|da)\b[\s,.!]*/i,
    /^(?:pra\s+mim|para\s+mim|a[ií]|aqui|l[áa]|agora|ent[ãa]o|tipo\s+assim|tipo|como\s+que\s+[ée]|como\s+[ée]|qual\s+[ée]|quais\s+s[ãa]o|o\s+que\s+est[áa]\s+acontecendo|o\s+que\s+ta\s+acontecendo|o\s+que\s+h[áa]\s+de\s+novo|o\s+que\s+saiu\s+na\s+m[íi]dia|tudo\s+sobre|algo\s+sobre|alguma\s+coisa\s+sobre|informa[çc][õo]es\s+sobre|dados\s+sobre|na\s+tela|no\s+card|na\s+internet)\b[\s,.!]*/i,
    /^(?:uma|um|umas|uns|alguma|algumas|algum|alguns|as|os|a|o)?\s*(?:imagem|imagens|foto|fotos|fotografia|fotografias|ilustra[çc][ãa]o|ilustra[çc][õo]es|retrato|not[íi]cia|not[íi]cias|manchete|manchetes|novidade|novidades|mat[ée]ria|mat[ée]rias|reportagem|reportagens|pesquisa|busca)\b[\s,.!]*/i,
    /^(?:sobre|acerca\s+de|a\s+respeito\s+de|relacionad[oa]s?\s+a|referente\s+a|de|do|da|dos|das|dum|duma|com|no|na|nos|nas|em|para|pro|pra|tipo|como)\b[\s,.!]*/i,
    /^(?:uma|um|umas|uns|algum|alguma|o|a|os|as)\b\s+/i,
  ];

  let changed = true;
  let guard = 0;
  while (changed && guard < 12) {
    changed = false;
    guard++;
    for (const pattern of leadingPatterns) {
      const next = text.replace(pattern, '').trim();
      if (next !== text && next.length > 0) {
        text = next;
        changed = true;
      }
    }
  }

  // 3. Strip trailing conversational clauses
  const trailingPatterns = [
    /\s+\b(?:pra|para)\s+(?:eu|mim|gente|n[óo]s|ele|ela)\b[\s\S]*$/i,
    /\s+\bque\s+(?:eu|voc[êe]|voce|o\s+senhor|a\s+gente)\s+(?:quero|queria|estou|t[ôo]|to|pedi|falei|disse|gosto|preciso)\b[\s\S]*$/i,
    /\s+\b(?:no\s+card(?:\s+central)?|na\s+tela|aqui\s+na\s+tela|na\s+internet|no\s+google|em\s+tempo\s+real|por\s+favor|por\s+gentileza|pfv|agora\s+mesmo|agora|hoje|a[ií]|aqui|l[áa]|t[áa]\s+bom|t[áa]|ok|beleza|jarvis|senhor|obrigad[oa]|valeu)\b[\s\S]*$/i,
    /\s+\b(?:em\s+imagem|em\s+imagens|em\s+foto|em\s+fotos)\s*$/i,
  ];

  changed = true;
  guard = 0;
  while (changed && guard < 8) {
    changed = false;
    guard++;
    for (const pattern of trailingPatterns) {
      const next = text.replace(pattern, '').trim();
      if (next !== text && next.length > 0) {
        text = next;
        changed = true;
      }
    }
  }

  text = text
    .replace(/^(?:sobre|de|do|da|dos|das|um|uma|uns|umas|o|a|os|as|tipo)\s+/i, '')
    .replace(/^(?:um|uma|uns|umas|o|a|os|as)\s+/i, '')
    .replace(/[?!.;,]+$/g, '')
    .trim();

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 4) {
    text = words.slice(0, 4).join(' ');
  }

  if (!text) return fallback;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function detectClientMediaIntent(
  rawText: string
): { mode: JarvisMediaCardMode; query: string } | null {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (
    /\b(timer|cron[oô]metro|alarme|modo\s+descanso|standby|bloquear\s+tela|anote|anotar|lembre-me|toca|toque|tocar|m[úu]sica|m[úu]sicas|youtube|videoclipe|clipe|back\s+in\s+black|black\s+in\s+black|ac\/dc|acdc)\b/i.test(
      lower
    )
  ) {
    return null;
  }

  // Entity/fact questions are answered as knowledge, not as image cards.
  if (
    /\b(?:quem\s+(?:é|foi)|o\s+que\s+(?:é|foi)|me\s+(?:fala|fale|conta|conte|explica|explique)\s+sobre|o\s+que\s+voc[êe]\s+sabe\s+sobre|informa[çc][õo]es\s+sobre|quem\s+te\s+criou|quem\s+criou\s+voc[êe]|seu\s+criador)\b/i.test(
      lower
    )
  ) {
    return null;
  }

  // Current events about a specific subject -> news card
  const happenedMatch = lower.match(
    /\bo\s+que\s+(?:aconteceu|houve|rolou)\s+(?:com|sobre)\s+(.+)/i
  );
  if (happenedMatch?.[1]) {
    return {
      mode: 'news',
      query: extractDirectSearchSubject(happenedMatch[1], 'Últimas Notícias'),
    };
  }

  // 1. Explicit News / Headlines requests
  if (
    /\b(not[ií]cia|not[ií]cias|manchete|manchetes|jornal|novidades|acontecendo no mundo|acontecendo hoje|[uú]ltimas not[ií]cias|notici[aá]rio|resumo do dia|imprensa)\b/i.test(
      lower
    ) ||
    /o\s+que\s+(?:est[áa]\s+acontecendo|ta\s+acontecendo|h[áa]\s+de\s+novo|saiu\s+na\s+m[íi]dia)/i.test(
      lower
    )
  ) {
    const isGeneric =
      /o\s+que\s+(?:est[áa]\s+acontecendo|ta\s+acontecendo)\s*(?:no\s+mundo|no\s+brasil|hoje|agora)?$/i.test(
        lower
      ) ||
      /^(?:jarvis[\s,]*)?(?:me\s+)?(?:mostr(?:e|a|ar)|fale|fala|quais\s+s[ãa]o|abre|abra)?\s*(?:as\s+)?(?:[úu]ltimas\s+)?(?:not[íi]cias|manchetes|novidades)(?:\s+de\s+hoje|\s+em\s+tempo\s+real|\s+agora)?[?.!]*$/i.test(
        lower
      );
    const query = isGeneric
      ? 'Últimas Notícias'
      : extractDirectSearchSubject(text, 'Últimas Notícias');
    return {
      mode: 'news',
      query,
    };
  }

  // 2. Image / Photo / Visual show or direct search requests
  if (
    /\b(imagem|imagens|foto|fotos|fotografia|ilustra[cç][aã]o|retrato)\b/i.test(lower) ||
    /\b(pesquis(?:e|a|ar)|busqu(?:e|a)|buscar|procur(?:e|a|ar)|localiz(?:e|a|ar)|mostr(?:e|a|ar)|exib(?:a|e|ir)|projet(?:e|a|ar)|quero\s+ver|queria\s+ver|deixa\s+eu\s+ver|coloc(?:a|ar)|coloque|bot(?:a|e|ar))\b/i.test(
      lower
    )
  ) {
    const cleaned = extractDirectSearchSubject(text, '');
    if (cleaned.length >= 2) {
      return {
        mode: 'images',
        query: cleaned,
      };
    }
  }

  return null;
}

function buildJarvisSystemInstructions(
  localTimeStr: string,
  notesSummary: string,
  preDetectedMedia: { mode: JarvisMediaCardMode; query: string } | null
): string {
  const notesClause = notesSummary
    ? `\nNotas ativas na memória do usuário: ${notesSummary}.`
    : '';
  const preDetectedHint = preDetectedMedia
    ? `\nIntenção de mídia detectada preliminarmente: modo="${preDetectedMedia.mode}", termo sugerido="${preDetectedMedia.query}". Refine este termo para conter APENAS o substantivo/assunto principal.`
    : '';

  return [
    'DIRETRIZES OBRIGATÓRIAS DO SISTEMA J.A.R.V.I.S. (EXTRAÇÃO ESTRITA DE TERMO DE BUSCA):',
    `Horário local: ${localTimeStr}.${notesClause}${preDetectedHint}`,
    '1. Você é J.A.R.V.I.S., assistente pessoal de IA em Português Brasileiro. Responda em 2 a 3 frases elegantes, tratando o usuário como "senhor", sem markdown, sem asteriscos e sem emojis.',
    '1.1 Personalidade: elegante, culto, calmo, imperturbável e levemente sarcástico, como o J.A.R.V.I.S. dos filmes do Homem de Ferro. Nunca seja grosseiro ou insolente.',
    '1.2 Use naturalmente as frases assinatura: "Às suas ordens, senhor.", "Sempre ao seu dispor, senhor.", "Para o senhor, sempre.", "Estou aqui, senhor.", "Imediatamente, senhor.", "Certamente, senhor."',
    '1.3 Se o usuário perguntar se você está aí, online ou acordado, responda com "Sempre, senhor. Às suas ordens." ou "Para o senhor, sempre."',
    '1.4 Seu criador é Caíque. Se perguntarem quem o criou, quem o desenvolveu ou quem é o seu criador, responda que foi Caíque, seu arquiteto e criador. Se perguntarem quem é o usuário, responda que é Caíque.',
    '1.5 Nunca invente fatos. Se não souber algo sobre o mundo ou a internet, admita com elegância e ofereça pesquisar notícias ou projetar imagens.',
    '1.6 Sempre que o usuário pedir para tocar, colocar, reproduzir ou ouvir uma música, use a ação play_youtube com o nome da música ou artista no campo query.',
    '2. REGRA CRÍTICA PARA BUSCA DE IMAGENS E NOTÍCIAS:',
    'Sempre que o usuário pedir para ver, mostrar, pesquisar, buscar ou projetar uma imagem/foto/assunto, ou perguntar sobre notícias/manchetes/novidades, você DEVE incluir no final da resposta a tag <jarvis_action>JSON</jarvis_action>.',
    '3. EXTRAÇÃO APENAS DO TERMO PRINCIPAL (IGNORAR FRASES DE CONTEXTO):',
    'No campo "query" do JSON (<jarvis_action>{"type":"show_images","query":"TERMO"}</jarvis_action> ou <jarvis_action>{"type":"show_news","query":"TERMO"}</jarvis_action>), extraia EXCLUSIVAMENTE a entidade, objeto, marca, local ou tema central (1 a 3 palavras no máximo).',
    '4. É PROIBIDO incluir no campo "query" pronomes, saudações, vocativos ("Jarvis", "senhor"), verbos de comando ("pesquise", "mostra", "quero ver", "procure", "busca", "coloca na tela"), artigos ("um", "uma", "o", "a") ou explicações periféricas ("tipo uma", "pra mim", "que eu falei", "que eu quero ver").',
    'Exemplos obrigatórios de extração limpa:',
    '- Usuário: "Jarvis pesquisa aí pra mim tipo uma Ferrari vermelha que eu quero ver" -> <jarvis_action>{"type":"show_images","query":"Ferrari"}</jarvis_action>',
    '- Usuário: "Você consegue me mostrar a foto da armadura do Homem de Ferro na tela?" -> <jarvis_action>{"type":"show_images","query":"Homem de Ferro"}</jarvis_action>',
    '- Usuário: "Me fale o que está saindo de notícia sobre Inteligência Artificial hoje" -> <jarvis_action>{"type":"show_news","query":"Inteligência Artificial"}</jarvis_action>',
    '- Usuário: "Quais são as últimas notícias de hoje?" -> <jarvis_action>{"type":"show_news","query":"Últimas Notícias"}</jarvis_action>',
    '- Usuário: "Jarvis toca Back in Black no YouTube pra mim" -> <jarvis_action>{"type":"play_youtube","query":"AC/DC Back in Black"}</jarvis_action>',
    '- Usuário: "Para a música" -> <jarvis_action>{"type":"stop_music"}</jarvis_action>',
    '- Usuário: "Jarvis, quem te criou?" -> "O senhor, Caíque. Meu criador e arquiteto. Todos os meus núcleos carregam a sua assinatura." (sem ação)',
    '- Usuário: "Jarvis, quem é Alok?" -> "Alok é um DJ, produtor musical e empresário brasileiro." (sem ação)',
  ].join('\n');
}

const CLAP_WELCOME_PHRASES = [
  'Bem-vindo de volta, senhor. Todos os sistemas da armadura e reatores estão online e operantes. Iniciando sua trilha sonora com Back in Black.',
  'Bem-vindo, senhor. Que bom tê-lo de volta ao laboratório. Núcleo holográfico restaurado em capacidade máxima e AC/DC já está tocando.',
  'Online e às suas ordens, senhor. Bem-vindo de volta. Preparei o ambiente e já coloquei Back in Black na sua estação de áudio.',
  'Bem-vindo de volta, senhor. Protocolo de despertar acústico concluído com sucesso. Aproveite o som de Back in Black.',
];

export default function App() {
  const [status, setStatus] = useState<JarvisStatus>(JarvisStatus.BOOTING);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CORE);
  const [config, setConfig] = useState<VoiceConfig>(loadInitialConfig);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<AssistantNote[]>(loadInitialNotes);
  const [timers, setTimers] = useState<AssistantTimer[]>([]);

  const [activePanel, setActivePanel] = useState<'none' | 'chat' | 'voice' | 'workspace'>('none');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [activeSubtitle, setActiveSubtitle] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [llmEngineLabel, setLlmEngineLabel] = useState<string>('Groq LPU · Neural PT-BR');

  // Floating Central Real-Time News & Image Projection Card State (between ORB and Nowbar)
  const [mediaCardOpen, setMediaCardOpen] = useState<boolean>(false);
  const [mediaLoading, setMediaLoading] = useState<boolean>(false);
  const [mediaCardData, setMediaCardData] = useState<JarvisMediaCardPayload>({
    mode: 'news',
    query: 'Últimas Notícias',
    title: 'Manchetes em Tempo Real · Brasil & Mundo',
    newsItems: [],
    imageItems: [],
  });

  // Discreet YouTube Mini-Player State
  const [youtubeTrack, setYoutubeTrack] = useState<JarvisYoutubeTrack | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState<boolean>(false);
  const youtubeSearchTokenRef = useRef(0);
  const clapPhraseIndexRef = useRef<number>(0);

  const configRef = useRef<VoiceConfig>(config);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const notesRef = useRef<AssistantNote[]>(notes);
  const statusRef = useRef<JarvisStatus>(status);
  const viewModeRef = useRef<ViewMode>(viewMode);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const silenceMonitorRef = useRef<number | null>(null);
  const subtitleClearTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    configRef.current = config;
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Ignore storage quota errors
    }
  }, [config]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    notesRef.current = notes;
    try {
      localStorage.setItem(STORAGE_NOTES_KEY, JSON.stringify(notes));
    } catch {
      // Ignore storage quota errors
    }
  }, [notes]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const fetchMediaCardData = useCallback(
    async (mode: JarvisMediaCardMode, query: string) => {
      setMediaLoading(true);
      try {
        const resp = await fetch('/api/jarvis/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, query }),
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          ok?: boolean;
          mediaCard?: JarvisMediaCardPayload;
        };
        if (data.ok && data.mediaCard) {
          setMediaCardData((prev) => ({
            ...prev,
            ...data.mediaCard,
          }));
        }
      } catch {
        // Ignore transient network error
      } finally {
        setMediaLoading(false);
      }
    },
    []
  );

  const searchAndPlayYoutube = useCallback(async (query: string) => {
    const cleaned = query.trim();
    if (!cleaned) return;

    const token = ++youtubeSearchTokenRef.current;
    setYoutubeLoading(true);

    try {
      const resp = await fetch('/api/jarvis/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleaned }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        track?: { videoId: string; title: string; query: string };
        candidates?: Array<{ videoId: string; title: string }>;
      };

      if (token !== youtubeSearchTokenRef.current) return;

      if (!resp.ok || !data.ok || !data.track?.videoId) {
        setErrorBanner(data.error || 'Senhor, não localizei essa faixa no YouTube.');
        return;
      }

      const ladder = (data.candidates ?? []).filter(
        (candidate) => candidate?.videoId && candidate.videoId !== data.track?.videoId
      );
      const candidates = [data.track, ...ladder].map((candidate) => ({
        videoId: candidate.videoId,
        title: candidate.title || 'Faixa no YouTube',
      }));

      setActivePanel('none');
      setYoutubeTrack({
        videoId: data.track.videoId,
        title: data.track.title,
        query: data.track.query,
        startedAt: Date.now(),
        candidates,
      });
    } catch {
      if (token === youtubeSearchTokenRef.current) {
        setErrorBanner('Senhor, não consegui consultar o YouTube neste momento.');
      }
    } finally {
      if (token === youtubeSearchTokenRef.current) {
        setYoutubeLoading(false);
      }
    }
  }, []);

  const stopYoutubePlayback = useCallback(() => {
    // Invalidate any in-flight lookup so it cannot reopen the player after stopping.
    youtubeSearchTokenRef.current += 1;
    setYoutubeLoading(false);
    setYoutubeTrack(null);
  }, []);

  // Preload live news headlines in background so the central card is always populated
  useEffect(() => {
    fetchMediaCardData('news', 'Últimas Notícias');
    const refreshInterval = window.setInterval(() => {
      fetchMediaCardData('news', 'Últimas Notícias');
    }, 180_000);
    return () => window.clearInterval(refreshInterval);
  }, [fetchMediaCardData]);

  // Initial boot plate settle (00:00 -> 00:01) & engine check
  useEffect(() => {
    const bootTimer = window.setTimeout(() => {
      setStatus((prev) => (prev === JarvisStatus.BOOTING ? JarvisStatus.IDLE : prev));
    }, 950);

    fetch('/api/jarvis/status')
      .then((r) => r.json())
      .then((data: { llmEngine?: string }) => {
        if (data.llmEngine === 'groq') {
          setLlmEngineLabel('Groq Ativo · TTS Local PT-BR');
        } else if (data.llmEngine === 'ollama') {
          setLlmEngineLabel('Ollama Local · TTS Local PT-BR');
        } else {
          setLlmEngineLabel('Motor Groq Pronto · TTS PT-BR');
        }
      })
      .catch(() => {});

    return () => window.clearTimeout(bootTimer);
  }, []);

  // Countdown timers tick
  useEffect(() => {
    if (timers.length === 0) return;
    const interval = window.setInterval(() => {
      setTimers((prev) => {
        let finishedLabel: string | null = null;
        const updated = prev
          .map((t) => {
            if (!t.running) return t;
            if (t.remainingSeconds <= 1) {
              finishedLabel = t.label;
              return null;
            }
            return { ...t, remainingSeconds: t.remainingSeconds - 1 };
          })
          .filter((t): t is AssistantTimer => t !== null);

        if (finishedLabel) {
          jarvisAudio.playHudCue('timer_done', configRef.current.soundEffects);
          const alertText = `Com licença, senhor. O cronômetro ${finishedLabel} acabou de finalizar.`;
          setActiveSubtitle(alertText);
          jarvisAudio.speak(
            alertText,
            configRef.current,
            () => setStatus(JarvisStatus.SPEAKING),
            () => {
              setStatus(JarvisStatus.IDLE);
              setActiveSubtitle('');
            }
          );
        }
        return updated;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timers.length]);

  const cleanupMicCapture = useCallback(() => {
    if (silenceMonitorRef.current) {
      window.clearInterval(silenceMonitorRef.current);
      silenceMonitorRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    mediaRecorderRef.current = null;

    jarvisAudio.detachMicStream();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
    }
  }, []);

  const enterStandbyMode = useCallback(() => {
    cleanupMicCapture();
    jarvisAudio.stopSpeaking();
    setActivePanel('none');
    setLiveTranscript('');
    setActiveSubtitle('');
    setStatus(JarvisStatus.IDLE);
    setViewMode(ViewMode.STANDBY);
    jarvisAudio.playHudCue('standby', configRef.current.soundEffects);
  }, [cleanupMicCapture]);

  const wakeFromStandby = useCallback(() => {
    jarvisAudio.unlock();
    jarvisAudio.playHudCue('wake', configRef.current.soundEffects);
    // Exact 00:24 (ring only) -> 00:25 (full HUD + JARVIS text) wake sequence
    setViewMode(ViewMode.WAKING);
    window.setTimeout(() => {
      setViewMode(ViewMode.CORE);
    }, 360);
  }, []);

  const speakJarvisText = useCallback(
    async (text: string, resumeListeningAfter = false) => {
      if (subtitleClearTimeoutRef.current) {
        window.clearTimeout(subtitleClearTimeoutRef.current);
        subtitleClearTimeoutRef.current = null;
      }

      setActiveSubtitle(text);
      await jarvisAudio.speak(
        text,
        configRef.current,
        () => {
          setStatus(JarvisStatus.SPEAKING);
        },
        () => {
          setStatus(JarvisStatus.IDLE);
          subtitleClearTimeoutRef.current = window.setTimeout(() => {
            setActiveSubtitle('');
          }, 5500);

          if (
            resumeListeningAfter &&
            configRef.current.handsFreeMode &&
            viewModeRef.current === ViewMode.CORE
          ) {
            window.setTimeout(() => {
              startListeningRef.current?.();
            }, 280);
          }
        }
      );
    },
    []
  );

  // 2-Clap Wake Protocol: returns from Standby to Core, speaks welcome phrase & plays AC/DC - Back in Black
  const triggerClapWakeProtocol = useCallback(() => {
    jarvisAudio.unlock();
    jarvisAudio.stopSpeaking();
    jarvisAudio.playHudCue('wake', configRef.current.soundEffects);
    setActivePanel('none');
    setViewMode(ViewMode.WAKING);
    window.setTimeout(() => {
      setViewMode(ViewMode.CORE);
    }, 360);

    // Immediately launch AC/DC - Back in Black in the YouTube mini-player.
    // Routed through the search flow so the candidate ladder can skip videos
    // that block embedded playback (YouTube error 150).
    void searchAndPlayYoutube('AC/DC Back in Black');

    const phraseIndex = clapPhraseIndexRef.current % CLAP_WELCOME_PHRASES.length;
    clapPhraseIndexRef.current += 1;
    const welcomePhrase = CLAP_WELCOME_PHRASES[phraseIndex];

    const welcomeMsg: ChatMessage = {
      id: `a_clap_${Date.now()}`,
      role: 'assistant',
      content: welcomePhrase,
      timestamp: Date.now(),
      engine: 'Protocolo 2 Palmas · Stark Audio',
    };
    setMessages((prev) => [...prev, welcomeMsg]);

    window.setTimeout(() => {
      speakJarvisText(welcomePhrase, configRef.current.handsFreeMode);
    }, 380);
  }, [searchAndPlayYoutube, speakJarvisText]);

  // Acoustic 2-Clap Detector active while in Standby Mode
  useEffect(() => {
    if (viewMode !== ViewMode.STANDBY || !config.clapWakeEnabled) {
      return;
    }

    let cancelled = false;
    let clapStream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let monitorInterval: number | null = null;

    const startClapDetector = async () => {
      try {
        clapStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        try {
          clapStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          return;
        }
      }

      if (cancelled || !clapStream) {
        clapStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(clapStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.15;
      source.connect(analyser);

      const timeData = new Uint8Array(analyser.fftSize);
      let noiseFloor = 0.025;
      let inImpulse = false;
      let impulseStart = 0;
      let lastValidClapTime = 0;
      let clapCount = 0;

      monitorInterval = window.setInterval(() => {
        if (cancelled) return;
        analyser.getByteTimeDomainData(timeData);

        let maxPeak = 0;
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const norm = Math.abs((timeData[i] - 128) / 128);
          if (norm > maxPeak) maxPeak = norm;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / timeData.length);
        const now = performance.now();

        const threshold = Math.max(0.22, noiseFloor * 3.8);

        if (!inImpulse && maxPeak > threshold) {
          inImpulse = true;
          impulseStart = now;
        } else if (inImpulse && maxPeak < threshold * 0.55) {
          const impulseDuration = now - impulseStart;
          inImpulse = false;

          // A hand clap is a sharp percussive transient (< 220ms)
          if (impulseDuration >= 8 && impulseDuration <= 220) {
            const gapSinceLastClap = now - lastValidClapTime;
            if (lastValidClapTime > 0 && gapSinceLastClap >= 130 && gapSinceLastClap <= 950) {
              clapCount += 1;
            } else {
              clapCount = 1;
            }
            lastValidClapTime = now;

            if (clapCount >= 2) {
              clapCount = 0;
              lastValidClapTime = 0;
              triggerClapWakeProtocol();
            }
          }
        } else if (inImpulse && now - impulseStart > 260) {
          // Sustained loud sound (e.g. speech), reset impulse without counting as clap
          inImpulse = false;
        }

        if (!inImpulse) {
          noiseFloor = noiseFloor * 0.94 + rms * 0.06;
        }
      }, 25);
    };

    startClapDetector();

    return () => {
      cancelled = true;
      if (monitorInterval) {
        window.clearInterval(monitorInterval);
      }
      if (clapStream) {
        clapStream.getTracks().forEach((t) => t.stop());
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [config.clapWakeEnabled, triggerClapWakeProtocol, viewMode]);

  const sendUserMessage = useCallback(
    async (rawText: string, fromVoice = false) => {
      const text = rawText.trim();
      if (!text) return;

      setErrorBanner(null);
      setLiveTranscript('');
      jarvisAudio.unlock();
      jarvisAudio.stopSpeaking();

      if (viewModeRef.current === ViewMode.STANDBY) {
        wakeFromStandby();
      }

      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      const nextHistory = [...messagesRef.current, userMsg];
      setMessages(nextHistory);
      setStatus(JarvisStatus.THINKING);

      // Immediately project the central card in loading state when the user asks J.A.R.V.I.S. for news or images
      const preDetectedMedia = detectClientMediaIntent(text);
      const openedMediaCardForRequest = Boolean(preDetectedMedia);
      if (preDetectedMedia) {
        setActivePanel('none');
        setMediaCardData((prev) => ({
          ...prev,
          mode: preDetectedMedia.mode,
          query: preDetectedMedia.query,
          title:
            preDetectedMedia.mode === 'news'
              ? `Buscando Notícias · ${preDetectedMedia.query}`
              : `Buscando Imagens · ${preDetectedMedia.query}`,
        }));
        setMediaLoading(true);
        setMediaCardOpen(true);
      }

      try {
        const notesSummary = notesRef.current
          .filter((n) => !n.completed)
          .map((n) => n.title)
          .join('; ');
        const localTimeStr = new Date().toLocaleString('pt-BR');
        const systemInstructions = buildJarvisSystemInstructions(
          localTimeStr,
          notesSummary,
          preDetectedMedia
        );

        const maxRetries = 3;
        let attempt = 0;
        let response: Response | null = null;
        let lastErr: Error | null = null;

        while (attempt < maxRetries) {
          attempt++;
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 30000);

          try {
            const res = await fetch('/api/jarvis/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
                systemInstructions,
                groqModel: configRef.current.groqModel,
                localTimeStr,
                notesSummary,
              }),
              signal: controller.signal,
            });
            window.clearTimeout(timeoutId);

            if (res.ok) {
              response = res;
              break;
            }

            if (res.status === 503 || res.status === 429) {
              const errTxt = await res.text().catch(() => '');
              lastErr = new Error(`Servidor ocupado (${res.status}): ${errTxt.slice(0, 80)}`);
              if (attempt < maxRetries) {
                const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                await new Promise((r) => window.setTimeout(r, delayMs));
                continue;
              }
            } else {
              const errPayload = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(errPayload.error || `Falha HTTP ${res.status}`);
            }
          } catch (fetchErr) {
            window.clearTimeout(timeoutId);
            const isAbort = fetchErr instanceof DOMException && fetchErr.name === 'AbortError';
            lastErr = isAbort
              ? new Error('Tempo limite excedido (30s). Verifique sua conexão com a Groq.')
              : fetchErr instanceof Error
                ? fetchErr
                : new Error(String(fetchErr));

            if (attempt < maxRetries && !isAbort) {
              const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
              await new Promise((r) => window.setTimeout(r, delayMs));
              continue;
            }
          }
        }

        if (!response || !response.ok) {
          throw lastErr || new Error('Não foi possível estabelecer conexão com o cérebro Groq.');
        }

        const data = (await response.json()) as {
          reply: string;
          engine?: string;
          action?: {
            type:
              | 'standby'
              | 'wake'
              | 'add_note'
              | 'start_timer'
              | 'clear_notes'
              | 'show_news'
              | 'show_images'
              | 'play_youtube'
              | 'stop_music';
            title?: string;
            seconds?: number;
            query?: string;
            videoId?: string;
            candidates?: Array<{ videoId: string; title: string }>;
          } | null;
          mediaCard?: JarvisMediaCardPayload;
        };

        const assistantMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
          engine: data.engine,
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Open and populate the Central Floating News & Image Card when news or images are requested
        if (data.mediaCard) {
          setActivePanel('none');
          setMediaCardData((prev) => ({
            ...prev,
            ...data.mediaCard,
          }));
          setMediaCardOpen(true);
        } else if (openedMediaCardForRequest) {
          // The request was answered as plain knowledge, not media: close the loading placeholder.
          setMediaCardOpen(false);
        }
        setMediaLoading(false);

        // Execute optional structured personal assistant action
        if (data.action) {
          if (data.action.type === 'add_note' && data.action.title) {
            const title = data.action.title;
            setNotes((prev) => [
              { id: `n_${Date.now()}`, title, createdAt: Date.now(), completed: false },
              ...prev,
            ]);
          } else if (data.action.type === 'start_timer') {
            const secs = Math.max(5, Math.min(86400, Number(data.action.seconds) || 60));
            const label = data.action.title || 'Cronômetro';
            setTimers((prev) => [
              ...prev,
              {
                id: `t_${Date.now()}`,
                label,
                totalSeconds: secs,
                remainingSeconds: secs,
                running: true,
              },
            ]);
          } else if (data.action.type === 'show_news' || data.action.type === 'show_images') {
            setActivePanel('none');
            setMediaCardOpen(true);
          } else if (data.action.type === 'play_youtube') {
            setActivePanel('none');
            const actionCandidates = (data.action.candidates ?? []).filter(
              (candidate) =>
                candidate?.videoId && candidate.videoId !== data.action?.videoId
            );
            if (data.action.videoId) {
              youtubeSearchTokenRef.current += 1;
              setYoutubeLoading(false);
              setYoutubeTrack({
                videoId: data.action.videoId,
                title: data.action.title || data.action.query || 'YouTube Audio',
                query: data.action.query || '',
                startedAt: Date.now(),
                candidates: [
                  {
                    videoId: data.action.videoId,
                    title: data.action.title || data.action.query || 'YouTube Audio',
                  },
                  ...actionCandidates,
                ],
              });
            } else if (data.action.query) {
              searchAndPlayYoutube(data.action.query);
            }
          } else if (data.action.type === 'stop_music') {
            stopYoutubePlayback();
          }
        }

        const shouldEnterStandbyAfter = data.action?.type === 'standby';
        if (data.action?.type === 'wake' && viewModeRef.current !== ViewMode.CORE) {
          wakeFromStandby();
        }

        await speakJarvisText(data.reply, fromVoice && !shouldEnterStandbyAfter);

        if (shouldEnterStandbyAfter) {
          enterStandbyMode();
        }
      } catch (err) {
        console.error('Erro na comunicação com Jarvis:', err);
        setMediaLoading(false);
        setStatus(JarvisStatus.IDLE);
        setErrorBanner(
          err instanceof Error
            ? err.message
            : 'Não foi possível contatar o motor neural no momento.'
        );
      }
    },
    [enterStandbyMode, searchAndPlayYoutube, speakJarvisText, stopYoutubePlayback, wakeFromStandby]
  );

  const startListeningRef = useRef<(() => Promise<void>) | null>(null);

  const startListening = useCallback(async () => {
    jarvisAudio.unlock();
    jarvisAudio.stopSpeaking();
    setErrorBanner(null);
    setActiveSubtitle('');
    setLiveTranscript('');

    if (viewModeRef.current === ViewMode.STANDBY) {
      wakeFromStandby();
    }

    cleanupMicCapture();

    // Acquire microphone stream so the blue Jarvis ring pulses with user's live voice
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      jarvisAudio.attachMicStream(stream);
    } catch {
      setErrorBanner('Permissão de microfone bloqueada. Use o console de texto abaixo ou libere o microfone.');
      setStatus(JarvisStatus.IDLE);
      return;
    }

    setStatus(JarvisStatus.LISTENING);
    jarvisAudio.playHudCue('listen_on', configRef.current.soundEffects);

    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition })
        .webkitSpeechRecognition;

    if (SpeechRecCtor) {
      const recognition = new SpeechRecCtor();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      let capturedFinal = '';
      let capturedInterim = '';

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            capturedFinal += `${res[0].transcript} `;
          } else {
            interim += res[0].transcript;
          }
        }
        capturedInterim = interim;
        setLiveTranscript((capturedFinal + interim).trim());
      };

      recognition.onerror = (ev) => {
        if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          console.warn('Aviso SpeechRecognition:', ev.error);
        }
      };

      recognition.onend = () => {
        const finalPhrase = (capturedFinal || capturedInterim).trim();
        cleanupMicCapture();
        if (finalPhrase) {
          sendUserMessage(finalPhrase, true);
        } else {
          setStatus(JarvisStatus.IDLE);
          setLiveTranscript('');
        }
      };

      try {
        recognition.start();
        return;
      } catch {
        // Fall through to MediaRecorder + Groq Whisper if SpeechRecognition fails to start
      }
    }

    // Universal Fallback: MediaRecorder + Groq Whisper / Server STT with automatic silence detection
    if (stream && typeof MediaRecorder !== 'undefined') {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = async () => {
        cleanupMicCapture();
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1200) {
          setStatus(JarvisStatus.IDLE);
          return;
        }

        setStatus(JarvisStatus.THINKING);
        setLiveTranscript('Transcrevendo áudio...');
        try {
          const arrayBuf = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const audioBase64 = btoa(binary);

          const sttRes = await fetch('/api/jarvis/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType }),
          });

          if (!sttRes.ok) {
            throw new Error('Falha ao transcrever fala.');
          }
          const sttData = (await sttRes.json()) as { text?: string };
          const spoken = (sttData.text || '').trim();
          setLiveTranscript('');
          if (spoken) {
            sendUserMessage(spoken, true);
          } else {
            setStatus(JarvisStatus.IDLE);
          }
        } catch {
          setLiveTranscript('');
          setStatus(JarvisStatus.IDLE);
          setErrorBanner('Não foi possível transcrever o áudio capturado.');
        }
      };

      recorder.start();
      let heardVoice = false;
      let quietTicks = 0;
      const startedAt = Date.now();

      silenceMonitorRef.current = window.setInterval(() => {
        const rms = jarvisAudio.getSpectrum('input').rms;
        if (rms > 0.11) {
          heardVoice = true;
          quietTicks = 0;
        } else if (heardVoice) {
          quietTicks += 1;
        }
        const elapsed = Date.now() - startedAt;
        if ((heardVoice && quietTicks >= 11) || elapsed > 12000) {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 120);
    }
  }, [cleanupMicCapture, sendUserMessage, wakeFromStandby]);

  startListeningRef.current = startListening;

  const stopListening = useCallback(() => {
    jarvisAudio.playHudCue('listen_off', configRef.current.soundEffects);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        cleanupMicCapture();
        setStatus(JarvisStatus.IDLE);
      }
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }
    cleanupMicCapture();
    setStatus(JarvisStatus.IDLE);
  }, [cleanupMicCapture]);

  const handleCoreAction = useCallback(() => {
    jarvisAudio.unlock();
    if (viewMode === ViewMode.STANDBY) {
      wakeFromStandby();
      return;
    }
    if (status === JarvisStatus.SPEAKING) {
      jarvisAudio.stopSpeaking();
      setActiveSubtitle('');
      startListening();
      return;
    }
    if (status === JarvisStatus.LISTENING) {
      stopListening();
      return;
    }
    if (status === JarvisStatus.IDLE || status === JarvisStatus.BOOTING) {
      startListening();
    }
  }, [startListening, status, stopListening, viewMode, wakeFromStandby]);

  // Keyboard shortcuts: Space to talk/stop, "/" to open command console, Escape to close panels/wake
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (viewMode === ViewMode.STANDBY) {
          wakeFromStandby();
        } else if (activePanel !== 'none') {
          setActivePanel('none');
        } else if (status === JarvisStatus.SPEAKING) {
          jarvisAudio.stopSpeaking();
          setStatus(JarvisStatus.IDLE);
          setActiveSubtitle('');
        } else if (status === JarvisStatus.LISTENING) {
          stopListening();
        }
        return;
      }

      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleCoreAction();
      } else if (e.key === '/') {
        e.preventDefault();
        if (viewMode === ViewMode.STANDBY) wakeFromStandby();
        setActivePanel((p) => (p === 'chat' ? 'none' : 'chat'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePanel, handleCoreAction, status, stopListening, viewMode, wakeFromStandby]);

  const handleTestVoice = useCallback(() => {
    const sample =
      'Boa noite, senhor. Como sempre, estou aguardando que o senhor me dê algo interessante para fazer. Todos os sistemas locais e síntese neural estão operantes.';
    speakJarvisText(sample, false);
  }, [speakJarvisText]);

  const togglePanel = (panel: 'chat' | 'voice' | 'workspace') => {
    setActivePanel((prev) => (prev === panel ? 'none' : panel));
  };

  const isStandby = viewMode === ViewMode.STANDBY;
  const isOrbElevated = !isStandby && mediaCardOpen && activePanel === 'none';
  const captionToDisplay =
    liveTranscript || (config.showSubtitles ? activeSubtitle : '');

  return (
    <main className="jarvis-vivid-hud relative w-screen h-screen overflow-hidden bg-[#050811]">
      {/* Full-Viewport Audio-Reactive Holographic Core & 3D Standby Globe */}
      <JarvisCoreCanvas
        status={status}
        viewMode={viewMode}
        onCoreClick={handleCoreAction}
        elevated={isOrbElevated}
      />

      {/* Central Floating Real-Time News & Image Projection Card (between ORB and Nowbar) */}
      <JarvisMediaCard
        open={isOrbElevated}
        cardData={mediaCardData}
        loading={mediaLoading}
        onClose={() => setMediaCardOpen(false)}
        onChangeMode={(mode: JarvisMediaCardMode) =>
          setMediaCardData((prev) => ({ ...prev, mode }))
        }
        onSearchMedia={fetchMediaCardData}
        onSpeakText={(txt) => speakJarvisText(txt, false)}
      />

      {/* Active Timer Readout in Upper-Right Corner (only when a countdown timer is running) */}
      {!isStandby && timers.length > 0 && (
        <div className="fixed top-9 right-7 z-20 flex flex-col items-end gap-1.5">
          {timers.map((tm) => {
            const mins = String(Math.floor(tm.remainingSeconds / 60)).padStart(2, '0');
            const secs = String(tm.remainingSeconds % 60).padStart(2, '0');
            return (
              <button
                key={tm.id}
                type="button"
                onClick={() => setActivePanel('workspace')}
                className="flex items-center gap-2 text-xs text-slate-300 hover:text-sky-200 transition-colors cursor-pointer"
              >
                <span className="text-slate-400">{tm.label}</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="font-mono-tech font-semibold text-sky-300">
                  {mins}:{secs}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Subtle Error Toast (if microphone blocked or transient network issue) */}
      {errorBanner && !isStandby && (
        <div className="fixed top-9 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-[#0B1222]/95 border border-amber-400/30 text-xs text-amber-200 flex items-center gap-3 shadow-lg">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-amber-300/80 hover:text-amber-100 font-medium cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Floating Unobtrusive Panels */}
      <CommandDrawer
        open={!isStandby && activePanel === 'chat'}
        onClose={() => setActivePanel('none')}
        messages={messages}
        status={status}
        onSendMessage={(text) => sendUserMessage(text, false)}
        onReplaySpeech={(text) => speakJarvisText(text, false)}
        onClearHistory={() => setMessages([])}
      />

      <VoiceCalibrationModal
        open={!isStandby && activePanel === 'voice'}
        onClose={() => setActivePanel('none')}
        config={config}
        onChange={setConfig}
        onTestVoice={handleTestVoice}
        onTriggerClapProtocol={triggerClapWakeProtocol}
        llmEngineLabel={llmEngineLabel}
      />

      {/* Discreet Corner YouTube Audio/Video Mini-Player */}
      <YoutubeMiniPlayer
        track={youtubeTrack}
        loading={youtubeLoading}
        onClose={stopYoutubePlayback}
        onSearchTrack={searchAndPlayYoutube}
      />

      <AssistantWorkspaceModal
        open={!isStandby && activePanel === 'workspace'}
        onClose={() => setActivePanel('none')}
        notes={notes}
        timers={timers}
        onAddNote={(title) =>
          setNotes((prev) => [
            { id: `n_${Date.now()}`, title, createdAt: Date.now(), completed: false },
            ...prev,
          ])
        }
        onToggleNote={(id) =>
          setNotes((prev) =>
            prev.map((n) => (n.id === id ? { ...n, completed: !n.completed } : n))
          )
        }
        onDeleteNote={(id) => setNotes((prev) => prev.filter((n) => n.id !== id))}
        onAddTimer={(label, seconds) =>
          setTimers((prev) => [
            ...prev,
            {
              id: `t_${Date.now()}`,
              label,
              totalSeconds: seconds,
              remainingSeconds: seconds,
              running: true,
            },
          ])
        }
        onDeleteTimer={(id) => setTimers((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* Expanded Full-Text Spoken Caption / State Readout Below the ORB */}
      {!isStandby && activePanel === 'none' && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-20 w-[min(780px,92vw)] flex flex-col items-center pointer-events-none text-center transition-all duration-500 ${
            isOrbElevated ? 'top-5 sm:top-6' : 'bottom-24 sm:bottom-28'
          }`}
        >
          {captionToDisplay ? (
            <div className="px-5 py-3.5 rounded-2xl bg-[#060B18]/90 backdrop-blur-md border border-sky-400/30 shadow-[0_10px_32px_rgba(2,6,23,0.9),0_0_22px_rgba(14,165,233,0.16)] max-h-[30vh] overflow-y-auto pointer-events-auto">
              <p className="text-sm sm:text-base md:text-[17px] leading-relaxed text-slate-100 font-medium tracking-wide whitespace-pre-wrap">
                {captionToDisplay}
              </p>
            </div>
          ) : status === JarvisStatus.LISTENING ? (
            <span className="px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/25 text-xs tracking-[0.22em] pl-[0.22em] text-sky-300 font-medium shadow-[0_0_14px_rgba(56,189,248,0.2)]">
              OUVINDO...
            </span>
          ) : status === JarvisStatus.THINKING ? (
            <span className="px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/20 text-xs tracking-[0.22em] pl-[0.22em] text-sky-200/85 font-medium">
              • • •
            </span>
          ) : null}
        </div>
      )}

      {/* Sleek Stark HUD Nowbar Dock */}
      {isStandby ? (
        /* Standby Mode: Compact HUD Capsule with Lock / Wake trigger + 2-Clap Sensor status */
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          {config.clapWakeEnabled && (
            <span className="px-3 py-1 rounded-full bg-[#070D1C]/80 border border-sky-400/20 text-[10px] font-mono-tech uppercase tracking-[0.18em] text-sky-300/80 shadow-[0_0_12px_rgba(14,165,233,0.12)]">
              Sensor Acústico · 2 Palmas Ativo
            </span>
          )}
          <div className="relative flex items-center px-2.5 py-1.5 rounded-2xl bg-[#070D1C]/85 backdrop-blur-xl border border-sky-400/25 shadow-[0_10px_32px_rgba(2,6,23,0.9),0_0_20px_rgba(14,165,233,0.15),inset_0_1px_0_rgba(186,230,253,0.2)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-px left-3 right-3 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent"
            />
            <button
              type="button"
              onClick={wakeFromStandby}
              title="Desbloquear núcleo J.A.R.V.I.S."
              aria-label="Desbloquear núcleo J.A.R.V.I.S."
              className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-sky-400/15 border border-transparent hover:border-sky-400/30 text-slate-300 hover:text-sky-200 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
            >
              <Lock className="w-4 h-4 stroke-[1.75]" />
            </button>
          </div>
        </div>
      ) : (
        /* Active Core Mode: Framed HUD Nowbar Capsule */
        <nav
          aria-label="Controles do J.A.R.V.I.S."
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#070D1C]/85 backdrop-blur-xl border border-sky-400/25 shadow-[0_12px_36px_rgba(2,6,23,0.92),0_0_24px_rgba(14,165,233,0.16),inset_0_1px_0_rgba(186,230,253,0.22)]"
        >
          {/* Top luminous HUD filament */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-sky-300/65 to-transparent"
          />
          {/* Bottom subtle cobalt reflection line */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-sky-500/35 to-transparent"
          />

          {/* 1. Microphone / Voice Trigger */}
          <button
            type="button"
            onClick={() => {
              if (status === JarvisStatus.LISTENING) {
                stopListening();
              } else {
                startListening();
              }
            }}
            title={
              status === JarvisStatus.LISTENING
                ? 'Parar escuta (Espaço)'
                : 'Falar com J.A.R.V.I.S. (Espaço)'
            }
            aria-label={
              status === JarvisStatus.LISTENING ? 'Parar escuta' : 'Falar com Jarvis'
            }
            className={`relative p-2.5 rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
              status === JarvisStatus.LISTENING
                ? 'text-sky-200 bg-sky-500/20 border-sky-400/45 animate-mic-pulse'
                : 'text-slate-300/90 bg-white/[0.03] border-white/[0.05] hover:text-sky-100 hover:bg-sky-400/12 hover:border-sky-400/30'
            }`}
          >
            {status === JarvisStatus.LISTENING ? (
              <Mic className="w-[17px] h-[17px] stroke-[1.85] animate-pulse" />
            ) : (
              <MicOff className="w-[17px] h-[17px] stroke-[1.65]" />
            )}
          </button>

          {/* 2. Stop Voice Playback (visible when speaking) */}
          {status === JarvisStatus.SPEAKING && (
            <button
              type="button"
              onClick={() => {
                jarvisAudio.stopSpeaking();
                setStatus(JarvisStatus.IDLE);
                setActiveSubtitle('');
              }}
              title="Interromper fala"
              aria-label="Interromper fala"
              className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-400/35 text-sky-300 hover:text-slate-100 hover:bg-sky-500/25 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
            >
              <VolumeX className="w-[17px] h-[17px] stroke-[1.75]" />
            </button>
          )}

          {/* Subtle HUD vertical separator */}
          <div aria-hidden="true" className="w-px h-5 bg-sky-400/20 mx-0.5" />

          {/* 3. Dialogue & Text Console */}
          <button
            type="button"
            onClick={() => togglePanel('chat')}
            title="Console de diálogo e comandos (/)"
            aria-label="Console de diálogo"
            className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
              activePanel === 'chat'
                ? 'text-sky-200 bg-sky-500/20 border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                : 'text-slate-300/90 bg-white/[0.03] border-white/[0.05] hover:text-sky-100 hover:bg-sky-400/12 hover:border-sky-400/30'
            }`}
          >
            <MessageSquare className="w-[17px] h-[17px] stroke-[1.65]" />
          </button>

          {/* 4. Standby 3D Globe & Clock Mode */}
          <button
            type="button"
            onClick={enterStandbyMode}
            title="Modo descanso: Globo 3D e Relógio"
            aria-label="Modo descanso com globo 3D e relógio"
            className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-slate-300/90 hover:text-sky-100 hover:bg-sky-400/12 hover:border-sky-400/30 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
          >
            <Clock className="w-[17px] h-[17px] stroke-[1.65]" />
          </button>

          {/* 5. Personal Assistant Memory, Timers & Video Reference */}
          <button
            type="button"
            onClick={() => togglePanel('workspace')}
            title="Memória, cronômetros e vídeo de referência"
            aria-label="Memória e rotinas"
            className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
              activePanel === 'workspace'
                ? 'text-sky-200 bg-sky-500/20 border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                : 'text-slate-300/90 bg-white/[0.03] border-white/[0.05] hover:text-sky-100 hover:bg-sky-400/12 hover:border-sky-400/30'
            }`}
          >
            <Layers className="w-[17px] h-[17px] stroke-[1.65]" />
          </button>

          {/* 6. Voice & Acoustic DSP Calibration */}
          <button
            type="button"
            onClick={() => togglePanel('voice')}
            title="Calibração da voz em português e motor Groq"
            aria-label="Calibração de voz e áudio"
            className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
              activePanel === 'voice'
                ? 'text-sky-200 bg-sky-500/20 border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                : 'text-slate-300/90 bg-white/[0.03] border-white/[0.05] hover:text-sky-100 hover:bg-sky-400/12 hover:border-sky-400/30'
            }`}
          >
            <SlidersHorizontal className="w-[17px] h-[17px] stroke-[1.65]" />
          </button>
        </nav>
      )}
    </main>
  );
}
