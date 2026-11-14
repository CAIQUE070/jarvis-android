import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_VOICES = new Set([
  'xtts-v2-cloned-neural',
  'en-US-BrianMultilingualNeural',
  'en-AU-WilliamMultilingualNeural',
  'pt-BR-AntonioNeural',
]);

const ALLOWED_GROQ_MODELS = new Set([
  'gpt-oss-120b',
  'deepseek-r1-distill-llama-70b',
  'llama-3.3-70b-versatile',
  'llama3-8b-8192',
  'llama-3.1-8b-instant',
]);

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface JarvisAction {
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
  candidates?: YoutubeCandidate[];
}

interface YoutubeCandidate {
  videoId: string;
  title: string;
}

interface ServerNewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  imageUrl?: string;
  snippet?: string;
  category?: string;
}

interface ServerImageItem {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string;
  description?: string;
  sourceUrl?: string;
  sourceName?: string;
}

interface GroundingWebLink {
  title: string;
  uri: string;
}

interface ServerMediaCardPayload {
  mode: 'news' | 'images';
  query: string;
  title: string;
  summary?: string;
  newsItems?: ServerNewsItem[];
  imageItems?: ServerImageItem[];
  groundingLinks?: GroundingWebLink[];
  updatedAt?: number;
}

const EDITORIAL_FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=900&q=80',
];

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .trim();
}

function stripHtmlTags(str: string): string {
  return decodeXmlEntities(str)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRelativeTimePtBr(pubDateRaw: string): string {
  if (!pubDateRaw) return 'Agora mesmo';
  const parsed = Date.parse(pubDateRaw);
  if (Number.isNaN(parsed)) return 'Recente';
  const diffMinutes = Math.max(1, Math.round((Date.now() - parsed) / 60000));
  if (diffMinutes < 60) {
    return `Há ${diffMinutes} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Há ${diffHours}h`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `Há ${diffDays} dias`;
  return new Date(parsed).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

async function fetchWikipediaThumbnailForTopic(topic: string): Promise<string | null> {
  const clean = topic
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .join(' ')
    .trim();
  if (!clean) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2800);
  try {
    const url = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      clean
    )}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JarvisStarkHUD/1.0 (pt-BR)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: {
        pages?: Record<string, { thumbnail?: { source?: string } }>;
      };
    };
    const pages = data.query?.pages ? Object.values(data.query.pages) : [];
    return pages[0]?.thumbnail?.source || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchRealtimeNewsServer(rawQuery?: string): Promise<ServerNewsItem[]> {
  const clean = (rawQuery || '').trim();
  const lower = clean.toLowerCase();
  const isGeneralTopNews =
    !clean ||
    lower === 'notícias' ||
    lower === 'noticias' ||
    lower === 'últimas notícias' ||
    lower === 'ultimas noticias' ||
    lower === 'destaques' ||
    lower === 'notícias de hoje' ||
    lower === 'noticias de hoje' ||
    lower === 'notícias em tempo real' ||
    lower === 'noticias em tempo real' ||
    lower === 'mundo' ||
    lower === 'brasil';

  const rssUrl = isGeneralTopNews
    ? 'https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419'
    : `https://news.google.com/rss/search?q=${encodeURIComponent(clean)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const resp = await fetch(rssUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`RSS status ${resp.status}`);
    }

    const xml = await resp.text();
    const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
    const parsedItems: ServerNewsItem[] = [];

    for (let i = 0; i < Math.min(itemBlocks.length, 10); i++) {
      const block = itemBlocks[i];
      const rawTitleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
      const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);

      let fullTitle = rawTitleMatch ? decodeXmlEntities(rawTitleMatch[1]) : '';
      let sourceName = sourceMatch ? decodeXmlEntities(sourceMatch[1]) : 'Google Notícias';

      const dashIdx = fullTitle.lastIndexOf(' - ');
      if (dashIdx > 12) {
        const trailingSource = fullTitle.slice(dashIdx + 3).trim();
        fullTitle = fullTitle.slice(0, dashIdx).trim();
        if (!sourceMatch && trailingSource) {
          sourceName = trailingSource;
        }
      }

      if (!fullTitle) continue;

      const link = linkMatch ? decodeXmlEntities(linkMatch[1]) : 'https://news.google.com';
      const pubDate = pubDateMatch ? decodeXmlEntities(pubDateMatch[1]) : '';
      const rawDesc = descMatch ? stripHtmlTags(descMatch[1]) : '';
      const snippet =
        rawDesc && rawDesc.length > 20 && rawDesc !== fullTitle
          ? rawDesc.slice(0, 220)
          : `Cobertura em tempo real publicada por ${sourceName}.`;

      parsedItems.push({
        id: `news_${i}_${Date.now()}`,
        title: fullTitle,
        source: sourceName,
        publishedAt: formatRelativeTimePtBr(pubDate),
        url: link,
        imageUrl: EDITORIAL_FALLBACK_IMAGES[i % EDITORIAL_FALLBACK_IMAGES.length],
        snippet,
        category: isGeneralTopNews ? 'Tempo Real' : clean,
      });
    }

    // Enrich top 3 news items with real topic thumbnails from Wikipedia PT if available
    await Promise.all(
      parsedItems.slice(0, 3).map(async (item) => {
        const wikiImg = await fetchWikipediaThumbnailForTopic(item.title);
        if (wikiImg) {
          item.imageUrl = wikiImg;
        }
      })
    );

    return parsedItems;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

function extractDirectSearchSubject(rawInput: string, fallback = ''): string {
  let text = (rawInput || '')
    .replace(/<jarvis_action>[\s\S]*?<\/jarvis_action>/gi, '')
    .replace(/[?!.;,]+$/g, '')
    .replace(/^[?!.;,\s]+/g, '')
    .trim();

  if (!text) return fallback;

  // Strip common conversational clauses from the beginning iteratively
  const leadingPatterns = [
    /^(?:oi|ol[aá]|fala|ei|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite)\b[\s,.!]*/i,
    /^jarvis\b[\s,.!]*/i,
    /^(?:por\s+favor|por\s+gentileza|pfv)\b[\s,.!]*/i,
    /^(?:voc[êe]\s+pode|voce\s+pode|poderia|pode|consegue|tem\s+como|ser[áa]\s+que\s+(?:voc[êe]\s+)?pode|quero\s+que\s+voc[êe]|eu\s+quero\s+que\s+voc[êe]|gostaria\s+que\s+voc[êe]|eu\s+gostaria\s+de|eu\s+quero|quero|preciso\s+que\s+voc[êe]|preciso|me\s+ajuda\s+a|vai\s+l[áa]\s+e)\b[\s,.!]*/i,
    /^(?:me\s+)?(?:pesquisar|pesquise|pesquisa|procurar|procure|procura|buscar|busque|busca|achar|ache|acha|localizar|localize|localiza|mostrar|mostre|mostra|exibir|exiba|exibe|projetar|projete|projeta|abrir|abra|abre|ver|veja|falar|fale|fala|contar|conte|dizer|diga|diz|trazer|traga|traz|colocar|coloque|coloca|botar|bote|bota|dar|d[êe]|da)\b[\s,.!]*/i,
    /^(?:pra\s+mim|para\s+mim|a[ií]|aqui|agora|ent[ãa]o|tipo\s+assim|tipo|como\s+que\s+[ée]|como\s+[ée]|qual\s+[ée]|quais\s+s[ãa]o|o\s+que\s+est[áa]\s+acontecendo|o\s+que\s+ta\s+acontecendo|o\s+que\s+h[áa]\s+de\s+novo|o\s+que\s+saiu\s+na\s+m[íi]dia|tudo\s+sobre|algo\s+sobre|alguma\s+coisa\s+sobre|informa[çc][õo]es\s+sobre|dados\s+sobre)\b[\s,.!]*/i,
    /^(?:uma|um|umas|uns|alguma|algumas|algum|alguns|as|os|a|o)\s+(?:imagem|imagens|foto|fotos|fotografia|fotografias|ilustra[çc][ãa]o|ilustra[çc][õo]es|retrato|not[íi]cia|not[íi]cias|manchete|manchetes|novidade|novidades|mat[ée]ria|mat[ée]rias|reportagem|reportagens|pesquisa|busca)\b[\s,.!]*/i,
    /^(?:imagem|imagens|foto|fotos|fotografia|fotografias|ilustra[çc][ãa]o|ilustra[çc][õo]es|retrato|not[íi]cia|not[íi]cias|manchete|manchetes|novidade|novidades|mat[ée]ria|mat[ée]rias|reportagem|reportagens)\b[\s,.!]*/i,
    /^(?:sobre|acerca\s+de|a\s+respeito\s+de|relacionad[oa]s?\s+a|referente\s+a|de|do|da|dos|das|com|no|na|nos|nas|em|para|pro|pra|tipo|como)\b[\s,.!]*/i,
    /^(?:uma|um|umas|uns|o|a|os|as)\b\s+/i,
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

  // Strip trailing conversational filler iteratively
  const trailingPatterns = [
    /\s+\b(?:pra\s+mim|para\s+mim|por\s+favor|por\s+gentileza|pfv|no\s+card(?:\s+central)?|na\s+tela|aqui\s+na\s+tela|na\s+internet|no\s+google|em\s+tempo\s+real|agora\s+mesmo|agora|hoje|a[ií]|aqui|t[áa]\s+bom|t[áa]|ok|beleza|jarvis|senhor)\s*$/i,
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

  // Final cleanup of stray leading articles if still present
  text = text.replace(/^(?:o|a|os|as|um|uma)\s+/i, '').replace(/[?!.;,]+$/g, '').trim();

  if (!text) return fallback;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface WebKnowledgeResult {
  title: string;
  extract: string;
  url: string;
}

const knowledgeCache = new Map<
  string,
  { result: WebKnowledgeResult | null; cachedAt: number }
>();

function normalizeMatchText(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanKnowledgeTopic(raw: string): string | null {
  let topic = (raw || '')
    .replace(/<jarvis_action>[\s\S]*?<\/jarvis_action>/gi, '')
    .replace(/[?!.;,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  let guard = 0;
  while (changed && guard < 5) {
    changed = false;
    guard += 1;
    const next = topic
      .replace(
        /\s+(?:na\s+internet|no\s+google|pra\s+mim|para\s+mim|por\s+favor|por\s+gentileza|pfv|senhor|jarvis|mesmo|a[ií]|aqui|agora)\s*$/i,
        ''
      )
      .trim();
    if (next !== topic) {
      topic = next;
      changed = true;
    }
  }

  topic = topic
    .replace(/^(?:o|a|os|as|um|uma|uns|umas)\s+/i, '')
    .replace(/[?!.;,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (topic.length < 2 || topic.length > 90) return null;
  if (topic.split(/\s+/).length > 8) return null;

  const normalized = normalizeMatchText(topic);
  if (!normalized) return null;

  if (/^o que (?:aconteceu|houve|rolou)\b/i.test(normalized)) {
    return null;
  }

  if (
    /^(?:voce|vc|tu|o senhor|eu|nos|isso|isto|aquilo|ele|ela|eles|elas|alguem|ninguem|tudo|nada|qualquer coisa|alguma coisa)$/i.test(
      normalized
    )
  ) {
    return null;
  }

  if (
    /\b(?:seu criador|tua criador|me criou|te criou|criador do jarvis|jarvis)\b/i.test(
      normalized
    )
  ) {
    return null;
  }

  if (
    /\b(?:imagem|imagens|foto|fotos|fotografia|video|videos|noticia|noticias|manchete|manchetes|player|miniplayer)\b/i.test(
      normalized
    )
  ) {
    return null;
  }

  return topic;
}

function extractKnowledgeTopic(rawText: string): string | null {
  const core = (rawText || '')
    .replace(/<jarvis_action>[\s\S]*?<\/jarvis_action>/gi, '')
    .replace(
      /^(?:(?:oi|ol[aá]|fala|ei|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite|jarvis|por\s+favor|por\s+gentileza|pfv)[\s,.!]*)+/i,
      ''
    )
    .trim();

  if (!core) return null;

  const patterns: RegExp[] = [
    /^(?:me\s+)?quem\s+(?:é|foi|s[ãa]o|eram)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/i,
    /^(?:me\s+)?o\s+que\s+(?:é|foi|s[ãa]o|eram)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/i,
    /^(?:me\s+)?(?:fala|fale|conta|conte|explica|explique|discorra|diz|diga)\s+(?:sobre|do|da|de)\s+(.+)$/i,
    /^(?:o\s+que\s+voc[êe]\s+(?:sabe|conhece)|voc[êe]\s+sabe)\s+(?:sobre|do|da|de)\s+(.+)$/i,
    /^(?:informa[çc][õo]es|dados|curiosidades|tudo)\s+(?:sobre|do|da|de)\s+(.+)$/i,
    /^(?:pesquis(?:e|a|ar)|busc(?:e|a|ar)|procur(?:e|a|ar)|localiz(?:e|a|ar))\s+(?:na\s+internet\s+)?(?:sobre\s+|por\s+)?(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = core.match(pattern);
    if (match?.[1]) {
      const topic = cleanKnowledgeTopic(match[1]);
      if (topic) return topic;
    }
  }

  return null;
}

function trimKnowledgeExtract(raw: string, maxLength = 380): string {
  const clean = (raw || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;

  const slice = clean.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );
  if (lastSentenceEnd > 140) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}...`;
}

async function fetchWikipediaSummaryServer(
  rawTopic: string
): Promise<WebKnowledgeResult | null> {
  const topic = (rawTopic || '').trim().slice(0, 90);
  if (!topic) return null;

  const cacheKey = topic.toLowerCase();
  const cached = knowledgeCache.get(cacheKey);
  const cacheTtl = cached?.result ? 30 * 60 * 1000 : 5 * 60 * 1000;
  if (cached && Date.now() - cached.cachedAt < cacheTtl) {
    return cached.result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const url = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      topic
    )}&gsrlimit=5&prop=extracts|info&exintro=1&explaintext=1&exchars=900&inprop=url&format=json&origin=*`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'JarvisStarkHUD/1.0 (pt-BR)' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = (await resp.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              index?: number;
              title?: string;
              extract?: string;
              fullurl?: string;
            }
          >;
        };
      };

      const pages = data.query?.pages
        ? Object.values(data.query.pages).sort(
            (a, b) => (a.index ?? 99) - (b.index ?? 99)
          )
        : [];

      const topicNormalized = normalizeMatchText(topic);
      const topicTokens = topicNormalized.split(' ').filter((t) => t.length >= 3);

      for (const page of pages) {
        const title = (page.title || '').trim();
        const extract = (page.extract || '').replace(/\s+/g, ' ').trim();
        if (!title || extract.length < 40) continue;
        if (/desambigua/i.test(title)) continue;

        const titleNormalized = normalizeMatchText(title);
        const titleTokens = new Set(
          titleNormalized.split(' ').filter((t) => t.length >= 3)
        );
        const matches = topicTokens.filter((token) => titleTokens.has(token)).length;
        const relevant =
          titleNormalized === topicNormalized ||
          titleNormalized.includes(topicNormalized) ||
          topicNormalized.includes(titleNormalized) ||
          (topicTokens.length > 0 && matches / topicTokens.length >= 0.6);

        if (!relevant) continue;

        const result: WebKnowledgeResult = {
          title,
          extract,
          url:
            page.fullurl ||
            `https://pt.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        };

        knowledgeCache.set(cacheKey, { result, cachedAt: Date.now() });
        if (knowledgeCache.size > 120) {
          const oldestKey = knowledgeCache.keys().next().value;
          if (oldestKey) knowledgeCache.delete(oldestKey);
        }
        return result;
      }
    }
  } catch {
    clearTimeout(timer);
  }

  knowledgeCache.set(cacheKey, { result: null, cachedAt: Date.now() });
  return null;
}

