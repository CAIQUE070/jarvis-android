import { DspPreset, VoiceConfig } from '../types/jarvis';
import {
  canUseDirectEdgeNeuralTts,
  synthesizeDirectEdgeNeuralTts,
} from './edgeNeuralTts';

export interface AudioSpectrumFrame {
  rms: number;
  low: number;
  mid: number;
  high: number;
  bins: Uint8Array<ArrayBuffer>;
}

class JarvisAudioEngine {
  private ctx: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(256));
  private timeData: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(256));

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.outputAnalyser) {
      this.outputAnalyser = this.ctx.createAnalyser();
      this.outputAnalyser.fftSize = 512;
      this.outputAnalyser.smoothingTimeConstant = 0.78;
      this.freqData = new Uint8Array(new ArrayBuffer(this.outputAnalyser.frequencyBinCount));
      this.timeData = new Uint8Array(new ArrayBuffer(this.outputAnalyser.frequencyBinCount));
    }
    return this.ctx;
  }

  public unlock(): void {
    try {
      this.ensureContext();
    } catch {
      // Ignore autoplay lock before gesture
    }
  }

  public attachMicStream(stream: MediaStream): void {
    try {
      const ctx = this.ensureContext();
      this.detachMicStream();
      this.inputAnalyser = ctx.createAnalyser();
      this.inputAnalyser.fftSize = 512;
      this.inputAnalyser.smoothingTimeConstant = 0.75;
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.inputAnalyser);
    } catch {
      // Ignore mic analyser error
    }
  }

  public detachMicStream(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // Ignore
      }
      this.micSource = null;
    }
    this.inputAnalyser = null;
  }

  private playbackSessionId = 0;
  private decodedCache = new Map<string, AudioBuffer>();

  private splitIntoSpeechChunks(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [text];

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: string[] = [];

    for (const sentence of sentences) {
      if (sentence.length <= 110) {
        chunks.push(sentence);
        continue;
      }

      // Break long sentences at natural pauses so the first audio starts sooner.
      const parts = sentence
        .split(/(?<=[,;:])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      let current = '';
      for (const part of parts) {
        if (!current) {
          current = part;
        } else if ((current + ' ' + part).length <= 90) {
          current += ' ' + part;
        } else {
          chunks.push(current);
          current = part;
        }
      }
      if (current) chunks.push(current);
    }

    // Merge only tiny trailing fragments; keep the first chunk short on purpose.
    const result: string[] = [];
    for (const chunk of chunks) {
      const previous = result[result.length - 1];
      if (
        previous &&
        chunk.length < 12 &&
        (previous + ' ' + chunk).length <= 120
      ) {
        result[result.length - 1] = `${previous} ${chunk}`;
      } else {
        result.push(chunk);
      }
    }

    return result.length > 0 ? result : [normalized];
  }

  private async fetchAndDecodeChunk(
    chunkText: string,
    config: VoiceConfig
  ): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const cacheKey = `${config.voiceId}|${config.rate}|${config.pitch}|${chunkText}`;
    const cached = this.decodedCache.get(cacheKey);
    if (cached) return cached;

    let arrayBuffer: ArrayBuffer | null = null;

    // No APK uses the operating system's built-in TTS. On an Edge-compatible
    // WebView (the Android build), use the exact same Edge neural voice as the
    // PC directly. Chrome and other browsers continue through the local API.
    if (canUseDirectEdgeNeuralTts()) {
      try {
        arrayBuffer = await synthesizeDirectEdgeNeuralTts(
          chunkText,
          config.voiceId,
          config.rate,
          config.pitch
        );
      } catch {
        // If direct Edge synthesis is temporarily unavailable, use the PC API.
      }
    }

    if (!arrayBuffer) {
      const response = await fetch('/api/jarvis/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chunkText,
          voice: config.voiceId,
          rate: config.rate,
          pitch: config.pitch,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS HTTP ${response.status}`);
      }

      arrayBuffer = await response.arrayBuffer();
    }

    if (arrayBuffer.byteLength < 128) {
      throw new Error('Buffer de áudio insuficiente');
    }

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (this.decodedCache.size >= 40) {
      const firstKey = this.decodedCache.keys().next().value;
      if (firstKey) this.decodedCache.delete(firstKey);
    }
    this.decodedCache.set(cacheKey, audioBuffer);
    return audioBuffer;
  }

  public stopSpeaking(): void {
    this.playbackSessionId++;
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.currentSource = null;
    }
  }

  public async speak(
    text: string,
    config: VoiceConfig,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    this.stopSpeaking();
    const sessionId = this.playbackSessionId;
    const trimmed = text.trim();
    if (!trimmed) {
      onEnd?.();
      return;
    }

    try {
      const chunks = this.splitIntoSpeechChunks(trimmed);
      // Kick off synthesis of all sentence chunks in parallel so chunk 0 arrives fast
      // and chunk 1..N are already decoded when chunk 0 finishes playing
      const chunkPromises = chunks.map((chunk) =>
        this.fetchAndDecodeChunk(chunk, config)
      );

      let started = false;
      for (let i = 0; i < chunkPromises.length; i++) {
        const audioBuffer = await chunkPromises[i];
        if (this.playbackSessionId !== sessionId) return;

        await this.playThroughJarvisDsp(
          audioBuffer,
          config.dspPreset,
          !started
            ? () => {
                started = true;
                onStart?.();
              }
            : undefined,
          i === chunkPromises.length - 1 ? onEnd : undefined
        );
        if (this.playbackSessionId !== sessionId) return;
      }
    } catch {
      if (this.playbackSessionId !== sessionId) return;
      onEnd?.();
    }
  }

  private playThroughJarvisDsp(
    buffer: AudioBuffer,
    preset: DspPreset,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const ctx = this.ensureContext();
      const analyser = this.outputAnalyser!;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      this.currentSource = source;

      if (preset === DspPreset.NATURAL) {
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } else {
        // J.A.R.V.I.S. Studio / Eduardo Borgerth Cloned Cinematic Dubbing Chain
        const isHelmet = preset === DspPreset.HELMET_HUD;

        // 1. High-pass filter (removes any sub-bass rumble)
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = isHelmet ? 120 : 65;

        // 2. Deep Baritone Voice Enhancement (Eduardo Borgerth timbre)
        const lowWarmth = ctx.createBiquadFilter();
        lowWarmth.type = 'peaking';
        lowWarmth.frequency.value = 160;
        lowWarmth.Q.value = 1.4;
        lowWarmth.gain.value = isHelmet ? 2.8 : 5.0;

        // 3. Lower-Mid Vocal Body (eliminates any tinny/browser artifacts)
        const bodyShelf = ctx.createBiquadFilter();
        bodyShelf.type = 'lowshelf';
        bodyShelf.frequency.value = 350;
        bodyShelf.gain.value = 3.2;

        // 4. Articulation and Presence (crisp Hollywood dubbing consonants)
        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2600;
        presence.Q.value = 1.1;
        presence.gain.value = isHelmet ? 5.0 : 4.2;

        // 5. Cinematic Air Shelf
        const airShelf = ctx.createBiquadFilter();
        airShelf.type = 'highshelf';
        airShelf.frequency.value = 8500;
        airShelf.gain.value = 3.0;

        // 6. Broadcast Compressor (smooth cinema dynamics)
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 16;
        compressor.ratio.value = 6.0;
        compressor.attack.value = 0.0015;
        compressor.release.value = 0.18;

        // 7. Warm Analog Tube Saturation filter
        const tubeFilter = ctx.createBiquadFilter();
        tubeFilter.type = 'lowpass';
        tubeFilter.frequency.value = isHelmet ? 6800 : 12500;
        tubeFilter.Q.value = 0.65;

        const makeupGain = ctx.createGain();
        makeupGain.gain.value = 1.45;

        source.connect(highpass);
        highpass.connect(lowWarmth);
        lowWarmth.connect(bodyShelf);
        bodyShelf.connect(presence);
        presence.connect(airShelf);
        airShelf.connect(compressor);
        compressor.connect(tubeFilter);
        tubeFilter.connect(makeupGain);
        makeupGain.connect(analyser);
        analyser.connect(ctx.destination);
      }

      onStart?.();
      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
        }
        onEnd?.();
        resolve();
      };

      source.start(0);
    });
  }

  public getSpectrum(mode: 'output' | 'input' | 'auto' = 'auto'): AudioSpectrumFrame {
    const activeAnalyser =
      mode === 'input'
        ? this.inputAnalyser
        : mode === 'output'
          ? this.outputAnalyser
          : this.currentSource
            ? this.outputAnalyser
            : this.inputAnalyser || this.outputAnalyser;

    if (activeAnalyser) {
      if (this.freqData.length !== activeAnalyser.frequencyBinCount) {
        this.freqData = new Uint8Array(new ArrayBuffer(activeAnalyser.frequencyBinCount));
        this.timeData = new Uint8Array(new ArrayBuffer(activeAnalyser.frequencyBinCount));
      }
      activeAnalyser.getByteFrequencyData(this.freqData);
      activeAnalyser.getByteTimeDomainData(this.timeData);

      let sumSq = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const centered = (this.timeData[i] - 128) / 128;
        sumSq += centered * centered;
      }
      const rms = Math.min(1, Math.sqrt(sumSq / this.timeData.length) * 2.8);

      let lowSum = 0;
      let midSum = 0;
      let highSum = 0;
      for (let i = 1; i <= 10; i++) lowSum += this.freqData[i];
      for (let i = 11; i <= 42; i++) midSum += this.freqData[i];
      for (let i = 43; i <= 96; i++) highSum += this.freqData[i];

      return {
        rms,
        low: lowSum / (10 * 255),
        mid: midSum / (32 * 255),
        high: highSum / (54 * 255),
        bins: this.freqData,
      };
    }

    this.freqData.fill(0);
    return { rms: 0, low: 0, mid: 0, high: 0, bins: this.freqData };
  }

  public playHudCue(
    type: 'wake' | 'listen_on' | 'listen_off' | 'standby' | 'timer_done',
    enabled = true
  ): void {
    if (!enabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      if (type === 'wake') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(280, now);
        osc1.frequency.exponentialRampToValueAtTime(740, now + 0.26);
        osc2.frequency.setValueAtTime(420, now + 0.04);
        osc2.frequency.exponentialRampToValueAtTime(1110, now + 0.32);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now + 0.04);
        osc1.stop(now + 0.4);
        osc2.stop(now + 0.4);
      } else if (type === 'listen_on') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.11);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'listen_off') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(680, now);
        osc.frequency.exponentialRampToValueAtTime(430, now + 0.1);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.035, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } else if (type === 'standby') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(560, now);
        osc.frequency.exponentialRampToValueAtTime(210,now + 0.28);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.32);
      } else if (type === 'timer_done') {
        [0, 0.18, 0.36].forEach((offset) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now + offset);
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.07, now + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.15);
        });
      }
    } catch {
      // Ignore audio cue failure
    }
  }
}

export const jarvisAudio = new JarvisAudioEngine();
