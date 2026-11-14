import React, { useState } from 'react';
import { Bot, Cpu, Mic, Play, RotateCcw, Sparkles, X, Zap } from 'lucide-react';
import {
  DspPreset,
  JARVIS_LLM_OPTIONS,
  JARVIS_VOICE_OPTIONS,
  JarvisLlmModelId,
  VoiceConfig,
} from '../types/jarvis';

interface VoiceCalibrationModalProps {
  open: boolean;
  onClose: () => void;
  config: VoiceConfig;
  onChange: (next: VoiceConfig) => void;
  onTestVoice: () => void;
  onTriggerClapProtocol: () => void;
  llmEngineLabel: string;
}

export const VoiceCalibrationModal: React.FC<VoiceCalibrationModalProps> = ({
  open,
  onClose,
  config,
  onChange,
  onTestVoice,
  onTriggerClapProtocol,
  llmEngineLabel,
}) => {
  const [activeTab, setActiveTab] = useState<'voices' | 'llm'>('voices');

  if (!open) return null;

  const handleVoiceSelect = (voiceId: string) => {
    const preset = JARVIS_VOICE_OPTIONS.find((v) => v.id === voiceId);
    onChange({
      ...config,
      voiceId,
      rate: preset ? preset.recommendedRate : config.rate,
      pitch: preset ? preset.recommendedPitch : config.pitch,
    });
  };

  const handleLlmSelect = (groqModel: JarvisLlmModelId) => {
    onChange({
      ...config,
      groqModel,
    });
  };

  const handleResetDefaults = () => {
    onChange({
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
    });
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-[min(580px,94vw)] max-h-[85vh] flex flex-col rounded-xl bg-[#070C18]/95 border border-sky-400/20 shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden">
      {/* Header with Segmented Tabs (Vozes & Cérebro LLM) */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B1222] border border-slate-800/90">
          <button
            type="button"
            onClick={() => setActiveTab('voices')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'voices'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Vozes e Áudio</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('llm')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'llm'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Cérebro LLM (Groq)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            title="Restaurar padrão J.A.R.V.I.S."
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="overflow-y-auto p-5 space-y-5">
        {activeTab === 'voices' && (
          <>
            {/* Voice Selection - Exclusively the 2 requested voices */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-medium text-slate-300">
                  Seleção de Voz Neural Oficial J.A.R.V.I.S.
                </label>
                <button
                  type="button"
                  onClick={onTestVoice}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Testar Voz</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {JARVIS_VOICE_OPTIONS.map((v) => {
                  const active = config.voiceId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleVoiceSelect(v.id)}
                      className={`text-left px-4 py-3 rounded-lg border transition-all cursor-pointer ${
                        active
                          ? 'bg-sky-500/15 border-sky-400/60 text-slate-100 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                          : 'bg-[#0B1222] border-slate-800/90 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-100 flex items-center justify-between">
                        <span>{v.label}</span>
                        {active && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-sky-500/20 text-sky-300 border border-sky-400/30">
                            Ativa
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-snug">{v.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Acoustic DSP Chain */}
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-2">
                Processamento Acústico J.A.R.V.I.S. (Web Audio DSP)
              </span>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#0B1222] border border-slate-800/90">
                {[
                  { id: DspPreset.NATURAL, label: 'Puro Neural' },
                  { id: DspPreset.STARK_STUDIO, label: 'Estúdio Stark' },
                  { id: DspPreset.HELMET_HUD, label: 'Capacete Mark VII' },
                ].map((item) => {
                  const selected = config.dspPreset === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChange({ ...config, dspPreset: item.id })}
                      className={`py-2 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Continuous Voice / Hands-Free Mode */}
            <div className="p-3.5 rounded-lg bg-[#0B1222] border border-slate-800/90">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-sky-400" />
                    <span>Voz Contínua (Mãos Livres)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Reabre o microfone automaticamente após cada resposta do J.A.R.V.I.S., mantendo a conversa sem cliques.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.handsFreeMode}
                  aria-label="Ativar voz contínua em mãos livres"
                  onClick={() =>
                    onChange({ ...config, handsFreeMode: !config.handsFreeMode })
                  }
                  className={`relative w-10 h-5 rounded-full border transition-colors cursor-pointer shrink-0 mt-0.5 ${
                    config.handsFreeMode
                      ? 'bg-sky-500 border-sky-400'
                      : 'bg-slate-700 border-slate-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      config.handsFreeMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {config.handsFreeMode && (
                <div className="mt-2.5 px-2.5 py-1.5 rounded-md bg-sky-500/10 border border-sky-400/20 text-[10px] text-sky-200/85 leading-snug">
                  Ativo: clique no microfone uma vez para iniciar. Depois de cada resposta, o J.A.R.V.I.S. volta a escutar sozinho. Diga "modo descanso" para encerrar.
                </div>
              )}
            </div>

            {/* 2-Clap Wake Protocol */}
            <div className="p-3.5 rounded-lg bg-[#0B1222] border border-slate-800/90">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-sky-400" />
                    <span>Ativação por 2 Palmas</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    No modo descanso, o sensor acústico local desperta o núcleo ao detectar duas palmas.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.clapWakeEnabled}
                  aria-label="Ativar despertar por duas palmas"
                  onClick={() =>
                    onChange({ ...config, clapWakeEnabled: !config.clapWakeEnabled })
                  }
                  className={`relative w-10 h-5 rounded-full border transition-colors cursor-pointer shrink-0 mt-0.5 ${
                    config.clapWakeEnabled
                      ? 'bg-sky-500 border-sky-400'
                      : 'bg-slate-700 border-slate-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      config.clapWakeEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <button
                type="button"
                onClick={onTriggerClapProtocol}
                className="mt-3 w-full px-3 py-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 text-sky-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Simular Protocolo de Despertar</span>
              </button>
            </div>

            {/* Prosody Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg bg-[#0B1222] border border-slate-800/90">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-300">Cadência de Fala</span>
                  <span className="font-mono-tech text-sky-300">{config.rate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.85"
                  max="1.25"
                  step="0.01"
                  value={config.rate}
                  onChange={(e) => onChange({ ...config, rate: parseFloat(e.target.value) })}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-[#0B1222] border border-slate-800/90">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-300">Ressonância Grave (Pitch)</span>
                  <span className="font-mono-tech text-sky-300">
                    {config.pitch >= 0 ? `+${config.pitch}` : config.pitch} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="6"
                  step="1"
                  value={config.pitch}
                  onChange={(e) => onChange({ ...config, pitch: parseInt(e.target.value, 10) })}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'llm' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-[#0B172B] to-[#08101F] border border-sky-500/30 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-400/20 text-sky-400 shrink-0">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                    <span>Configuração do Cérebro LLM (Groq Engine)</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      Sincronizado
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Escolha o modelo de Inteligência Artificial que alimentará o J.A.R.V.I.S. Todas as conversas e comandos em tempo real serão processados pelo modelo selecionado.
                  </p>
                </div>
              </div>

              {/* Status active engine badge */}
              <div className="p-2.5 rounded-lg bg-[#040813] border border-slate-800/90 text-xs flex items-center justify-between">
                <span className="text-slate-400">Motor Atual Conectado:</span>
                <span className="font-mono font-medium text-sky-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>{llmEngineLabel || config.groqModel}</span>
                </span>
              </div>
            </div>

            {/* Model Selection List */}
            <div className="space-y-2.5">
              <span className="block text-xs font-medium text-slate-300">
                Modelos de Linguagem Disponíveis para Sincronização:
              </span>

              <div className="grid grid-cols-1 gap-2.5">
                {JARVIS_LLM_OPTIONS.map((modelOpt) => {
                  const selected = config.groqModel === modelOpt.id;
                  return (
                    <button
                      key={modelOpt.id}
                      type="button"
                      onClick={() => handleLlmSelect(modelOpt.id)}
                      className={`text-left px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                        selected
                          ? 'bg-sky-500/15 border-sky-400/60 text-slate-100 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                          : 'bg-[#0B1222] border-slate-800/90 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                          {modelOpt.id === 'llama-3.1-8b-instant' ? (
                            <Zap className="w-3.5 h-3.5 text-cyan-400" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                          )}
                          <span>{modelOpt.label}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
                            selected
                              ? 'bg-sky-500 text-slate-950 font-semibold border-sky-400'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {selected ? 'Sincronizado' : modelOpt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        {modelOpt.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