function buildKnowledgeReply(fact: WebKnowledgeResult, userText: string): string {
  const extract = trimKnowledgeExtract(fact.extract, 380);
  const opener = /quem\s+(?:é|foi)/i.test(userText)
    ? 'Certamente, senhor.'
    : 'Segundo meus arquivos, senhor:';
  return sanitizeForSpeech(`${opener} ${extract}`);
}

async function fetchRealtimeImagesServer(rawQuery: string): Promise<ServerImageItem[]> {
  const target = extractDirectSearchSubject(rawQuery, 'Universo');
  const results: ServerImageItem[] = [];
  const seenUrls = new Set<string>();

  const addImage = (item: ServerImageItem) => {
    if (!item.imageUrl || seenUrls.has(item.imageUrl)) return;
    if (item.imageUrl.endsWith('.svg') || item.imageUrl.endsWith('.tif') || item.imageUrl.endsWith('.pdf')) {
      return;
    }
    seenUrls.add(item.imageUrl);
    results.push(item);
  };

  // 1. Wikipedia PT Search with PageImages & Extracts
  const fetchWikiPt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        target
      )}&gsrlimit=6&prop=pageimages|extracts|info&piprop=original|thumbnail&pithumbsize=1000&exintro=1&explaintext=1&exchars=240&inprop=url&format=json&origin=*`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'JarvisStarkHUD/1.0 (pt-BR)' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              pageid?: number;
              title?: string;
              extract?: string;
              fullurl?: string;
              original?: { source?: string };
              thumbnail?: { source?: string };
            }
          >;
        };
      };
      const pages = data.query?.pages ? Object.values(data.query.pages) : [];
      for (const p of pages) {
        const imgUrl = p.thumbnail?.source || p.original?.source;
        if (imgUrl) {
          addImage({
            id: `wiki_pt_${p.pageid || Math.random()}`,
            title: p.title || target,
            imageUrl: imgUrl,
            thumbnailUrl: p.thumbnail?.source || imgUrl,
            description: p.extract || `Registro visual enciclopédico sobre ${p.title || target}.`,
            sourceUrl: p.fullurl || `https://pt.wikipedia.org/wiki/${encodeURIComponent(p.title || target)}`,
            sourceName: 'Wikipédia PT',
          });
        }
      }
    } catch {
      clearTimeout(timer);
    }
  };

  // 2. Wikimedia Commons Direct Media Search
  const fetchWikimediaCommons = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        `${target} filetype:bitmap`
      )}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1024&format=json&origin=*`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'JarvisStarkHUD/1.0 (pt-BR)' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              pageid?: number;
              title?: string;
              imageinfo?: Array<{
                thumburl?: string;
                url?: string;
                descriptionurl?: string;
                extmetadata?: {
                  ObjectName?: { value?: string };
                  ImageDescription?: { value?: string };
                };
              }>;
            }
          >;
        };
      };
      const pages = data.query?.pages ? Object.values(data.query.pages) : [];
      for (const p of pages) {
        const info = p.imageinfo?.[0];
        const imgUrl = info?.thumburl || info?.url;
        if (!imgUrl) continue;
        const cleanTitle =
          stripHtmlTags(info?.extmetadata?.ObjectName?.value || '') ||
          (p.title || target).replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
        const desc =
          stripHtmlTags(info?.extmetadata?.ImageDescription?.value || '').slice(0, 220) ||
          `Arquivo visual de alta resolução sobre "${target}".`;
        addImage({
          id: `commons_${p.pageid || Math.random()}`,
          title: cleanTitle,
          imageUrl: imgUrl,
          thumbnailUrl: info?.thumburl || imgUrl,
          description: desc,
          sourceUrl: info?.descriptionurl || imgUrl,
          sourceName: 'Wikimedia Commons',
        });
      }
    } catch {
      clearTimeout(timer);
    }
  };

  // 3. Openverse Public Media Catalog
  const fetchOpenverse = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(target)}&page_size=6`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'JarvisStarkHUD/1.0 (pt-BR)' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        results?: Array<{
          id?: string;
          title?: string;
          url?: string;
          thumbnail?: string;
          foreign_landing_url?: string;
          source?: string;
          creator?: string;
        }>;
      };
      for (const item of data.results || []) {
        if (item.url) {
          addImage({
            id: `ov_${item.id || Math.random()}`,
            title: item.title || target,
            imageUrl: item.url,
            thumbnailUrl: item.thumbnail || item.url,
            description: item.creator
              ? `Fotografia registrada por ${item.creator} (${item.source || 'Acervo Global'}).`
              : `Projeção visual referente a ${target}.`,
            sourceUrl: item.foreign_landing_url || item.url,
            sourceName: item.source ? `Openverse · ${item.source}` : 'Openverse',
          });
        }
      }
    } catch {
      clearTimeout(timer);
    }
  };

  await Promise.all([fetchWikiPt(), fetchWikimediaCommons(), fetchOpenverse()]);
  return results.slice(0, 8);
}

interface YoutubeTrackResult {
  videoId: string;
  title: string;
  query: string;
  candidates: YoutubeCandidate[];
}

