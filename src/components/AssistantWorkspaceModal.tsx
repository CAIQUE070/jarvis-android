import React, { useState } from 'react';
import { Check, Plus, Trash2, Video, X } from 'lucide-react';
import { AssistantNote, AssistantTimer } from '../types/jarvis';

interface AssistantWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  notes: AssistantNote[];
  timers: AssistantTimer[];
  onAddNote: (title: string) => void;
  onToggleNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onAddTimer: (label: string, seconds: number) => void;
  onDeleteTimer: (id: string) => void;
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const AssistantWorkspaceModal: React.FC<AssistantWorkspaceModalProps> = ({
  open,
  onClose,
  notes,
  timers,
  onAddNote,
  onToggleNote,
  onDeleteNote,
  onAddTimer,
  onDeleteTimer,
}) => {
  const [activeTab, setActiveTab] = useState<'memory' | 'reference'>('memory');
  const [newNote, setNewNote] = useState('');

  if (!open) return null;

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    onAddNote(newNote.trim());
    setNewNote('');
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-[min(560px,92vw)] max-h-[78vh] flex flex-col rounded-xl bg-[#070C18]/95 border border-sky-400/20 shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden">
      {/* Header with Clean Segmented Tabs */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B1222] border border-slate-800/90">
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'memory'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Memória & Rotinas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reference')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'reference'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Vídeo Base</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto p-5 space-y-5">
        {activeTab === 'memory' ? (
          <>
            {/* Active Timers */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-medium text-slate-300">Cronômetros Ativos</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: '1 min', sec: 60 },
                    { label: '5 min', sec: 300 },
                    { label: '25 min', sec: 1500 },
                  ].map((preset) => (
                    <button
                      key={preset.sec}
                      type="button"
                      onClick={() => onAddTimer(`Timer ${preset.label}`, preset.sec)}
                      className="px-2.5 py-1 rounded-md bg-[#0B1222] hover:bg-[#101C36] border border-slate-800 text-[11px] font-mono-tech text-slate-300 hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      +{preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {timers.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Peça por voz: &ldquo;Jarvis, coloque um timer de 5 minutos&rdquo; ou use os atalhos acima.
                </p>
              ) : (
                <div className="space-y-2">
                  {timers.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#0B1222] border border-slate-800/90"
                    >
                      <span className="text-xs text-slate-200">{t.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-tech text-sm font-semibold text-sky-300">
                          {formatSeconds(t.remainingSeconds)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteTimer(t.id)}
                          aria-label="Remover cronômetro"
                          className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Personal Notes & Project Ideas */}
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-2.5">
                Ideias e Lembretes Registrados pelo J.A.R.V.I.S.
              </span>

              <form onSubmit={handleNoteSubmit} className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Adicionar nota ou peça ao Jarvis por voz..."
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0B1222] border border-slate-800/90 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/50"
                />
                <button
                  type="submit"
                  disabled={!newNote.trim()}
                  className="px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Salvar</span>
                </button>
              </form>

              {notes.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhuma nota salva ainda. Experimente dizer: &ldquo;Jarvis, anote uma ideia para meu próximo vídeo&rdquo;.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-[#0B1222] border border-slate-800/90"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleNote(n.id)}
                        className="flex items-center gap-2.5 text-left flex-1 cursor-pointer"
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                            n.completed
                              ? 'bg-sky-500 border-sky-500 text-slate-950'
                              : 'border-slate-600'
                          }`}
                        >
                          {n.completed && <Check className="w-3 h-3 stroke-[2.5]" />}
                        </span>
                        <span
                          className={`text-xs leading-snug ${
                            n.completed ? 'line-through text-slate-500' : 'text-slate-200'
                          }`}
                        >
                          {n.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(n.id)}
                        aria-label="Excluir nota"
                        className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Comparação direta com o vídeo de referência enviado (incluindo o núcleo luminoso, a grade técnica e a transição aos 00:20 para o globo 3D com relógio):
            </p>
            <div className="rounded-lg overflow-hidden border border-slate-800 bg-black flex justify-center">
              <video
                src="/assets/aistudio/I_m_out_of_ideas__jarvis_a2bb5cdd.mp4"
                controls
                playsInline
                className="max-h-80 w-auto object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
