import React, { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Maximize2,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, Variants } from 'motion/react';
import {
  JarvisImageItem,
  JarvisMediaCardMode,
  JarvisMediaCardPayload,
  JarvisNewsItem,
} from '../types/jarvis';

interface JarvisMediaCardProps {
  open: boolean;
  cardData: JarvisMediaCardPayload;
  loading?: boolean;
  onClose: () => void;
  onChangeMode: (mode: JarvisMediaCardMode) => void;
  onSearchMedia: (mode: JarvisMediaCardMode, query: string) => Promise<void>;
  onSpeakText: (text: string) => void;
}

const NEWS_CATEGORIES = [
  { label: 'Destaques', query: 'Últimas Notícias' },
  { label: 'Tecnologia & IA', query: 'Tecnologia Inteligência Artificial' },
  { label: 'Brasil', query: 'Brasil Notícias' },
  { label: 'Ciência & Espaço', query: 'Ciência Espaço Astronomia' },
  { label: 'Economia', query: 'Economia Mercado Financeiro' },
  { label: 'Esportes', query: 'Futebol Esportes Brasil' },
];

const IMAGE_SUGGESTIONS = [
  'Ferrari',
  'Nebulosa James Webb',
  'Armadura Homem de Ferro',
  'Rio de Janeiro Cristo Redentor',
  'Tóquio Cyberpunk Noite',
];

const FALLBACK_VISUAL_URL =
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=900&q=80';

const cardArrivalVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
    scale: 0.955,
    borderColor: 'rgba(224, 242, 254, 1)',
    boxShadow:
      '0 0 85px rgba(56, 189, 248, 0.98), 0 0 150px rgba(14, 165, 233, 0.78), inset 0 0 44px rgba(56, 189, 248, 0.72)',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    borderColor: [
      'rgba(224, 242, 254, 1)',
      'rgba(56, 189, 248, 0.95)',
      'rgba(56, 189, 248, 0.38)',
    ],
    boxShadow: [
      '0 0 85px rgba(56, 189, 248, 0.98), 0 0 150px rgba(14, 165, 233, 0.78), inset 0 0 44px rgba(56, 189, 248, 0.72)',
      '0 18px 50px rgba(2, 6, 23, 0.94), 0 0 62px rgba(56, 189, 248, 0.78), inset 0 0 26px rgba(56, 189, 248, 0.42)',
      '0 18px 50px rgba(2, 6, 23, 0.94), 0 0 32px rgba(14, 165, 233, 0.24), inset 0 1px 0 rgba(186, 230, 253, 0.25)',
    ],
    transition: {
      duration: 0.55,
      ease: [0.16, 1, 0.3, 1],
      borderColor: { duration: 1.25, times: [0, 0.38, 1], ease: 'easeOut' },
      boxShadow: { duration: 1.25, times: [0, 0.38, 1], ease: 'easeOut' },
      when: 'beforeChildren',
      staggerChildren: 0.085,
      delayChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.97,
    transition: {
      duration: 0.24,
      ease: 'easeInOut',
    },
  },
};

const hudSectionVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 14,
    scale: 0.985,
    filter: 'blur(5px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.42,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.065,
      delayChildren: 0.04,
    },
  },
};

const hudListContainerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.065,
      delayChildren: 0.05,
    },
  },
};

const hudItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
    scale: 0.97,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.36,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const JarvisMediaCard: React.FC<JarvisMediaCardProps> = ({
  open,
  cardData,
  loading = false,
  onClose,
  onChangeMode,
  onSearchMedia,
  onSpeakText,
}) => {
  const [searchInput, setSearchInput] = useState(cardData.query || '');
  const [selectedNewsIndex, setSelectedNewsIndex] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<JarvisImageItem | null>(null);

  useEffect(() => {
    setSearchInput(cardData.query || '');
    setSelectedNewsIndex(0);
    setSelectedImageIndex(0);
  }, [cardData.query, cardData.mode, cardData.updatedAt]);

  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchInput.trim();
      if (!q) return;
      await onSearchMedia(cardData.mode, q);
    },
    [searchInput, cardData.mode, onSearchMedia]
  );

  const newsList: JarvisNewsItem[] = cardData.newsItems || [];
  const activeNews: JarvisNewsItem | undefined =
    newsList[selectedNewsIndex] || newsList[0];

  const imageList: JarvisImageItem[] = cardData.imageItems || [];
  const activeImage: JarvisImageItem | undefined =
    imageList[selectedImageIndex] || imageList[0];

  const handleSpeakNewsBriefing = () => {
    if (newsList.length === 0) {
      onSpeakText('No momento não há manchetes carregadas neste filtro, senhor.');
      return;
    }
    const topThree = newsList
      .slice(0, 3)
      .map((item, i) => `Destaque ${i + 1}, via ${item.source}: ${item.title}`)
      .join('. ');
    onSpeakText(
      `Senhor, aqui estão as principais notícias em tempo real sobre ${
        cardData.query || 'os destaques do momento'
      }. ${topThree}.`
    );
  };

  const handleSpeakSingleNews = (item: JarvisNewsItem) => {
    onSpeakText(
      `Notícia publicada por ${item.source}, ${item.publishedAt}: ${item.title}. ${
        item.snippet || ''
      }`
    );
  };

  const handleSpeakActiveImage = (img: JarvisImageItem) => {
    onSpeakText(
      `Projetando imagem de ${img.title}, senhor. ${
        img.description || 'Registro visual em alta definição.'
      }`
    );
  };

  const staggerKey = `${cardData.mode}-${cardData.query}-${loading ? 'loading' : 'ready'}-${cardData.updatedAt || 0}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          key="jarvis-central-media-card"
          variants={cardArrivalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          aria-label="Card Central de Notícias em Tempo Real e Projeção de Imagens J.A.R.V.I.S."
          className="fixed left-1/2 -translate-x-1/2 top-[39%] sm:top-[40%] bottom-[84px] sm:bottom-[88px] w-[min(850px,95vw)] z-20 flex flex-col rounded-2xl bg-[#050B18]/92 backdrop-blur-2xl border border-sky-400/35 overflow-hidden"
        >
          {/* Intense Stark HUD Border Glow Surge upon arrival or query update */}
          <motion.div
            key={`border-surge-${cardData.mode}-${cardData.query}`}
            aria-hidden="true"
            initial={{ opacity: 0.95 }}
            animate={{ opacity: [0.95, 0.55, 0] }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-sky-200 shadow-[inset_0_0_32px_rgba(56,189,248,0.65),0_0_38px_rgba(56,189,248,0.85)] z-30"
          />

          {/* Top luminous Stark HUD filament */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-sky-300/90 to-transparent z-20"
          />

          {/* Step 1: Staggered Top Header & Mode Switcher Bar */}
          <motion.div
            variants={hudSectionVariants}
            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-sky-400/20 bg-[#071022]/90"
          >
            {/* Mode Tabs: Real-Time News vs Image Projection */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onChangeMode('news');
                  if (!cardData.newsItems || cardData.newsItems.length === 0) {
                    onSearchMedia('news', 'Últimas Notícias');
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium tracking-wide transition-all cursor-pointer ${
                  cardData.mode === 'news'
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/45 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                    : 'text-slate-400 hover:text-sky-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5 text-sky-300" />
                <span>Notícias em Tempo Real</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onChangeMode('images');
                  if (!cardData.imageItems || cardData.imageItems.length === 0) {
                    const defaultImgQuery =
                      cardData.query &&
                      cardData.query.toLowerCase() !== 'últimas notícias' &&
                      cardData.query.toLowerCase() !== 'ultimas noticias'
                        ? cardData.query
                        : 'Ferrari';
                    onSearchMedia('images', defaultImgQuery);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium tracking-wide transition-all cursor-pointer ${
                  cardData.mode === 'images'
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/45 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                    : 'text-slate-400 hover:text-sky-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 text-sky-300" />
                <span>Projeção de Imagens</span>
              </button>
            </div>

            {/* Search Input + Refresh + Close Button */}
            <div className="flex items-center gap-2 flex-1 justify-end min-w-[230px]">
              <form onSubmit={handleFormSubmit} className="relative flex-1 max-w-[290px]">
                <Search className="w-3.5 h-3.5 text-sky-400/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={
                    cardData.mode === 'news'
                      ? 'Assunto direto (ex: IA, Brasil)...'
                      : 'Assunto direto (ex: Ferrari)...'
                  }
                  className="w-full pl-8 pr-14 py-1 rounded-lg bg-[#040914]/90 border border-sky-400/25 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 text-[10px] font-medium text-sky-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? '...' : 'Buscar'}
                </button>
              </form>

              <button
                type="button"
                onClick={() =>
                  onSearchMedia(
                    cardData.mode,
                    searchInput.trim() ||
                      cardData.query ||
                      (cardData.mode === 'news' ? 'Últimas Notícias' : 'Ferrari')
                  )
                }
                title="Atualizar dados em tempo real"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border bg-sky-500/15 border-sky-400/35 text-sky-200 hover:bg-sky-500/25 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-sky-300' : ''}`} />
                <span className="hidden md:inline">Ao Vivo</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                title="Recolher card central"
                aria-label="Fechar card central"
                className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-sky-500/20 border border-white/[0.06] hover:border-sky-400/35 text-slate-400 hover:text-sky-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>

          {/* Animated laser progress bar under header while Jarvis is fetching news or images */}
          {loading && (
            <div
              aria-hidden="true"
              className="relative w-full h-0.5 bg-sky-950/70 overflow-hidden shrink-0"
            >
              <div className="w-2/5 h-full bg-gradient-to-r from-transparent via-sky-300 to-transparent shadow-[0_0_12px_rgba(56,189,248,0.95)] animate-hud-bar" />
            </div>
          )}

          {/* Step 2 & 3: Staggered Main Split Content Area */}
          <motion.div
            key={staggerKey}
            variants={hudSectionVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden"
          >
            {cardData.mode === 'news' ? (
              <>
                {/* Left Side: Featured Breaking News Spotlight */}
                <motion.div
                  variants={hudItemVariants}
                  className="w-full sm:w-[46%] h-[175px] sm:h-full border-b sm:border-b-0 sm:border-r border-sky-400/20 bg-[#040915]/90 p-3 flex flex-col justify-between overflow-y-auto"
                >
                  {loading ? (
                    /* Stylized Stark HUD Loading Animation for Featured News Spotlight Item */
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex flex-col h-full justify-between gap-2.5 select-none"
                    >
                      <div className="space-y-2.5">
                        <div className="relative h-28 sm:h-36 w-full rounded-xl overflow-hidden border border-sky-400/35 bg-[#050E22] hud-shimmer-surface">
                          {/* Corner HUD Reticle Brackets */}
                          <span className="pointer-events-none absolute top-2 left-2 w-2.5 h-2.5 border-t-2 border-l-2 border-sky-300/80" />
                          <span className="pointer-events-none absolute top-2 right-2 w-2.5 h-2.5 border-t-2 border-r-2 border-sky-300/80" />
                          <span className="pointer-events-none absolute bottom-2 left-2 w-2.5 h-2.5 border-b-2 border-l-2 border-sky-300/80" />
                          <span className="pointer-events-none absolute bottom-2 right-2 w-2.5 h-2.5 border-b-2 border-r-2 border-sky-300/80" />

                          {/* Sweeping Laser Scanline */}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-sky-400/30 to-sky-300/60 border-b border-sky-300/80 shadow-[0_0_16px_rgba(56,189,248,0.65)] animate-hud-scan"
                          />

                          {/* Center Holographic Radar Indicator */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
                            <div className="relative flex items-center justify-center">
                              <span className="absolute w-9 h-9 rounded-full border border-sky-400/40 animate-ping" />
                              <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-300/60 flex items-center justify-center shadow-[0_0_14px_rgba(56,189,248,0.45)]">
                                <Globe className="w-4 h-4 text-sky-200 animate-spin" />
                              </div>
                            </div>
                            <span className="font-mono-tech text-[10px] tracking-[0.16em] uppercase text-sky-200/95">
                              Varrendo Imprensa em Tempo Real
                            </span>
                            <span className="text-[10px] text-sky-300/75 truncate max-w-[90%]">
                              {cardData.query || 'Últimas Notícias'}
                            </span>
                          </div>
                        </div>

                        {/* Shimmering Headline & Snippet Skeleton Bars */}
                        <div className="space-y-1.5 pt-0.5">
                          <div className="h-3.5 w-[92%] rounded-md hud-shimmer-surface border border-sky-400/15" />
                          <div className="h-3.5 w-[74%] rounded-md hud-shimmer-surface border border-sky-400/15" />
                          <div className="h-2.5 w-[86%] rounded-md hud-shimmer-surface border border-sky-400/10 mt-1.5 opacity-80" />
                          <div className="h-2.5 w-[60%] rounded-md hud-shimmer-surface border border-sky-400/10 opacity-70" />
                        </div>
                      </div>

                      {/* Shimmering Action Button Placeholders */}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex-1 h-7 rounded-xl hud-shimmer-surface border border-sky-400/25" />
                        <div className="w-24 h-7 rounded-xl hud-shimmer-surface border border-sky-400/15" />
                      </div>
                    </div>
                  ) : activeNews ? (
                    <div className="flex flex-col h-full justify-between gap-2.5">
                      <div className="space-y-2">
                        <div className="relative h-28 sm:h-36 w-full rounded-xl overflow-hidden border border-sky-400/25 bg-[#060E1F] group">
                          <img
                            src={activeNews.imageUrl || FALLBACK_VISUAL_URL}
                            alt={activeNews.title}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = FALLBACK_VISUAL_URL;
                            }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#040914] via-[#040914]/30 to-transparent" />
                          <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-sky-200/90">
                            <span className="font-medium truncate">
                              {activeNews.source} · {activeNews.publishedAt}
                            </span>
                          </div>
                        </div>

                        <h3 className="text-xs sm:text-sm font-semibold text-slate-100 leading-snug line-clamp-3">
                          {activeNews.title}
                        </h3>

                        {activeNews.snippet && (
                          <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                            {activeNews.snippet}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleSpeakSingleNews(activeNews)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-100 text-[11px] font-medium transition-all cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-sky-300" />
                          <span>Ouvir Manchete</span>
                        </button>

                        <a
                          href={activeNews.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-slate-200 text-[11px] font-medium transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-sky-300" />
                          <span>Abrir Fonte</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                      <Globe className="w-7 h-7 text-sky-400/50 mb-2 animate-pulse" />
                      <p className="text-xs text-slate-300">
                        Peça ao J.A.R.V.I.S. notícias sobre qualquer tema ou selecione uma categoria ao lado.
                      </p>
                    </div>
                  )}
                </motion.div>

                {/* Right Side: Category Filters & Sequential Staggered Headlines Feed */}
                <motion.div
                  variants={hudSectionVariants}
                  className="flex-1 min-h-0 flex flex-col justify-between p-3 bg-[#060D1E]/90 overflow-y-auto space-y-2.5"
                >
                  {/* Top Category Bar + Narrate All Button */}
                  <motion.div variants={hudItemVariants} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-sky-300/90 font-medium truncate">
                        {loading
                          ? `Sincronizando manchetes · ${cardData.query || 'Tempo Real'}...`
                          : cardData.title || 'Feed de Notícias em Tempo Real'}
                      </div>
                      <button
                        type="button"
                        onClick={handleSpeakNewsBriefing}
                        disabled={loading}
                        className="flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-100 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Narrar Resumo</span>
                      </button>
                    </div>

                    {/* Quick Category Buttons */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {NEWS_CATEGORIES.map((cat) => {
                        const isSelected =
                          cardData.query?.toLowerCase() === cat.query.toLowerCase();
                        return (
                          <button
                            key={cat.label}
                            type="button"
                            onClick={() => onSearchMedia('news', cat.query)}
                            disabled={loading}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all cursor-pointer border disabled:opacity-50 ${
                              isSelected
                                ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                                : 'bg-[#081328]/80 border-sky-400/15 text-slate-300 hover:text-sky-200 hover:border-sky-400/35'
                            }`}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* Scrollable Headlines List or Stylized Loading Skeleton Items with Staggered Fade-in */}
                  <motion.div
                    variants={hudListContainerVariants}
                    className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1"
                  >
                    {loading
                      ? [0, 1, 2, 3].map((skeletonIdx) => (
                          <motion.div
                            key={`news-skeleton-${skeletonIdx}`}
                            variants={hudItemVariants}
                            className="relative w-full p-2 rounded-xl border border-sky-400/25 bg-[#081326]/85 flex items-start gap-2.5 overflow-hidden"
                          >
                            {/* Sweeping horizontal shimmer overlay */}
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-x-0 h-4 bg-gradient-to-b from-transparent via-sky-400/15 to-transparent animate-hud-scan"
                            />

                            {/* Stylized Thumbnail Skeleton */}
                            <div className="relative w-12 h-12 rounded-lg shrink-0 border border-sky-400/30 hud-shimmer-surface flex items-center justify-center">
                              <Newspaper className="w-4 h-4 text-sky-300/55 animate-pulse" />
                            </div>

                            {/* Stylized Headline & Source Bars */}
                            <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
                              <div className="h-3 w-[94%] rounded hud-shimmer-surface border border-sky-400/15" />
                              <div className="h-3 w-[68%] rounded hud-shimmer-surface border border-sky-400/10" />
                              <div className="flex items-center gap-2 pt-0.5">
                                <div className="h-2 w-20 rounded hud-shimmer-surface opacity-75" />
                                <div className="h-2 w-12 rounded hud-shimmer-surface opacity-60" />
                              </div>
                            </div>
                          </motion.div>
                        ))
                      : newsList.map((item, idx) => {
                          const active = idx === selectedNewsIndex;
                          return (
                            <motion.button
                              key={item.id}
                              variants={hudItemVariants}
                              type="button"
                              onClick={() => setSelectedNewsIndex(idx)}
                              className={`w-full text-left p-2 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                                active
                                  ? 'bg-sky-500/15 border-sky-400/45 shadow-[0_0_15px_rgba(14,165,233,0.12)]'
                                  : 'bg-[#081224]/70 border-sky-400/10 hover:bg-[#0A172E] hover:border-sky-400/25'
                              }`}
                            >
                              <img
                                src={item.imageUrl || FALLBACK_VISUAL_URL}
                                alt=""
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = FALLBACK_VISUAL_URL;
                                }}
                                className="w-12 h-12 rounded-lg object-cover shrink-0 border border-sky-400/20 bg-[#040914]"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-slate-100 leading-snug line-clamp-2">
                                  {item.title}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                  {item.source} · {item.publishedAt}
                                </p>
                              </div>
                            </motion.button>
                          );
                        })}
                  </motion.div>

                  {/* Grounding web sources if returned by Gemini Search */}
                  {!loading && cardData.groundingLinks && cardData.groundingLinks.length > 0 && (
                    <motion.div
                      variants={hudItemVariants}
                      className="pt-1 border-t border-sky-400/15 flex items-center gap-2 overflow-x-auto text-[10px] text-slate-400"
                    >
                      <Sparkles className="w-3 h-3 text-sky-400 shrink-0" />
                      <span className="shrink-0">Fontes verificadas:</span>
                      {cardData.groundingLinks.slice(0, 3).map((lk, i) => (
                        <a
                          key={i}
                          href={lk.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 hover:underline truncate max-w-[160px]"
                        >
                          {lk.title}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              </>
            ) : (
              /* Mode === 'images' (Holographic Image Projection System) */
              <>
                {/* Left Side: Main Projected Image Viewer */}
                <motion.div
                  variants={hudItemVariants}
                  className="w-full sm:w-[50%] h-[185px] sm:h-full border-b sm:border-b-0 sm:border-r border-sky-400/20 bg-[#040915]/90 p-3 flex flex-col justify-between overflow-y-auto"
                >
                  {loading ? (
                    /* Stylized Stark HUD Loading Animation for Main Projected Image Item */
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex flex-col h-full justify-between gap-2 select-none"
                    >
                      <div className="relative flex-1 min-h-[120px] rounded-xl overflow-hidden border border-sky-400/40 bg-[#040C1D] hud-shimmer-surface">
                        {/* Corner HUD Target Brackets */}
                        <span className="pointer-events-none absolute top-2.5 left-2.5 w-3 h-3 border-t-2 border-l-2 border-sky-300/85" />
                        <span className="pointer-events-none absolute top-2.5 right-2.5 w-3 h-3 border-t-2 border-r-2 border-sky-300/85" />
                        <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3 h-3 border-b-2 border-l-2 border-sky-300/85" />
                        <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3 h-3 border-b-2 border-r-2 border-sky-300/85" />

                        {/* Sweeping Laser Scanline */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 h-7 bg-gradient-to-b from-transparent via-sky-400/35 to-sky-300/65 border-b border-sky-300/85 shadow-[0_0_18px_rgba(56,189,248,0.75)] animate-hud-scan"
                        />

                        {/* Central Holographic Optical Decoder */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
                          <div className="relative flex items-center justify-center">
                            <span className="absolute w-10 h-10 rounded-full border border-sky-400/40 animate-ping" />
                            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-300/60 flex items-center justify-center shadow-[0_0_16px_rgba(56,189,248,0.5)]">
                              <ImageIcon className="w-4 h-4 text-sky-200 animate-pulse" />
                            </div>
                          </div>
                          <span className="font-mono-tech text-[10px] tracking-[0.16em] uppercase text-sky-200/95">
                            Renderizando Projeção Holográfica
                          </span>
                          <span className="text-[10px] text-sky-300/75 truncate max-w-[90%]">
                            {cardData.query || 'Registros Visuais'}
                          </span>
                        </div>
                      </div>

                      {/* Shimmering Metadata & Controls Placeholders */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="h-3.5 w-2/3 rounded hud-shimmer-surface border border-sky-400/15" />
                          <div className="h-3 w-16 rounded hud-shimmer-surface border border-sky-400/10" />
                        </div>
                        <div className="h-2.5 w-5/6 rounded hud-shimmer-surface opacity-75" />
                      </div>

                      <div className="flex items-center gap-2 pt-0.5">
                        <div className="flex-1 h-7 rounded-xl hud-shimmer-surface border border-sky-400/25" />
                        <div className="w-28 h-7 rounded-xl hud-shimmer-surface border border-sky-400/15" />
                      </div>
                    </div>
                  ) : activeImage ? (
                    <div className="flex flex-col h-full justify-between gap-2">
                      <div className="relative flex-1 min-h-[120px] rounded-xl overflow-hidden border border-sky-400/30 bg-[#030710] group">
                        <img
                          src={activeImage.imageUrl}
                          alt={activeImage.title}
                          onError={(e) => {
                            if (
                              activeImage.thumbnailUrl &&
                              (e.currentTarget as HTMLImageElement).src !== activeImage.thumbnailUrl
                            ) {
                              (e.currentTarget as HTMLImageElement).src = activeImage.thumbnailUrl;
                            } else {
                              (e.currentTarget as HTMLImageElement).src = FALLBACK_VISUAL_URL;
                            }
                          }}
                          className="w-full h-full object-contain bg-[#030710]"
                        />
                        <button
                          type="button"
                          onClick={() => setLightboxImage(activeImage)}
                          title="Expandir imagem em tela cheia"
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-[#050B18]/85 hover:bg-sky-500/30 border border-sky-400/35 text-sky-200 transition-colors cursor-pointer"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                            {activeImage.title}
                          </h3>
                          {activeImage.sourceName && (
                            <span className="text-[10px] text-sky-300/80 shrink-0">
                              {activeImage.sourceName}
                            </span>
                          )}
                        </div>
                        {activeImage.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {activeImage.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleSpeakActiveImage(activeImage)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-100 text-[11px] font-medium transition-all cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-sky-300" />
                          <span>Descrever Imagem</span>
                        </button>

                        {activeImage.sourceUrl && (
                          <a
                            href={activeImage.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-slate-200 text-[11px] font-medium transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-sky-300" />
                            <span>Fonte Original</span>
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                      <ImageIcon className="w-7 h-7 text-sky-400/50 mb-2 animate-pulse" />
                      <p className="text-xs text-slate-300">
                        Peça ao J.A.R.V.I.S. para pesquisar ou mostrar uma imagem de qualquer coisa.
                      </p>
                    </div>
                  )}
                </motion.div>

                {/* Right Side: Visual Gallery Grid & Quick Suggestions with Staggered Sequential Entrance */}
                <motion.div
                  variants={hudSectionVariants}
                  className="flex-1 min-h-0 flex flex-col justify-between p-3 bg-[#060D1E]/90 overflow-y-auto space-y-2.5"
                >
                  <motion.div variants={hudItemVariants} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-sky-300/90 font-medium truncate">
                        {loading
                          ? `Localizando imagens · ${cardData.query || 'Rede Global'}...`
                          : cardData.title || `Galeria Visual · ${cardData.query || 'Projeção'}`}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {loading
                          ? 'Sincronizando...'
                          : `${imageList.length} ${imageList.length === 1 ? 'imagem' : 'imagens'}`}
                      </span>
                    </div>

                    {/* Quick visual topic buttons */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {IMAGE_SUGGESTIONS.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => onSearchMedia('images', sug)}
                          disabled={loading}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap bg-[#081328]/80 border border-sky-400/15 text-slate-300 hover:text-sky-200 hover:border-sky-400/35 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Thumbnail Grid or Stylized Holographic Grid Skeletons */}
                  {loading ? (
                    <motion.div
                      variants={hudListContainerVariants}
                      className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto pr-1"
                    >
                      {[0, 1, 2, 3, 4, 5].map((gridIdx) => (
                        <motion.div
                          key={`img-skeleton-${gridIdx}`}
                          variants={hudItemVariants}
                          className="relative h-24 rounded-xl overflow-hidden border border-sky-400/30 bg-[#071226] hud-shimmer-surface flex flex-col justify-between p-2"
                        >
                          {/* Corner HUD Ticks */}
                          <span className="pointer-events-none absolute top-1.5 left-1.5 w-2 h-2 border-t border-l border-sky-300/70" />
                          <span className="pointer-events-none absolute top-1.5 right-1.5 w-2 h-2 border-t border-r border-sky-300/70" />

                          {/* Sweeping Vertical Laser Scanline */}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-0 h-5 bg-gradient-to-b from-transparent via-sky-400/25 to-sky-300/50 border-b border-sky-300/70 animate-hud-scan"
                          />

                          <div className="flex-1 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-sky-300/55 animate-pulse" />
                          </div>

                          <div className="h-2.5 w-4/5 rounded bg-sky-300/20 border border-sky-300/20" />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : imageList.length > 0 ? (
                    <motion.div
                      variants={hudListContainerVariants}
                      className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto pr-1"
                    >
                      {imageList.map((img, idx) => {
                        const isSelected = idx === selectedImageIndex;
                        return (
                          <motion.button
                            key={img.id}
                            variants={hudItemVariants}
                            type="button"
                            onClick={() => setSelectedImageIndex(idx)}
                            className={`group relative h-24 rounded-xl overflow-hidden border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/35 shadow-[0_0_14px_rgba(56,189,248,0.28)]'
                                : 'border-sky-400/15 hover:border-sky-400/40 opacity-80 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={img.thumbnailUrl || img.imageUrl}
                              alt={img.title}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = FALLBACK_VISUAL_URL;
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#030712]/95 via-[#030712]/60 to-transparent p-1.5">
                              <p className="text-[10px] text-slate-100 font-medium truncate">
                                {img.title}
                              </p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  ) : (
                    <motion.div
                      variants={hudItemVariants}
                      className="flex-1 flex items-center justify-center text-xs text-slate-400 text-center px-4"
                    >
                      Diga por exemplo: &ldquo;Jarvis, pesquisa Ferrari&rdquo;
                    </motion.div>
                  )}
                </motion.div>
              </>
            )}
          </motion.div>

          {/* Fullscreen Lightbox Modal when user clicks Zoom on a projected image */}
          {lightboxImage && (
            <div
              className="fixed inset-0 z-50 bg-[#02050D]/90 backdrop-blur-xl flex flex-col items-center justify-center p-4"
              onClick={() => setLightboxImage(null)}
            >
              <div
                className="relative max-w-4xl w-full max-h-[85vh] rounded-2xl overflow-hidden border border-sky-400/40 bg-[#050B18] shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-sky-400/20">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-sky-100 truncate">
                      {lightboxImage.title}
                    </h4>
                    {lightboxImage.sourceName && (
                      <p className="text-[11px] text-slate-400">{lightboxImage.sourceName}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLightboxImage(null)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 p-3 flex items-center justify-center bg-[#02060E]">
                  <img
                    src={lightboxImage.imageUrl}
                    alt={lightboxImage.title}
                    className="max-h-[68vh] w-auto object-contain rounded-lg"
                  />
                </div>
                {lightboxImage.description && (
                  <div className="px-4 py-2.5 border-t border-sky-400/15 text-xs text-slate-300">
                    {lightboxImage.description}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
};