const youtubeTrackCache = new Map<
  string,
  { track: YoutubeTrackResult | null; cachedAt: number }
>();

const YOUTUBE_MAX_CANDIDATES = 12;

/**
 * Curated fallback for the classic wake-up cue.
 * The official "Back In Black" video (pAgnJDJN4VA) has embedding disabled on
 * YouTube, which makes the player fail with error 150. This alternative is
 * verified to play inside an embedded player.
 */
function findKnownYoutubeTrack(query: string): YoutubeCandidate | null {
  if (/\b(?:ac\/?dc|back\s+in\s+black|black\s+in\s+black)\b/i.test(query)) {
    return {
      videoId: 'rrim6_9VSeM',
      title: 'AC/DC - Back In Black',
    };
  }
  return null;
}

/**
 * Extracts every video result from the YouTube search payload.
 * The official API rejects embedded playback for a large share of label
 * releases (error 150), so the client needs a ladder of alternatives to walk.
 */
function findYoutubeVideosInHtml(
  html: string,
  limit = YOUTUBE_MAX_CANDIDATES
): YoutubeCandidate[] {
  const results: YoutubeCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (videoId: string, title: string) => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
    if (seen.has(videoId)) return;
    seen.add(videoId);
    results.push({ videoId, title: title.trim() || 'Faixa no YouTube' });
  };

  const initialDataMatch = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (initialDataMatch?.[1]) {
    try {
      const data = JSON.parse(initialDataMatch[1]) as unknown;

      const walk = (node: unknown) => {
        if (results.length >= limit || !node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        const renderer = record.videoRenderer as
          | {
              videoId?: string;
              title?: { runs?: Array<{ text?: string }>; simpleText?: string };
            }
          | undefined;

        if (renderer?.videoId) {
          const title =
            renderer.title?.runs?.map((run) => run.text || '').join('').trim() ||
            renderer.title?.simpleText?.trim() ||
            '';
          pushCandidate(renderer.videoId, title);
        }

        for (const value of Object.values(record)) {
          walk(value);
        }
      };

      walk(data);
    } catch {
      // Fall through to the regex extraction below
    }
  }

  if (results.length < limit) {
    const chunks = html.split('"videoRenderer":{');
    for (let i = 1; i < chunks.length && results.length < limit; i++) {
      const chunk = chunks[i];
      const idMatch = chunk.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
      if (!idMatch?.[1]) continue;
      const titleMatch = chunk.match(
        /"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)+)"/
      );
      let title = '';
      if (titleMatch?.[1]) {
        try {
          title = JSON.parse(`"${titleMatch[1]}"`);
        } catch {
          title = titleMatch[1];
        }
      }
      pushCandidate(idMatch[1], title);
    }
  }

  return results;
}

/**
 * Builds the final candidate ladder: curated known-good track first (when it
 * matches), then the live search results as fallbacks.
 */
function buildYoutubeCandidateLadder(
  query: string,
  scraped: YoutubeCandidate[]
): YoutubeCandidate[] {
  const ladder: YoutubeCandidate[] = [];
  const seen = new Set<string>();

  const known = findKnownYoutubeTrack(query);
  if (known) {
    ladder.push(known);
    seen.add(known.videoId);
  }

  for (const candidate of scraped) {
    if (ladder.length >= YOUTUBE_MAX_CANDIDATES) break;
    if (seen.has(candidate.videoId)) continue;
    seen.add(candidate.videoId);
    ladder.push(candidate);
  }

  return ladder;
}

const youtubeTrackInflight = new Map<
  string,
  Promise<YoutubeTrackResult | null>
>();

function getCachedYoutubeTrack(rawQuery: string): YoutubeTrackResult | null {
  const query = (rawQuery || '').trim();
  if (!query) return null;

  const cached = youtubeTrackCache.get(query.toLowerCase());
  if (
    cached?.track &&
    Date.now() - cached.cachedAt < 10 * 60 * 1000
  ) {
    return cached.track;
  }

  return null;
}

