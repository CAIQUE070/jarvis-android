import React, { useEffect, useRef, useState } from 'react';
import { Send, Trash2, Volume2, X } from 'lucide-react';
import { ChatMessage, JarvisStatus } from '../types/jarvis';

interface CommandDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  status: JarvisStatus;
  onSendMessage: (text: string) => void;
  onReplaySpeech: (text: string) => void;
  onClearHistory: () => void;
}

const QUICK_PROMPTS = [
  'Jarvis, quais são as últimas notícias em tempo real?',
  'Jarvis, me mostre uma imagem da Nebulosa James Webb.',
  'Quais são as notícias sobre tecnologia e inteligência artificial hoje?',
  'Me mostre uma foto do Cristo Redentor no Rio de Janeiro.',
];

export const CommandDrawer: React.FC<CommandDrawerProps> = ({
  open,
  onClose,
  messages,
  status,
  onSendMessage,
  onReplaySpeech,
  onClearHistory,
}) => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      window.setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, messages.length]);

  if (!open) return null;

  const isBusy = status === JarvisStatus.THINKING;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;
    onSendMessage(trimmed);
    setInput('');
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-[min(640px,92vw)] rounded-xl bg-[#070C18]/95 border border-sky-400/20 shadow-[0_24px_60px_rgba(0,0,0,0.75)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 text-xs text-slate-300">
          <span className="font-display font-semibold tracking-wider text-slate-100">
            Console de Diálogo
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-400">Português Brasileiro</span>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              title="Limpar conversa"
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar console"
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Transcript History */}
      <div className="max-h-72 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Clique no núcleo central <strong className="text-slate-200 font-medium">JARVIS</strong>{' '}
              para conversar por voz ou teste abaixo as falas do vídeo em português:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSendMessage(prompt)}
                  className="text-left px-3.5 py-2.5 rounded-lg bg-[#0B1325] hover:bg-[#101C36] border border-slate-800/90 hover:border-sky-500/35 text-xs text-slate-300 hover:text-slate-100 transition-colors cursor-pointer leading-snug"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
                <span>{msg.role === 'user' ? 'Você' : 'J.A.R.V.I.S.'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tech">
                  {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {msg.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => onReplaySpeech(msg.content)}
                    title="Ouvir novamente"
                    className="text-slate-400 hover:text-sky-300 transition-colors cursor-pointer ml-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div
                className={`max-w-[88%] px-4 py-2.5 rounded-lg text-sm leading-relaxed select-text ${
                  msg.role === 'user'
                    ? 'bg-sky-500/15 border border-sky-400/25 text-sky-50'
                    : 'bg-[#0C1426] border border-slate-800/90 text-slate-200'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Command Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2.5 px-4 py-3 bg-[#050913] border-t border-slate-800/80"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite um comando ou fale pelo microfone..."
          disabled={isBusy}
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || isBusy}
          className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-slate-950 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <span>Enviar</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