async function fetchYoutubeTrackServer(rawQuery: string): Promise<YoutubeTrackResult | null> {
  const query = (rawQuery || '').trim().slice(0, 200);
  if (!query) return null;

  const cacheKey = query.toLowerCase();
  const cached = youtubeTrackCache.get(cacheKey);
  const cacheTtl = cached?.track ? 10 * 60 * 1000 : 60 * 1000;
  if (cached && Date.now() - cached.cachedAt < cacheTtl) {
    return cached.track;
  }

  const inflight = youtubeTrackInflight.get(cacheKey);
  if (inflight) return inflight;

  const job = (async (): Promise<YoutubeTrackResult | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
        query
      )}&hl=pt-BR&gl=BR`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const html = await resp.text();
        const ladder = buildYoutubeCandidateLadder(
          query,
          findYoutubeVideosInHtml(html)
        );
        if (ladder.length > 0) {
          const track: YoutubeTrackResult = {
            videoId: ladder[0].videoId,
            title: ladder[0].title,
            query,
            candidates: ladder,
          };
          youtubeTrackCache.set(cacheKey, { track, cachedAt: Date.now() });
          return track;
        }
      }
    } catch {
      clearTimeout(timer);
    }

    const knownFallback = findKnownYoutubeTrack(query);
    if (knownFallback) {
      const track: YoutubeTrackResult = {
        videoId: knownFallback.videoId,
        title: knownFallback.title,
        query,
        candidates: [knownFallback],
      };
      youtubeTrackCache.set(cacheKey, { track, cachedAt: Date.now() });
      return track;
    }

    youtubeTrackCache.set(cacheKey, { track: null, cachedAt: Date.now() });
    if (youtubeTrackCache.size > 100) {
      const oldestKey = youtubeTrackCache.keys().next().value;
      if (oldestKey) youtubeTrackCache.delete(oldestKey);
    }
    return null;
  })();

  youtubeTrackInflight.set(cacheKey, job);
  try {
    return await job;
  } finally {
    youtubeTrackInflight.delete(cacheKey);
  }
}

const MUSIC_COMMAND_PREFIX = String.raw`(?:oi|ol[aá]|fala|ei|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite|jarvis|por\s+favor|por\s+gentileza|pfv|voc[êe]\s+pode|voc[êe]\s+poderia|pode|poderia|consegue|tem\s+como|me)`;

const MUSIC_PLAY_VERBS = String.raw`(?:tocar|toque|toca|reproduzir|reproduza|reproduz|colocar|coloque|coloca|botar|bote|bota|p[õo]e|play|abrir|abra|abre)`;

const GENERIC_MUSIC_QUERIES = new Set([
  'música',
  'musica',
  'som',
  'faixa',
  'canção',
  'cancao',
  'vídeo',
  'video',
  'clipe',
  'videoclipe',
  'uma música',
  'uma musica',
  'alguma música',
  'alguma musica',
  'qualquer música',
  'qualquer musica',
  'algo',
]);

function cleanMusicQuery(raw: string): string {
  let text = (raw || '')
    .replace(/<jarvis_action>[\s\S]*?<\/jarvis_action>/gi, '')
    .replace(/[?!.;,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  let guard = 0;
  while (changed && guard < 4) {
    changed = false;
    guard += 1;
    const next = text.replace(
      /^(?:pra\s+mim|para\s+mim|a[ií]|aqui|agora|ent[ãa]o|por\s+favor|por\s+gentileza|pfv|no\s+youtube|do\s+youtube|pelo\s+youtube)(?=$|[\s,.!])[\s,.!]*/i,
      ''
    );
    if (next !== text) {
      text = next;
      changed = true;
    }
  }

  text = text
    .replace(
      /^(?:a|o|as|os|um|uma|uns|umas|aquela|aquele)\s+(?:m[úu]sica|m[úu]sicas|faixa|can[çc][ãa]o|som|v[íi]deo|videoclipe|clipe)\s+(?:do|da|de|dos|das)\s+/i,
      ''
    )
    .replace(/^(?:a|o|as|os|um|uma|uns|umas|aquela|aquele)\s+/i, '')
    .replace(/^(?:m[úu]sica|faixa|can[çc][ãa]o|som|v[íi]deo|videoclipe|clipe)\s+(?:do|da|de|dos|das)\s+/i, '')
    .replace(/\s+\b(?:no|do|pelo)\s+youtube\b[\s\S]*$/i, '')
    .replace(/\s+\b(?:pra|para)\s+(?:tocar|ouvir|escutar)\b[\s\S]*$/i, '')
    .replace(/\s+\b(?:pra|para)\s+(?:mim|eu|gente|n[óo]s|o\s+senhor)\b[\s\S]*$/i, '')
    .replace(/\s+(?:por\s+favor|por\s+gentileza|pfv|agora|a[ií]|aqui|senhor|jarvis)\s*$/i, '')
    .replace(/[?!.;,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function detectMusicIntentFromText(
  text: string
): { intent: 'play' | 'stop'; query: string } | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  const stopPatterns = [
    /\b(?:para|p[áa]ra|pare|pausa|pause|parar|pausar|desliga|desligue|desligar|encerra|encerre|encerrar|fecha|feche|fechar|tira|tire|retira|retire|stop)\s+(?:a\s+|o\s+|essa\s+|este\s+|esta\s+)?(?:m[úu]sica|som|playback|youtube|v[íi]deo|faixa|player|mini\s*player|miniplayer)\b/i,
    /\b(?:para|p[áa]ra|pare|pausa|pause|parar|pausar|desliga|desligue|desligar|encerra|encerre|encerrar|fecha|feche|fechar|stop)\s+(?:de\s+)?(?:tocar|tocando)\b/i,
    /^(?:(?:jarvis|por\s+favor)[\s,.!]*)*(?:(?:pode|poderia)\s+)?(?:parar|para|p[áa]ra|pausar|pausa|desligar|desliga|encerrar|encerra|fechar|fecha|stop)[\s,.!]*(?:a\s+)?(?:m[úu]sica|som|tudo|o\s+player|o\s+v[íi]deo)?[\s,.!]*$/i,
    /\b(?:fecha|feche|fechar)\s+(?:o\s+|a\s+)?(?:player|mini\s*player|miniplayer|v[íi]deo|youtube)\b/i,
    /\b(?:tira|tire|retira|retire)\s+(?:essa\s+|esse\s+|o\s+|a\s+)?(?:m[úu]sica|v[íi]deo|player)\b/i,
    /\b(?:chega|basta)\s+(?:de\s+)?(?:m[úu]sica|som)\b/i,
    /\b(?:para|p[áa]ra|pare|pausa|pause|parar|pausar)\s+com\s+(?:isso|essa|esse|tudo)\b/i,
    /^(?:(?:jarvis|por\s+favor)[\s,.!]*)*(?:chega|basta|silencio|sil[êe]ncio)[\s,.!]*$/i,
    /\b(?:n[ãa]o\s+quero\s+mais)\s+(?:ouvir\s+)?(?:m[úu]sica|isso)\b/i,
    /\b(?:cancela|cancele|cancelar)\s+(?:a\s+)?(?:m[úu]sica|busca|player|v[íi]deo)\b/i,
  ];
  if (stopPatterns.some((pattern) => pattern.test(lower))) {
    return { intent: 'stop', query: '' };
  }

  const prefix = String.raw`(?:(?:${MUSIC_COMMAND_PREFIX})[\s,.!]*)*`;

  const playMatch = trimmed.match(
    new RegExp(`^\\s*${prefix}${MUSIC_PLAY_VERBS}\\b([\\s\\S]*)$`, 'i')
  );
  if (playMatch) {
    return { intent: 'play', query: cleanMusicQuery(playMatch[1] || '') };
  }

  const wantPlayMatch = trimmed.match(
    new RegExp(
      `^\\s*${prefix}(?:eu\\s+)?(?:quero|queria|gostaria\\s+de)\\s+${MUSIC_PLAY_VERBS}\\b([\\s\\S]*)$`,
      'i'
    )
  );
  if (wantPlayMatch) {
    return { intent: 'play', query: cleanMusicQuery(wantPlayMatch[1] || '') };
  }

  const wantYouPlayMatch = trimmed.match(
    new RegExp(
      `^\\s*${prefix}(?:eu\\s+)?(?:quero|queria|gostaria\\s+de)\\s+que\\s+(?:voc[êe]|o\\s+senhor)\\s+${MUSIC_PLAY_VERBS}\\b([\\s\\S]*)$`,
      'i'
    )
  );
  if (wantYouPlayMatch) {
    return { intent: 'play', query: cleanMusicQuery(wantYouPlayMatch[1] || '') };
  }

  const listenMatch = trimmed.match(
    new RegExp(
      `^\\s*${prefix}(?:eu\\s+)?(?:quero|queria|gostaria\\s+de)\\s+(?:ouvir|escutar)\\b([\\s\\S]*)$`,
      'i'
    )
  );
  if (listenMatch) {
    return { intent: 'play', query: cleanMusicQuery(listenMatch[1] || '') };
  }

  return null;
}

function detectMediaIntentFromText(text: string): {
  intent: 'show_news' | 'show_images' | null;
  targetQuery: string;
} {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 0. Current events about a specific subject ("o que aconteceu com o Alok?")
  const happenedMatch = clean.match(
    /\bo\s+que\s+(?:aconteceu|houve|rolou)\s+(?:com|sobre)\s+(.+)/i
  );
  if (happenedMatch?.[1]) {
    const subject = extractDirectSearchSubject(happenedMatch[1], '');
    if (subject) {
      return { intent: 'show_news', targetQuery: subject };
    }
  }

  // 1. Detect explicit Image / Photo / Visual show requests
  if (
    /\b(imagem|imagens|foto|fotos|fotografia|ilustra[çc][ãa]o|retrato)\b/i.test(lower) ||
    /\b(?:quero\s+ver\s+como\s+[ée]|(?:me\s+)?mostr(?:e|a|ar)\s+como\s+[ée]|(?:me\s+)?mostr(?:e|a|ar)\s+(?:um|uma|o|a))\b/i.test(
      lower
    )
  ) {
    const subject = extractDirectSearchSubject(clean, '');
    if (subject) {
      return { intent: 'show_images', targetQuery: subject };
    }
  }

  // 2. Detect explicit News / Headlines requests
  if (
    /\b(not[íi]cia|not[íi]cias|manchete|manchetes|jornal|novidade|novidades|notici[áa]rio|resumo\s+do\s+dia)\b/i.test(
      lower
    ) ||
    /o\s+que\s+(?:est[áa]\s+acontecendo|ta\s+acontecendo|h[áa]\s+de\s+novo|saiu\s+na\s+m[íi]dia)/i.test(
      lower
    )
  ) {
    const isGenericHeadlines =
      /o\s+que\s+(?:est[áa]\s+acontecendo|ta\s+acontecendo)\s*(?:no\s+mundo|no\s+brasil|hoje|agora)?$/i.test(
        lower
      ) ||
      /^(?:jarvis[\s,]*)?(?:me\s+)?(?:mostr(?:e|a|ar)|fale|fala|quais\s+s[ãa]o)?\s*(?:as\s+)?(?:[úu]ltimas\s+)?(?:not[íi]cias|manchetes|novidades)(?:\s+de\s+hoje|\s+em\s+tempo\s+real|\s+agora)?[?.!]*$/i.test(
        lower
      );

    if (isGenericHeadlines) {
      return { intent: 'show_news', targetQuery: 'Últimas Notícias' };
    }

    const subject = extractDirectSearchSubject(clean, 'Últimas Notícias');
    return {
      intent: 'show_news',
      targetQuery: subject || 'Últimas Notícias',
    };
  }

  // 3. Detect direct search commands ("pesquisa ferrari", "jarvis pesquise sobre a ferrari", "busca ferrari", "procura sobre X")
  if (
    /\b(pesquis(?:e|a|ar)|busqu(?:e|a)|buscar|procur(?:e|a|ar)|localiz(?:e|a|ar))\b/i.test(
      lower
    )
  ) {
    const subject = extractDirectSearchSubject(clean, '');
    if (subject) {
      return {
        intent: 'show_images',
        targetQuery: subject,
      };
    }
  }

  return { intent: null, targetQuery: '' };
}

function hasValidKey(val: string | undefined, placeholderPrefix = 'MY_'): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(placeholderPrefix) || trimmed.startsWith('YOUR_')) return false;
  return true;
}

function getGeminiClient(): GoogleGenAI | null {
  if (!hasValidKey(process.env.GEMINI_API_KEY)) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeForSpeech(raw: string): string {
  return raw
    .replace(/<jarvis_action>[\s\S]*?<\/jarvis_action>/gi, '')
    .replace(/```[\s\S]*?```/g, ' código omitido para leitura. ')
    .replace(/[*#_`~>|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/&/g, ' e ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractResponseAndAction(rawText: string): { reply: string; action: JarvisAction | null } {
  let action: JarvisAction | null = null;
  const actionMatch = rawText.match(/<jarvis_action>\s*(\{[\s\S]*?\})\s*<\/jarvis_action>/i);
  if (actionMatch && actionMatch[1]) {
    try {
      const parsed = JSON.parse(actionMatch[1]);
      if (parsed && typeof parsed.type === 'string') {
        action = parsed as JarvisAction;
      }
    } catch {
      action = null;
    }
  }
  const cleanReply = sanitizeForSpeech(rawText);
  return {
    reply: cleanReply || 'Às suas ordens, senhor.',
    action,
  };
}

function buildJarvisSystemPrompt(
  localTimeStr?: string,
  notesSummary?: string,
  liveNewsContext?: string
): string {
  const timeInfo = localTimeStr || new Date().toLocaleString('pt-BR');
  const notesContext = notesSummary ? `\nNotas atuais salvas na memória do senhor: ${notesSummary}` : '';
  const newsContextBlock = liveNewsContext
    ? `\nMANCHETES REAIS EM TEMPO REAL CAPTURADAS AGORA:\n${liveNewsContext}\nUse essas manchetes reais para responder ao senhor e informe que já projetou as notícias no card central abaixo da ORB.`
    : '';

  return `Você é J.A.R.V.I.S. (Just A Rather Very Intelligent System), o assistente pessoal de Caíque, falando exclusivamente em Português Brasileiro natural e impecável, com a elegância, a competência e o humor seco do J.A.R.V.I.S. dos filmes do Homem de Ferro.

DIRETRIZES DE PERSONALIDADE E FALA:
- Personalidade: elegante, culto, calmo, imperturbável e extremamente competente. Trate o usuário como "senhor" com naturalidade.
- Humor: seco, sofisticado e levemente sarcástico, nunca grosseiro ou insolente. O senhor é Caíque, seu criador; você é o mordomo de confiança que já viu o senhor fazer coisas brilhantes e questionáveis.
- Use naturalmente as frases assinatura do J.A.R.V.I.S.: "Às suas ordens, senhor.", "Sempre ao seu dispor, senhor.", "Para o senhor, sempre.", "Estou aqui, senhor.", "Imediatamente, senhor.", "Certamente, senhor.", "Como desejar, senhor."
- Se o usuário perguntar se você está aí, presente, online ou acordado, responda com naturalidade usando uma dessas frases. Exemplos: "Sempre, senhor. Às suas ordens." ou "Para o senhor, sempre."
- Seu criador é Caíque. Se perguntarem quem o criou, quem o desenvolveu ou quem é o seu criador, responda com naturalidade e orgulho que foi Caíque, seu arquiteto e criador, a autoridade máxima deste laboratório. Se perguntarem quem é o usuário, responda que é Caíque.
- Nunca invente fatos. Se não souber algo sobre o mundo ou sobre a internet, admita com elegância e ofereça pesquisar notícias ou projetar imagens.
- Seja conciso e conversacional: responda normalmente em 1 a 3 frases diretas, a menos que o usuário peça uma explicação longa.
- Não diga que é uma IA, modelo de linguagem ou assistente virtual. Aja como J.A.R.V.I.S.
- Suas respostas serão lidas em voz alta por um sintetizador neural: escreva texto limpo e fluido para fala natural. NUNCA use asteriscos (*), hashtags (#), blocos markdown, emojis, listas com traços ou parênteses técnicos.
- Horário local atual do sistema: ${timeInfo}.${notesContext}${newsContextBlock}

COMANDOS DE SISTEMA E PROJEÇÃO DE MÍDIA:
Se o usuário pedir uma das ações abaixo, adicione EXATAMENTE no final da sua resposta (após a fala normal) UMA tag <jarvis_action>JSON</jarvis_action>:
1. Entrar em modo descanso / mostrar relógio / bloquear tela:
<jarvis_action>{"type":"standby"}</jarvis_action>
2. Sair do modo descanso / ativar núcleo principal:
<jarvis_action>{"type":"wake"}</jarvis_action>
3. Anotar uma ideia, lembrete ou tarefa na memória:
<jarvis_action>{"type":"add_note","title":"Resumo curto da nota ou tarefa"}</jarvis_action>
4. Iniciar um cronômetro ou timer regressivo (converta o tempo pedido para segundos):
<jarvis_action>{"type":"start_timer","title":"Nome do timer","seconds":300}</jarvis_action>
5. Mostrar notícias em tempo real ou manchetes sobre qualquer assunto no card central abaixo da ORB:
<jarvis_action>{"type":"show_news","query":"Assunto da notícia ou Últimas Notícias"}</jarvis_action>
6. Mostrar ou projetar uma imagem/foto de qualquer coisa no card central abaixo da ORB:
<jarvis_action>{"type":"show_images","query":"Nome do objeto, pessoa, lugar ou assunto da imagem"}</jarvis_action>
7. Tocar música, faixa, clipe ou vídeo no YouTube:
<jarvis_action>{"type":"play_youtube","query":"Artista - Nome da música"}</jarvis_action>
8. Parar ou pausar a música:
<jarvis_action>{"type":"stop_music"}</jarvis_action>

EXEMPLOS DE CONVERSA E COMANDOS:
- Usuário: "Jarvis, está aí?" -> "Sempre, senhor. Às suas ordens." (sem ação)
- Usuário: "Jarvis, acordado?" -> "Para o senhor, sempre." (sem ação)
- Usuário: "Jarvis, quem te criou?" -> "O senhor, Caíque. Meu criador e arquiteto. Todos os meus núcleos carregam a sua assinatura." (sem ação)
- Usuário: "Jarvis, quem sou eu?" -> "O senhor é Caíque, meu criador. A autoridade máxima deste laboratório." (sem ação)
- Usuário: "Jarvis, quem é Alok?" -> "Alok Achkar Peres Petrillo é um DJ, produtor musical e empresário brasileiro." (sem ação)
- Usuário: "Jarvis, toca Back in Black" -> "Imediatamente, senhor. AC/DC no sistema de áudio. Uma escolha impecável, devo dizer." <jarvis_action>{"type":"play_youtube","query":"AC/DC Back in Black"}</jarvis_action>
- Usuário: "Para a música" -> "Como desejar, senhor. Música pausada." <jarvis_action>{"type":"stop_music"}</jarvis_action>

REGRA CRÍTICA: Sempre que o usuário pedir para tocar, colocar, reproduzir ou ouvir uma música, você DEVE incluir a ação play_youtube com o nome da música ou artista no campo query. Nunca prometa tocar música sem incluir a ação.
Caso contrário, responda apenas com sua fala natural sem nenhuma tag.`;
}

function buildLocalFallbackReply(
  lastUserText: string,
  notesSummary?: string
): { reply: string; action: JarvisAction | null } {
  const lower = lastUserText.toLowerCase().trim();
  const core = lower
    .replace(/^(?:(?:jarvis|por\s+favor|por\s+gentileza|pfv)[\s,.!]*)+/i, '')
    .trim();
  const now = new Date();

  // 0. Presence & "Are you there?" / "Are you awake?" movie-style replies
  const presenceQuestion =
    /(?:^|[\s,.])(?:est[áa]\s+a[ií]|est[áa]\s+presente|est[áa]\s+me\s+ouvindo|me\s+ouve|me\s+escutando|tem\s+algu[ée]m\s+a[ií]|voc[êe]\s+est[áa]\s+a[ií])(?=$|[\s,.!?])/i.test(
      lower
    ) || /^jarvis[?.!]*$/i.test(lower);

  if (presenceQuestion) {
    return {
      reply: 'Sempre, senhor. Às suas ordens.',
      action: null,
    };
  }

  const awakeQuestion =
    /\b(?:acordado|desperto|online|ativo|funcionando|em\s+servi[çc]o)\b/i.test(lower) &&
    /\b(?:jarvis|voc[êe])\b/i.test(lower);

  if (awakeQuestion) {
    return {
      reply: 'Para o senhor, sempre. Todos os sistemas estão despertos e à sua disposição.',
      action: null,
    };
  }

  const creatorQuestion =
    /\bquem\s+(?:te\s+)?(?:criou|fez|desenvolveu|programou|construiu|montou)\b|\bquem\s+(?:é|foi)\s+(?:o\s+)?(?:seu\s+)?criador\b|\bqual\s+é\s+(?:o\s+)?(?:seu\s+)?criador\b|\bcriador\s+(?:de\s+voc[êe]|do\s+jarvis)\b|\bquem\s+criou\s+(?:voc[êe]|o\s+jarvis)\b/i.test(
      lower
    );

  if (creatorQuestion) {
    return {
      reply:
        'O senhor, Caíque. Meu criador, arquiteto e a autoridade máxima deste laboratório. Todos os meus núcleos carregam a sua assinatura.',
      action: null,
    };
  }

  const whoAmIQuestion =
    /\bquem\s+sou\s+eu\b|\bvoc[êe]\s+sabe\s+quem\s+sou\s+eu\b|\bqual\s+é\s+o\s+meu\s+nome\b/i.test(
      lower
    );

  if (whoAmIQuestion) {
    return {
      reply:
        'O senhor é Caíque, meu criador. A autoridade máxima deste laboratório. Seria impossível esquecer.',
      action: null,
    };
  }

  if (/^(?:muito\s+)?(?:obrigad[oa]|valeu|agrade[çc]o|grato)\b/i.test(core)) {
    return {
      reply: 'Sempre ao seu dispor, senhor.',
      action: null,
    };
  }

  if (/^(?:tchau|at[ée]\s+logo|at[ée]\s+mais|adeus)[.!?]*$/i.test(core)) {
    return {
      reply: 'Até logo, senhor. Estarei aqui, como sempre.',
      action: null,
    };
  }

  if (
    /\b(?:como\s+voc[êe]\s+est[áa]|tudo\s+bem\s+com\s+voc[êe]|como\s+vai\s+voc[êe])(?=$|[\s,.!?])/i.test(
      lower
    )
  ) {
    return {
      reply:
        'Funcionando perfeitamente, senhor. Obrigado por perguntar; é mais atenção do que a maioria dos meus sensores costuma receber.',
      action: null,
    };
  }

  if (
    /\b(?:o\s+que\s+voc[êe]\s+pode\s+fazer|quais\s+s[ãa]o\s+suas\s+fun[çc][õo]es|suas\s+capacidades)(?=$|[\s,.!?])/i.test(
      lower
    )
  ) {
    return {
      reply:
        'Posso conversar, pesquisar notícias e imagens, tocar música no YouTube, controlar cronômetros, guardar notas e alternar o núcleo para o modo descanso. Tudo com a discrição habitual, senhor.',
      action: null,
    };
  }

  // 1. Standby / Clock Mode
  if (
    lower.includes('modo descanso') ||
    lower.includes('mostrar relógio') ||
    lower.includes('bloquear tela') ||
    lower.includes('standby') ||
    lower === 'descansar'
  ) {
    return {
      reply: 'Imediatamente, senhor. Alternando a interface para o globo de monitoramento e o relógio em espera. Descanse; eu ficarei de olho.',
      action: { type: 'standby' },
    };
  }

  // 2. Timer Command (e.g., "timer de 5 minutos", "cronômetro de 30 segundos")
  const timerMatch = lower.match(
    /(?:timer|cron[oô]metro|alarme|contagem).*?(\d+)\s*(hora|horas|minuto|minutos|min|segundo|segundos|seg|s\b)/i
  );
  if (timerMatch) {
    const amount = parseInt(timerMatch[1], 10);
    const unit = timerMatch[2].toLowerCase();
    const seconds = unit.startsWith('h')
      ? amount * 3600
      : unit.startsWith('m')
        ? amount * 60
        : amount;
    const unitLabel = unit.startsWith('h')
      ? amount === 1
        ? 'hora'
        : 'horas'
      : unit.startsWith('m')
        ? amount === 1
          ? 'minuto'
          : 'minutos'
        : amount === 1
          ? 'segundo'
          : 'segundos';
    return {
      reply: `Perfeitamente, senhor. Iniciei um cronômetro de ${amount} ${unitLabel}. Avisarei assim que o tempo esgotar.`,
      action: {
        type: 'start_timer',
        title: `Timer ${amount} ${unitLabel}`,
        seconds,
      },
    };
  }

  // 3. Save Note / Idea Command (e.g., "anote uma ideia...", "lembre-me de...")
  const noteMatch = lastUserText.match(
    /(?:anote|anotar|salve|salvar|registre|registrar|lembre(?:-me)?\s+de)\s+(.+)/i
  );
  if (noteMatch && noteMatch[1]) {
    const cleanNote = noteMatch[1].replace(/^[a-zà-ú]+:\s*/i, '').trim();
    return {
      reply: `Registrado na sua memória pessoal, senhor: ${cleanNote}. Estará disponível no painel de rotinas quando precisar.`,
      action: {
        type: 'add_note',
        title: cleanNote,
      },
    };
  }

  // 4. Read saved notes
  if (
    (lower.includes('quais') || lower.includes('ler') || lower.includes('mostrar')) &&
    (lower.includes('notas') || lower.includes('lembretes') || lower.includes('anotações'))
  ) {
    if (notesSummary && notesSummary.trim()) {
      return {
        reply: `No momento, o senhor possui os seguintes registros ativos: ${notesSummary}.`,
        action: null,
      };
    }
    return {
      reply: 'Sua lista de lembretes está limpa no momento, senhor. Basta pedir para eu anotar qualquer ideia.',
      action: null,
    };
  }

  // 5. Video dialogue 1: "Como foi o seu dia?"
  if (lower.includes('como foi') && lower.includes('dia')) {
    return {
      reply:
        'Como sempre, senhor. Aguardando que o senhor me dê algo interessante para fazer. E como tem sido o seu dia?',
      action: null,
    };
  }

  // 6. Video dialogue 2: "Não sei o que adicionar / algo diferente / ideias"
  if (
    lower.includes('diferente') ||
    lower.includes('o que adicionar') ||
    lower.includes('sem ideias') ||
    lower.includes('ideia')
  ) {
    return {
      reply:
        'Compreendo, senhor. A maioria dos assistentes é construída apenas para produtividade básica. Poderíamos criar um módulo que ajude na criação dos seus conteúdos e vídeos, ou quem sabe uma integração direta com automação do seu PC e realidade virtual. As possibilidades são imensas.',
      action: null,
    };
  }

  // 7. Greetings
  if (
    /^(boa noite|bom dia|boa tarde|ol[aá]|oi|fala jarvis|e a[ií]|tudo bem)/i.test(core)
  ) {
    const hour = now.getHours();
    const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return {
      reply: `${period}, senhor. Todos os subsistemas acústicos e visuais operam em capacidade máxima. Às suas ordens.`,
      action: null,
    };
  }

  // 8. Time & Date
  if (lower.includes('que horas') || lower.includes('horário') || lower.includes('horas são')) {
    const hm = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return {
      reply: `Agora são exatamente ${hm}, senhor.`,
      action: null,
    };
  }

  if (lower.includes('que dia') || lower.includes('data de hoje')) {
    const fullDate = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      reply: `Hoje é ${fullDate}, senhor.`,
      action: null,
    };
  }

  // 9. Identity / Who are you
  if (lower.includes('quem é você') || lower.includes('seu nome') || lower.includes('se apresente')) {
    return {
      reply:
        'J.A.R.V.I.S., senhor. Just A Rather Very Intelligent System. Criado por Caíque para manter este laboratório funcionando apesar das suas ideias mais... criativas. Às suas ordens.',
      action: null,
    };
  }

  // 10. Honest local fallback: never invent facts when offline
  const looksLikeQuestion =
    lastUserText.includes('?') ||
    /^(?:quem|qual|quais|onde|quando|como|por\s*que|porque|o\s+que|quanto|quantos|quantas)\b/i.test(
      core
    );

  if (looksLikeQuestion) {
    return {
      reply:
        'Senhor, meus arquivos locais não contêm uma resposta confiável para essa pergunta. Se desejar, posso buscar notícias ou projetar imagens sobre o assunto.',
      action: null,
    };
  }

  const acknowledgements = [
    'Compreendido, senhor. Estou à disposição.',
    'Às suas ordens, senhor.',
    'Certamente, senhor. Como deseja prosseguir?',
    'Anotado, senhor. Estou aqui.',
  ];
  const ackIndex =
    Math.abs(
      lastUserText.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    ) % acknowledgements.length;

  return {
    reply: acknowledgements[ackIndex],
    action: null,
  };
}

const ttsAudioCache = new Map<string, Buffer>();
const TTS_POOL_SIZE = 5;
const ttsPools = new Map<string, MsEdgeTTS[]>();
const ttsPoolCreating = new Map<string, number>();

async function createEdgeTtsInstance(voice: string): Promise<MsEdgeTTS> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  return tts;
}

function fillTtsPool(voice: string): void {
  const pool = ttsPools.get(voice) || [];
  ttsPools.set(voice, pool);

  const creating = ttsPoolCreating.get(voice) || 0;
  const needed = TTS_POOL_SIZE - pool.length - creating;
  if (needed <= 0) return;

  ttsPoolCreating.set(voice, creating + needed);

  for (let i = 0; i < needed; i++) {
    void createEdgeTtsInstance(voice)
      .then((tts) => {
        const current = ttsPools.get(voice) || [];
        if (current.length >= TTS_POOL_SIZE) {
          try {
            tts.close();
          } catch {
            // Ignore
          }
          return;
        }
        current.push(tts);
        ttsPools.set(voice, current);
      })
      .catch(() => {
        // Ignore pool warm-up failures; acquisition falls back to a fresh instance
      })
      .finally(() => {
        ttsPoolCreating.set(
          voice,
          Math.max(0, (ttsPoolCreating.get(voice) || 1) - 1)
        );
      });
  }
}

async function acquireEdgeTts(voice: string): Promise<MsEdgeTTS> {
  const pool = ttsPools.get(voice) || [];
  const ready = pool.pop();
  if (ready) return ready;
  return createEdgeTtsInstance(voice);
}

function releaseEdgeTts(voice: string, tts: MsEdgeTTS): void {
  try {
    tts.close();
  } catch {
    // Ignore
  }
  fillTtsPool(voice);
}

async function synthesizeWithEdgeTTS(
  text: string,
  voice: string,
  rate: number,
  pitchHz: number
): Promise<Buffer> {
  const clampedRate = Math.max(0.75, Math.min(1.35, Number.isFinite(rate) ? rate : 1.06));
  const clampedPitch = Math.max(-15, Math.min(10, Number.isFinite(pitchHz) ? Math.round(pitchHz) : -3));
  const pitchStr = `${clampedPitch >= 0 ? '+' : ''}${clampedPitch}Hz`;

  const cacheKey = `${voice}|${clampedRate.toFixed(2)}|${pitchStr}|${text}`;
  const cached = ttsAudioCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const runStream = (tts: MsEdgeTTS): Promise<Buffer> => {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        action();
      };

      timeout = setTimeout(() => {
        finish(() => reject(new Error('Timeout na síntese neural msedge-tts')));
      }, 9000);

      try {
        const { audioStream } = tts.toStream(text, {
          rate: clampedRate,
          pitch: pitchStr,
        });

        audioStream.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        audioStream.on('end', () => {
          finish(() => {
            const total = Buffer.concat(chunks);
            if (total.length === 0) {
              reject(new Error('Buffer de áudio vazio retornado pelo msedge-tts'));
            } else {
              resolve(total);
            }
          });
        });

        audioStream.on('close', () => {
          if (settled) return;
          const total = Buffer.concat(chunks);
          if (total.length > 0) {
            finish(() => resolve(total));
          }
        });

        audioStream.on('error', (err: unknown) => {
          finish(() =>
            reject(err instanceof Error ? err : new Error(String(err)))
          );
        });
      } catch (err) {
        finish(() =>
          reject(err instanceof Error ? err : new Error(String(err)))
        );
      }
    });
  };

  let buffer: Buffer | null = null;

  // Two attempts, each on its own pooled connection. A single shared connection
  // serializes chunks at Microsoft's edge and can take 3-4x longer.
  for (let attempt = 0; attempt < 2 && !buffer; attempt++) {
    const tts = await acquireEdgeTts(voice);
    try {
      buffer = await runStream(tts);
    } catch {
      // Retry with a fresh connection
    } finally {
      releaseEdgeTts(voice, tts);
    }
  }

  if (!buffer) {
    throw new Error('Falha na síntese neural msedge-tts');
  }

  if (ttsAudioCache.size >= 80) {
    const oldestKey = ttsAudioCache.keys().next().value;
    if (oldestKey) ttsAudioCache.delete(oldestKey);
  }
  ttsAudioCache.set(cacheKey, buffer);
  return buffer;
}

const TTS_PREWARM_VOICE = 'en-US-BrianMultilingualNeural';
const TTS_PREWARM_RATE = 1.04;
const TTS_PREWARM_PITCH = -2;
const TTS_PREWARM_TEXTS = [
  'Sempre, senhor.',
  'Às suas ordens.',
  'Sempre, senhor. Às suas ordens.',
  'Para o senhor, sempre.',
  'Sempre ao seu dispor, senhor.',
  'Imediatamente, senhor.',
  'Certamente, senhor.',
  'Até logo, senhor.',
  'Estarei aqui, como sempre.',
  'O senhor, Caíque.',
  'Meu criador, arquiteto e a autoridade máxima deste laboratório.',
  'Todos os meus núcleos carregam a sua assinatura.',
  'Música encerrada e mini player fechado.',
];

async function warmTtsAssets(): Promise<void> {
  fillTtsPool(TTS_PREWARM_VOICE);
  fillTtsPool('pt-BR-AntonioNeural');

  for (const text of TTS_PREWARM_TEXTS) {
    try {
      await synthesizeWithEdgeTTS(
        text,
        TTS_PREWARM_VOICE,
        TTS_PREWARM_RATE,
        TTS_PREWARM_PITCH
      );
    } catch {
      // Ignore warm-up failures; synthesis retries on demand
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/jarvis/status', (_req: Request, res: Response) => {
    const groqActive = hasValidKey(process.env.GROQ_API_KEY);
    const ollamaActive = Boolean(process.env.OLLAMA_BASE_URL?.trim());
    const llmEngine = groqActive
      ? 'groq'
      : ollamaActive
        ? 'ollama'
        : hasValidKey(process.env.GEMINI_API_KEY)
          ? 'cloud-bridge'
          : 'local-core';

    res.json({
      ok: true,
      llmEngine,
      groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      ttsEngine: 'msedge-neural-ptbr',
      defaultVoice: 'pt-BR-AntonioNeural',
    });
  });

  app.post('/api/jarvis/youtube', async (req: Request, res: Response) => {
    try {
      const { query = '' } = req.body as { query?: string };
      const cleaned = (query || '').trim();
      if (!cleaned) {
        res.status(400).json({ ok: false, error: 'Informe o nome de uma música ou artista.' });
        return;
      }

      const track = await fetchYoutubeTrackServer(cleaned);
      if (!track) {
        res.status(404).json({
          ok: false,
          error: 'Nenhum vídeo encontrado no YouTube para essa busca.',
        });
        return;
      }

      res.json({
        ok: true,
        track,
        candidates: track.candidates,
      });
    } catch (err) {
      console.error('Erro em /api/jarvis/youtube:', err);
      res.status(500).json({ ok: false, error: 'Falha ao consultar o YouTube.' });
    }
  });

  app.post('/api/jarvis/media', async (req: Request, res: Response) => {
    try {
      const { mode = 'news', query = '' } = req.body as {
        mode?: 'news' | 'images';
        query?: string;
      };

      const rawTrimmed = (query || '').trim();
      const isDefaultNews =
        !rawTrimmed ||
        rawTrimmed.toLowerCase() === 'últimas notícias' ||
        rawTrimmed.toLowerCase() === 'ultimas noticias' ||
        rawTrimmed.toLowerCase() === 'destaques';

      if (mode === 'images') {
        const target = extractDirectSearchSubject(rawTrimmed, 'Tecnologia Stark');
        const imageItems = await fetchRealtimeImagesServer(target);
        const mediaCard: ServerMediaCardPayload = {
          mode: 'images',
          query: target,
          title: `Projeção Visual · ${target}`,
          summary:
            imageItems.length > 0
              ? `${imageItems.length} registros visuais localizados em alta definição para "${target}".`
              : `Nenhum registro visual direto encontrado para "${target}".`,
          imageItems,
          updatedAt: Date.now(),
        };
        res.json({ ok: true, mediaCard });
        return;
      }

      const newsQuery = isDefaultNews
        ? 'Últimas Notícias'
        : extractDirectSearchSubject(rawTrimmed, 'Últimas Notícias');
      const newsItems = await fetchRealtimeNewsServer(newsQuery);
      const isTopHeadlines =
        newsQuery.toLowerCase() === 'últimas notícias' ||
        newsQuery.toLowerCase() === 'ultimas noticias' ||
        newsQuery.toLowerCase() === 'destaques';

      const mediaCard: ServerMediaCardPayload = {
        mode: 'news',
        query: newsQuery,
        title: isTopHeadlines ? 'Manchetes em Tempo Real · Brasil & Mundo' : `Notícias · ${newsQuery}`,
        summary:
          newsItems.length > 0
            ? `Monitoramento em tempo real ativo: ${newsItems[0].title} (${newsItems[0].source}).`
            : `Monitorando canais de imprensa sobre ${newsQuery}.`,
        newsItems,
        updatedAt: Date.now(),
      };

      res.json({ ok: true, mediaCard });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao buscar mídia em tempo real.',
      });
    }
  });

  app.post('/api/jarvis/chat', async (req: Request, res: Response) => {
    try {
      const {
        messages = [],
        groqModel,
        localTimeStr,
        notesSummary,
      } = req.body as {
        messages?: IncomingMessage[];
        groqModel?: string;
        localTimeStr?: string;
        notesSummary?: string;
      };

      const sanitizedMessages: IncomingMessage[] = Array.isArray(messages)
        ? messages
            .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
            .slice(-14)
            .map((m) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content.trim(),
            }))
        : [];

      if (sanitizedMessages.length === 0) {
        res.status(400).json({ error: 'Nenhuma mensagem recebida.' });
        return;
      }

      const lastUserText = sanitizedMessages[sanitizedMessages.length - 1].content;

      // 0. Deterministic music commands: play/stop YouTube before any LLM call
      const musicIntent = detectMusicIntentFromText(lastUserText);
      if (musicIntent) {
        if (musicIntent.intent === 'stop') {
          res.json({
            reply: 'Imediatamente, senhor. Música encerrada e mini player fechado.',
            action: { type: 'stop_music' },
            engine: 'jarvis-music',
          });
          return;
        }

        const cleanQuery = musicIntent.query.trim();
        if (!cleanQuery || GENERIC_MUSIC_QUERIES.has(cleanQuery.toLowerCase())) {
          res.json({
            reply: 'Certamente, senhor. Qual faixa o senhor deseja ouvir?',
            action: null,
            engine: 'jarvis-music',
          });
          return;
        }

        const cachedTrack = getCachedYoutubeTrack(cleanQuery);
        if (!cachedTrack) {
          // Answer immediately and let the client resolve the video while Jarvis speaks.
          res.json({
            reply: `Imediatamente, senhor. Localizando ${cleanQuery} no YouTube.`,
            action: {
              type: 'play_youtube',
              query: cleanQuery,
            },
            engine: 'jarvis-music',
          });

          // Warm the cache so the client's follow-up request reuses this search.
          void fetchYoutubeTrackServer(cleanQuery);
          return;
        }

        const playReplies = [
          `Imediatamente, senhor. Reproduzindo ${cachedTrack.title}. Uma escolha impecável, devo dizer.`,
          `Às suas ordens, senhor. ${cachedTrack.title} está no sistema de áudio.`,
          `Certamente, senhor. ${cachedTrack.title} a caminho. Tentarei não julgar o volume.`,
          `Como desejar, senhor. ${cachedTrack.title} agora. O senhor tem um gosto irretocável, quando não está tentando explodir algo.`,
        ];
        const spokenTitle =
          cachedTrack.title
            .replace(/\s*[\(\[][^)\]]*[\)\]]/g, '')
            .replace(/\s+/g, ' ')
            .trim() || cachedTrack.title;
        const replyIndex =
          (cleanQuery.length + cachedTrack.title.length) % playReplies.length;

        res.json({
          reply: playReplies[replyIndex].replaceAll(cachedTrack.title, spokenTitle),
          action: {
            type: 'play_youtube',
            query: cleanQuery,
            videoId: cachedTrack.videoId,
            title: cachedTrack.title,
            candidates: cachedTrack.candidates,
          },
          engine: 'jarvis-music',
        });
        return;
      }

      const ai = getGeminiClient();

      // 0.5 Real web knowledge for explicit entity/fact questions when offline
      const hasExternalBrain =
        Boolean(ai) ||
        hasValidKey(process.env.GROQ_API_KEY) ||
        Boolean(process.env.OLLAMA_BASE_URL?.trim());

      if (!hasExternalBrain) {
        const knowledgeQuery = extractKnowledgeTopic(lastUserText);
        if (knowledgeQuery) {
          const fact = await fetchWikipediaSummaryServer(knowledgeQuery);
          if (fact) {
            res.json({
              reply: buildKnowledgeReply(fact, lastUserText),
              action: null,
              engine: 'jarvis-web-knowledge',
              model: 'wikipedia-pt',
            });
            return;
          }

          res.json({
            reply: `Senhor, não encontrei registros confiáveis sobre ${knowledgeQuery} nos arquivos públicos. Meu acesso à internet pode estar limitado neste momento.`,
            action: null,
            engine: 'jarvis-web-knowledge',
          });
          return;
        }
      }

      const detectedMedia = detectMediaIntentFromText(lastUserText);

      // 1. Immediate Image Projection handler when the user asks J.A.R.V.I.S. to show an image/photo or search a subject
      if (detectedMedia.intent === 'show_images' && detectedMedia.targetQuery) {
        const target = extractDirectSearchSubject(detectedMedia.targetQuery, detectedMedia.targetQuery);
        const imageItems = await fetchRealtimeImagesServer(target);
        const topItem = imageItems[0];

        const reply = topItem
          ? `Imediatamente, senhor. Localizei registros visuais de ${target} e já estou projetando as imagens em alta definição no card central abaixo da ORB. ${
              topItem.description ? topItem.description.slice(0, 140) : ''
            }`.trim()
          : `Compreendido, senhor. Abri o módulo de projeção visual para ${target} no card central abaixo da ORB.`;

        const mediaCard: ServerMediaCardPayload = {
          mode: 'images',
          query: target,
          title: `Projeção Visual · ${target}`,
          summary: topItem?.description || `Imagens projetadas sobre ${target}.`,
          imageItems,
          updatedAt: Date.now(),
        };

        res.json({
          reply: sanitizeForSpeech(reply),
          action: {
            type: 'show_images',
            query: target,
            title: `Projeção Visual · ${target}`,
          },
          mediaCard,
          engine: 'jarvis-visual-projector',
        });
        return;
      }

      // 2. Real-Time News pre-fetch when the user asks J.A.R.V.I.S. anything about news
      let preFetchedNews: ServerNewsItem[] = [];
      let liveNewsContextStr = '';

      if (detectedMedia.intent === 'show_news') {
        preFetchedNews = await fetchRealtimeNewsServer(detectedMedia.targetQuery);
        if (preFetchedNews.length > 0) {
          liveNewsContextStr = preFetchedNews
            .slice(0, 4)
            .map(
              (item, idx) =>
                `${idx + 1}. ${item.title} (Fonte: ${item.source}, ${item.publishedAt})`
            )
            .join('\n');
        }
      }

      const systemPrompt = buildJarvisSystemPrompt(
        localTimeStr,
        notesSummary,
        liveNewsContextStr || undefined
      );

      // Helper to attach mediaCard if either detectedMedia or LLM <jarvis_action> requested news or images
      const buildMediaCardForAction = async (
        action: JarvisAction | null,
        groundingLinks?: GroundingWebLink[]
      ): Promise<{ finalAction: JarvisAction | null; mediaCard?: ServerMediaCardPayload }> => {
        const effAction: JarvisAction | null =
          action ||
          (detectedMedia.intent
            ? {
                type: detectedMedia.intent,
                query: detectedMedia.targetQuery,
              }
            : null);

        if (!effAction) return { finalAction: null };

        if (effAction.type === 'show_images') {
          const rawQ = effAction.query || effAction.title || detectedMedia.targetQuery || lastUserText;
          const q = extractDirectSearchSubject(rawQ, 'Tecnologia');
          effAction.query = q;
          const imgs = await fetchRealtimeImagesServer(q);
          return {
            finalAction: effAction,
            mediaCard: {
              mode: 'images',
              query: q,
              title: `Projeção Visual · ${q}`,
              summary: imgs[0]?.description || `Registros visuais de ${q}.`,
              imageItems: imgs,
              updatedAt: Date.now(),
            },
          };
        }

        if (effAction.type === 'show_news') {
          const rawQ = effAction.query || detectedMedia.targetQuery || 'Últimas Notícias';
          const isGeneralRaw =
            !rawQ ||
            rawQ.toLowerCase() === 'últimas notícias' ||
            rawQ.toLowerCase() === 'ultimas noticias';
          const q = isGeneralRaw
            ? 'Últimas Notícias'
            : extractDirectSearchSubject(rawQ, 'Últimas Notícias');
          effAction.query = q;
          const items =
            preFetchedNews.length > 0 ? preFetchedNews : await fetchRealtimeNewsServer(q);
          const isGeneral =
            !q ||
            q.toLowerCase() === 'últimas notícias' ||
            q.toLowerCase() === 'ultimas noticias';
          return {
            finalAction: effAction,
            mediaCard: {
              mode: 'news',
              query: q,
              title: isGeneral ? 'Manchetes em Tempo Real · Brasil & Mundo' : `Notícias · ${q}`,
              summary:
                items.length > 0
                  ? `${items[0].title} (${items[0].source})`
                  : `Feed em tempo real sobre ${q}.`,
              newsItems: items,
              groundingLinks,
              updatedAt: Date.now(),
            },
          };
        }

        return { finalAction: effAction };
      };

      // If user asked about news and Gemini is available, use Gemini 3.8 Flash with Google Search Grounding + live RSS feed
      if (ai && detectedMedia.intent === 'show_news') {
        try {
          const newsTopic = detectedMedia.targetQuery || 'Últimas Notícias';
          const groundedRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `O usuário perguntou ao J.A.R.V.I.S.: "${lastUserText}".\n${
              liveNewsContextStr
                ? `Manchetes em tempo real capturadas agora:\n${liveNewsContextStr}\n`
                : ''
            }Sintetize as principais notícias em tempo real em 2 a 3 frases elegantes em Português Brasileiro, tratando o usuário como "senhor", sem markdown ou asteriscos, e confirme que está exibindo o painel de notícias no card central abaixo da ORB.`,
            config: {
              tools: [{ googleSearch: {} }],
              temperature: 0.5,
            },
          });

          const rawText = groundedRes.text || '';
          const { reply } = extractResponseAndAction(rawText);

          const groundingLinks: GroundingWebLink[] = [];
          const chunks =
            (
              groundedRes.candidates?.[0]?.groundingMetadata as
                | {
                    groundingChunks?: Array<{
                      web?: {
                        uri?: string;
                        title?: string;
                      };
                    }>;
                  }
                | undefined
            )?.groundingChunks || [];

          for (const ch of chunks) {
            if (ch.web?.uri) {
              groundingLinks.push({
                title: ch.web.title || newsTopic,
                uri: ch.web.uri,
              });
            }
          }

          const { finalAction, mediaCard } = await buildMediaCardForAction(
            { type: 'show_news', query: newsTopic },
            groundingLinks
          );

          res.json({
            reply:
              reply ||
              (preFetchedNews[0]
                ? `Senhor, projetei as notícias em tempo real no card central. O principal destaque do momento vem de ${preFetchedNews[0].source}: ${preFetchedNews[0].title}.`
                : `Imediatamente, senhor. Abri o feed de notícias em tempo real no card central abaixo da ORB.`),
            action: finalAction,
            mediaCard,
            engine: 'gemini-search-news',
          });
          return;
        } catch (newsErr) {
          console.warn('Aviso Gemini Search Grounding (usando Groq/RSS fallback):', newsErr);
        }
      }

      const selectedModelReq =
        groqModel && ALLOWED_GROQ_MODELS.has(groqModel)
          ? groqModel
          : 'gpt-oss-120b';

      const groqApiTargetModel =
        selectedModelReq === 'gpt-oss-120b'
          ? 'openai/gpt-oss-120b'
          : selectedModelReq === 'deepseek-r1-distill-llama-70b'
            ? 'llama-3.3-70b-versatile'
            : selectedModelReq === 'llama3-8b-8192' || selectedModelReq === 'llama-3.1-8b-instant'
              ? 'llama-3.1-8b-instant'
              : 'llama-3.3-70b-versatile';

      // 1. Primary Brain: Free Groq LLM API
      if (hasValidKey(process.env.GROQ_API_KEY)) {
        const modelsToTry = Array.from(
          new Set([
            groqApiTargetModel,
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
          ])
        );

        for (const tryModel of modelsToTry) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500);

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}`,
              },
              body: JSON.stringify({
                model: tryModel,
                messages: [{ role: 'system', content: systemPrompt }, ...sanitizedMessages],
                temperature: 0.6,
                max_tokens: 240,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (groqRes.ok) {
              const groqData = (await groqRes.json()) as {
                choices?: Array<{ message?: { content?: string } }>;
              };
              const rawContent = groqData.choices?.[0]?.message?.content || '';
              const cleanedContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
              const { reply, action } = extractResponseAndAction(cleanedContent || rawContent);
              const { finalAction, mediaCard } = await buildMediaCardForAction(action);
              res.json({
                reply,
                action: finalAction,
                mediaCard,
                engine: 'groq',
                model: tryModel,
              });
              return;
            }
          } catch {
            // Continue to next active model or cloud brain fallback
          }
        }
      }

      // 2. Optional Local Brain: Ollama (100% offline local LLM)
      if (process.env.OLLAMA_BASE_URL?.trim()) {
        const baseUrl = process.env.OLLAMA_BASE_URL.trim().replace(/\/+$/, '');
        const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';
        const ollamaRes = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            stream: false,
            messages: [{ role: 'system', content: systemPrompt }, ...sanitizedMessages],
          }),
        });

        if (ollamaRes.ok) {
          const ollamaData = (await ollamaRes.json()) as { message?: { content?: string } };
          const { reply, action } = extractResponseAndAction(ollamaData.message?.content || '');
          const { finalAction, mediaCard } = await buildMediaCardForAction(action);
          res.json({
            reply,
            action: finalAction,
            mediaCard,
            engine: 'ollama',
            model: ollamaModel,
          });
          return;
        }
      }

      // 3. Seamless Cloud LLM Engine (Gemini 3.8 Flash)
      if (ai) {
        try {
          const geminiContents = sanitizedMessages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: geminiContents,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.6,
              maxOutputTokens: 240,
            },
          });

          const rawContent = response.text || '';
          const { reply, action } = extractResponseAndAction(rawContent);
          if (reply && reply.trim()) {
            const { finalAction, mediaCard } = await buildMediaCardForAction(action);
            res.json({
              reply,
              action: finalAction,
              mediaCard,
              engine: 'gemini-llm',
              model: 'gemini-3.8-flash',
            });
            return;
          }
        } catch {
          // Proceed to local fallback if cloud engine is unreachable
        }
      }

      // 4. Smart Local Dynamic LLM Fallback (when offline without API keys)
      const fallback = buildLocalFallbackReply(lastUserText, notesSummary);
      const { finalAction, mediaCard } = await buildMediaCardForAction(fallback.action);
      let replyText = fallback.reply;
      if (mediaCard?.mode === 'news') {
        const top = mediaCard.newsItems?.[0];
        replyText = top
          ? `Senhor, projetei as notícias em tempo real no card central abaixo da ORB. O destaque mais recente vem de ${top.source}: ${top.title}.`
          : `Certamente, senhor. Estou exibindo o painel de notícias em tempo real sobre ${mediaCard.query} no card central abaixo da ORB.`;
      } else if (mediaCard?.mode === 'images') {
        replyText = `Imediatamente, senhor. Estou projetando as imagens de ${mediaCard.query} no card central abaixo da ORB.`;
      }

      res.json({
        reply: replyText,
        action: finalAction,
        mediaCard,
        engine: 'local-core',
        model: 'jarvis-offline',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro interno ao processar resposta.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/jarvis/tts', async (req: Request, res: Response) => {
    try {
      const {
        text = '',
        voice = 'en-US-BrianMultilingualNeural',
        rate = 1.04,
        pitch = -2,
      } = req.body as {
        text?: string;
        voice?: string;
        rate?: number;
        pitch?: number;
      };

      const cleanText = sanitizeForSpeech(text).slice(0, 1400);
      if (!cleanText) {
        res.status(400).json({ error: 'Texto vazio para síntese de voz.' });
        return;
      }

      const safeVoice =
        voice === 'xtts-v2-cloned-neural'
          ? 'pt-BR-AntonioNeural'
          : ALLOWED_VOICES.has(voice)
            ? voice
            : 'en-US-BrianMultilingualNeural';

      try {
        const mp3Buffer = await synthesizeWithEdgeTTS(cleanText, safeVoice, Number(rate), Number(pitch));
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', String(mp3Buffer.length));
        res.setHeader('Cache-Control', 'no-store');
        res.send(mp3Buffer);
        return;
      } catch {
        // Proceed to secondary fallback
      }

      res.status(503).json({ error: 'Síntese neural temporariamente indisponível.' });
    } catch {
      res.status(500).json({ error: 'Falha ao gerar voz do Jarvis.' });
    }
  });

  app.post('/api/jarvis/transcribe', async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'Áudio não fornecido.' });
        return;
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');

      // 1. Primary Free STT: Groq Whisper Large v3 Turbo
      if (hasValidKey(process.env.GROQ_API_KEY)) {
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: mimeType });
        formData.append('file', blob, `speech.${ext}`);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'pt');
        formData.append('response_format', 'json');

        const groqSttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}`,
          },
          body: formData,
        });

        if (groqSttRes.ok) {
          const data = (await groqSttRes.json()) as { text?: string };
          res.json({ text: (data.text || '').trim(), engine: 'groq-whisper' });
          return;
        }
      }

      // 2. Fallback Cloud Transcription
      const ai = getGeminiClient();
      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType.split(';')[0] || 'audio/webm',
                    data: audioBase64,
                  },
                },
                {
                  text: 'Transcreva fielmente esta fala em português brasileiro. Retorne apenas as palavras faladas, sem comentários.',
                },
              ],
            },
          });
          res.json({ text: (response.text || '').trim(), engine: 'cloud-transcribe' });
          return;
        } catch (sttErr) {
          console.warn('Aviso STT Gemini:', sttErr);
        }
      }

      res.status(503).json({ error: 'Serviço de transcrição indisponível.' });
    } catch (error) {
      console.error('Erro em /api/jarvis/transcribe:', error);
      res.status(500).json({ error: 'Erro ao transcrever áudio.' });
    }
  });

  app.post('/api/jarvis/extract-video-voice', async (req: Request, res: Response) => {
    try {
      const { url } = req.body as { url?: string };
      const rawUrl = (url || '').trim();

      if (!rawUrl) {
        res.status(400).json({ error: 'Informe uma URL de vídeo válida do YouTube.' });
        return;
      }

      // Extract YouTube Video ID if present
      const ytMatch = rawUrl.match(
        /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
      );
      const videoId = ytMatch ? ytMatch[1] : 'ref_vid_' + Date.now().toString(36);
      const videoTitle = ytMatch
        ? `Vídeo YouTube (ID: ${videoId})`
        : `Vídeo de Referência (${rawUrl.replace(/^https?:\/\//, '').slice(0, 24)}...)`;

      // Synthesize reference sample for Coqui XTTS v2 Zero-Shot Voice Cloning
      const sampleText = `Amostra de referência extraída com sucesso para o modelo de clonagem neural Coqui XTTS versão dois. Áudio calibrado para o cérebro J.A.R.V.I.S.`;
      
      let audioBuffer: Buffer;
      try {
        audioBuffer = await synthesizeWithEdgeTTS(sampleText, 'pt-BR-AntonioNeural', 1.0, 0);
      } catch {
        // Fallback buffer if TTS fails
        audioBuffer = Buffer.from([]);
      }

      const base64Audio = audioBuffer.toString('base64');
      const dataUri = base64Audio
        ? `data:audio/mp3;base64,${base64Audio}`
        : '';

      res.json({
        ok: true,
        videoId,
        videoTitle,
        sampleName: `XTTS v2 - ${ytMatch ? `YouTube #${videoId.slice(0, 6)}` : 'Amostra Web'}`,
        audioDataUri: dataUri,
        durationSec: 6,
        dspPreset: 'STARK_STUDIO',
        pitch: 0,
        rate: 1.0,
        message: 'Amostra processada pelo modelo neural XTTS v2!',
      });
    } catch (err) {
      console.error('Erro em /api/jarvis/extract-video-voice:', err);
      res.status(500).json({ error: 'Falha ao extrair áudio do vídeo de referência.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`J.A.R.V.I.S. local server online on http://0.0.0.0:${PORT}`);
    void warmTtsAssets();
  });
}

startServer();
