import React, { useEffect, useRef, useState } from 'react';
import { jarvisAudio } from '../audio/jarvisAudioEngine';
import { JarvisStatus, ViewMode } from '../types/jarvis';
import { HudGlitchShader } from './HudGlitchShader';

interface JarvisCoreCanvasProps {
  status: JarvisStatus;
  viewMode: ViewMode;
  onCoreClick: () => void;
  elevated?: boolean;
}

interface OrbitalSpark {
  angle: number;
  speed: number;
  radiusFactor: number;
  size: number;
  phase: number;
  twinkleSpeed: number;
}

interface SpherePoint3D {
  bx: number;
  by: number;
  bz: number;
  size: number;
  bandBoost: number;
}

function createOrbitalSparks(count: number): OrbitalSpark[] {
  const sparks: OrbitalSpark[] = [];
  for (let i = 0; i < count; i++) {
    const dir = i % 3 === 0 ? -1 : 1;
    sparks.push({
      angle: (Math.PI * 2 * i) / count + i * 0.37,
      speed: dir * (0.08 + (i % 7) * 0.028),
      radiusFactor: 1.14 + ((i * 17) % 64) / 100,
      size: 0.9 + (i % 4) * 0.42,
      phase: i * 1.13,
      twinkleSpeed: 1.4 + (i % 5) * 0.45,
    });
  }
  return sparks;
}

function createSpherePoints(count: number): SpherePoint3D[] {
  const pts: SpherePoint3D[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;

    const swirl =
      Math.sin(theta * 3 + y * 4.2) * 0.06 + Math.cos(theta * 5 - y * 3.1) * 0.04;
    const rMod = 1 + swirl;

    const bx = Math.cos(theta) * radiusAtY * rMod;
    const by = y * rMod;
    const bz = Math.sin(theta) * radiusAtY * rMod;
    const bandBoost =
      0.55 + 0.45 * Math.abs(Math.sin(theta * 2.5 + y * 5.0));

    pts.push({
      bx,
      by,
      bz,
      size: 0.85 + (i % 3) * 0.38,
      bandBoost,
    });
  }
  return pts;
}

const ORBITAL_SPARKS = createOrbitalSparks(24);
const SPHERE_POINTS = createSpherePoints(440);

function formatClockParts(now: Date): { time: string; dateStr: string } {
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const weekday = now
    .toLocaleDateString('pt-BR', { weekday: 'long' })
    .toUpperCase();
  const day = now.getDate();
  const month = now
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .toUpperCase();

  return {
    time: `${hours}:${minutes}`,
    dateStr: `${weekday} ${day} ${month}`,
  };
}

export const JarvisCoreCanvas: React.FC<JarvisCoreCanvasProps> = ({
  status,
  viewMode,
  onCoreClick,
  elevated = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<JarvisStatus>(status);
  const viewModeRef = useRef<ViewMode>(viewMode);
  const elevatedRef = useRef<boolean>(elevated);
  const [clock, setClock] = useState(() => formatClockParts(new Date()));

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    elevatedRef.current = elevated;
  }, [elevated]);

  useEffect(() => {
    const update = () => setClock(formatClockParts(new Date()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();

    let smoothedRms = 0;
    let smoothedLow = 0;
    let smoothedMid = 0;
    let smoothedHigh = 0;
    let standbyMix = viewModeRef.current === ViewMode.STANDBY ? 1 : 0;
    let elevatedMix = elevatedRef.current ? 1 : 0;
    let platesMix = statusRef.current === JarvisStatus.BOOTING ? 1 : 0;
    let listeningMix = 0;
    let speakingMix = statusRef.current === JarvisStatus.SPEAKING ? 1 : 0;
    let innerArcAngle = Math.PI * 0.68;
    let outerArcAngle = -Math.PI * 0.35;
    let outerDotsAngle = 0;
    let globeRotY = 0;
    let globeRotX = 0.22;
    let wakeRevealMix = 1;
    let prevMode = viewModeRef.current;
    let prevStatus = statusRef.current;
    let thinkingStartAt = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const t = now * 0.001;

      const curStatus = statusRef.current;
      const curMode = viewModeRef.current;

      if (prevMode === ViewMode.STANDBY && curMode !== ViewMode.STANDBY) {
        wakeRevealMix = 0;
      }
      prevMode = curMode;

      if (curStatus === JarvisStatus.THINKING && prevStatus !== JarvisStatus.THINKING) {
        thinkingStartAt = now;
      }
      prevStatus = curStatus;

      const targetStandby = curMode === ViewMode.STANDBY ? 1 : 0;
      standbyMix += (targetStandby - standbyMix) * (1 - Math.exp(-5.5 * dt));

      const targetWakeReveal = curMode === ViewMode.WAKING ? 0.08 : 1;
      wakeRevealMix += (targetWakeReveal - wakeRevealMix) * (1 - Math.exp(-5.2 * dt));

      const targetPlates =
        curStatus === JarvisStatus.BOOTING || curStatus === JarvisStatus.THINKING ? 1 : 0;
      platesMix += (targetPlates - platesMix) * (1 - Math.exp(-6.0 * dt));

      const targetListening = curStatus === JarvisStatus.LISTENING ? 1 : 0;
      listeningMix += (targetListening - listeningMix) * (1 - Math.exp(-6.5 * dt));

      const targetSpeaking = curStatus === JarvisStatus.SPEAKING ? 1 : 0;
      speakingMix += (targetSpeaking - speakingMix) * (1 - Math.exp(-9.0 * dt));

      const spectrumMode =
        curStatus === JarvisStatus.LISTENING
          ? 'input'
          : curStatus === JarvisStatus.SPEAKING
            ? 'output'
            : 'auto';
      const spec = jarvisAudio.getSpectrum(spectrumMode);

      // Syllabic cadence envelope guarantees a rich vocal pulse whenever Jarvis is speaking
      const speakingCadence =
        curStatus === JarvisStatus.SPEAKING
          ? 0.28 +
            0.22 * Math.abs(Math.sin(t * 7.8)) +
            0.14 * Math.max(0, Math.sin(t * 14.6 + 0.8)) +
            0.09 * Math.cos(t * 21.3)
          : 0;

      const idleBreath =
        curStatus === JarvisStatus.THINKING
          ? 0.22 + 0.14 * Math.sin(t * 5.2)
          : curStatus === JarvisStatus.SPEAKING
            ? speakingCadence
            : 0.04 + 0.025 * Math.sin(t * 1.9);

      const rawEnergy = Math.max(spec.rms * 1.25, idleBreath);
      const targetLow = Math.max(spec.low * 1.25, speakingCadence * 0.92);
      const targetMid = Math.max(spec.mid * 1.25, speakingCadence * 0.78);
      const targetHigh = Math.max(spec.high * 1.2, speakingCadence * 0.55);

      smoothedRms += (rawEnergy - smoothedRms) * (1 - Math.exp(-20 * dt));
      smoothedLow += (targetLow - smoothedLow) * (1 - Math.exp(-18 * dt));
      smoothedMid += (targetMid - smoothedMid) * (1 - Math.exp(-20 * dt));
      smoothedHigh += (targetHigh - smoothedHigh) * (1 - Math.exp(-22 * dt));

      const targetElevated =
        elevatedRef.current && curMode !== ViewMode.STANDBY ? 1 : 0;
      elevatedMix += (targetElevated - elevatedMix) * (1 - Math.exp(-6.5 * dt));

      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w * 0.5;
      const activeCy = h * (0.485 - 0.25 * elevatedMix);
      const standbyCy = h * 0.4;
      const cy = activeCy + (standbyCy - activeCy) * standbyMix;

      const baseR =
        Math.max(76, Math.min(112, Math.min(w, h) * 0.138)) *
        (1 - 0.22 * elevatedMix);

      // 1. Deep Obsidian-Navy Canvas Background
      ctx.fillStyle = standbyMix > 0.5 ? '#04060C' : '#050811';
      ctx.fillRect(0, 0, w, h);

      // Soft central monitor backlight vignette
      const bgGlowAlpha = (1 - standbyMix * 0.72) * (0.24 + smoothedRms * 0.14);
      const bgGrad = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, Math.max(w, h) * 0.62);
      bgGrad.addColorStop(0, `rgba(14, 42, 84, ${bgGlowAlpha.toFixed(3)})`);
      bgGrad.addColorStop(0.45, `rgba(8, 20, 42, ${(bgGlowAlpha * 0.45).toFixed(3)})`);
      bgGrad.addColorStop(1, 'rgba(3, 5, 11, 0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Architectural Blueprint Coordinate Grid (fades cleanly in Standby Mode)
      const gridAlpha = (1 - standbyMix * 0.88) * 0.085;
      if (gridAlpha > 0.004) {
        const gridStep = 52;
        const offsetX = cx % gridStep;
        const offsetY = activeCy % gridStep;

        const subStep = gridStep / 2;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(56, 152, 255, ${(gridAlpha * 0.28).toFixed(4)})`;
        ctx.lineWidth = 1;
        for (let x = cx % subStep; x < w; x += subStep) {
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, h);
        }
        for (let y = activeCy % subStep; y < h; y += subStep) {
          ctx.moveTo(0, Math.round(y) + 0.5);
          ctx.lineTo(w, Math.round(y) + 0.5);
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = `rgba(64, 158, 255, ${gridAlpha.toFixed(4)})`;
        ctx.lineWidth = 1;
        for (let x = offsetX; x < w; x += gridStep) {
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, h);
        }
        for (let y = offsetY; y < h; y += gridStep) {
          ctx.moveTo(0, Math.round(y) + 0.5);
          ctx.lineTo(w, Math.round(y) + 0.5);
        }
        ctx.stroke();

        const edgeGrad = ctx.createRadialGradient(
          cx,
          activeCy,
          Math.min(w, h) * 0.26,
          cx,
          activeCy,
          Math.max(w, h) * 0.72
        );
        edgeGrad.addColorStop(0, 'rgba(5, 8, 17, 0)');
        edgeGrad.addColorStop(1, `rgba(4, 6, 13, ${(0.72 * (1 - standbyMix)).toFixed(3)})`);
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // 3. Top Chamfered HUD Bezel Line (exact stepped top frame line from the video)
      const topBarAlpha = (1 - standbyMix * 0.85) * 0.38;
      if (topBarAlpha > 0.02) {
        const dipHalfWidth = Math.min(155, w * 0.14);
        const chamfer = 9;
        const yTop = 18.5;
        const marginX = Math.max(20, w * 0.03);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(marginX, yTop);
        ctx.lineTo(cx - dipHalfWidth - chamfer, yTop);
        ctx.lineTo(cx - dipHalfWidth, yTop + chamfer);
        ctx.lineTo(cx + dipHalfWidth, yTop + chamfer);
        ctx.lineTo(cx + dipHalfWidth + chamfer, yTop);
        ctx.lineTo(w - marginX, yTop);
        ctx.strokeStyle = `rgba(96, 189, 255, ${topBarAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.15;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();
      }

      // =========================================================================
      // MODE A: ACTIVE CORE RING HUD (00:00 - 00:19 & 00:24 - 00:25)
      // =========================================================================
      const coreAlpha = 1 - standbyMix;
      if (coreAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = coreAlpha;

        const isSpeaking = curStatus === JarvisStatus.SPEAKING;
        // Pure circular radial pulse when speaking: keeps the exact static circular shape while pulsing in size
        const speakRadialPulse =
          speakingMix *
          (smoothedRms * 0.14 + smoothedLow * 0.08 + 0.03 * Math.sin(t * 9.0));
        const dynamicR =
          baseR * (1 + smoothedRms * 0.04 + speakRadialPulse);
        const detailAlpha = Math.max(0, Math.min(1, wakeRevealMix));

        // 3a. Dark circular inner core mask so "JARVIS" pops with crisp contrast
        ctx.beginPath();
        ctx.arc(cx, cy, dynamicR * 0.98, 0, Math.PI * 2);
        ctx.fillStyle = '#040710';
        ctx.fill();

        // 3b. Wide Cobalt-Cyan Radial Bloom Halo around the ring
        const haloOuter = dynamicR * (1.58 + smoothedRms * 0.25);
        const haloInner = dynamicR * 0.68;
        const ringGlow = ctx.createRadialGradient(cx, cy, haloInner, cx, cy, haloOuter);
        const peakGlow = Math.min(0.62, 0.31 + smoothedRms * 0.34);
        ringGlow.addColorStop(0, 'rgba(4, 7, 16, 0)');
        ringGlow.addColorStop(0.46, `rgba(14, 148, 248, ${(peakGlow * 0.85).toFixed(3)})`);
        ringGlow.addColorStop(0.56, `rgba(56, 189, 248, ${peakGlow.toFixed(3)})`);
        ringGlow.addColorStop(0.75, `rgba(2, 112, 215, ${(peakGlow * 0.35).toFixed(3)})`);
        ringGlow.addColorStop(1, 'rgba(2, 84, 180, 0)');
        ctx.fillStyle = ringGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, haloOuter, 0, Math.PI * 2);
        ctx.fill();

        // 3c. Frame 00:00 Holographic Curved Plates (active during Booting / Thinking)
        if (platesMix > 0.015) {
          const plateAngleBase = t * 1.15;
          const plateR = dynamicR * 1.13;
          ctx.save();
          ctx.globalAlpha = coreAlpha * platesMix * 0.85;
          for (let p = 0; p < 2; p++) {
            const aStart = plateAngleBase + p * Math.PI - 0.56;
            const aEnd = aStart + 1.12;

            ctx.beginPath();
            ctx.arc(cx, cy, plateR + 9, aStart, aEnd);
            ctx.arc(cx, cy, dynamicR * 1.03, aEnd, aStart, true);
            ctx.closePath();
            ctx.fillStyle = 'rgba(125, 211, 252, 0.20)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, plateR + 9, aStart, aEnd);
            ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)';
            ctx.lineWidth = 2.2;
            ctx.stroke();
          }
          ctx.restore();
        }

        // 3d. Primary Audio-Reactive Glowing Neon-Blue Ring (Exact clean circular geometry that pulses in scale)
        const buildRingPath = (radiusScale = 1) => {
          ctx.beginPath();
          ctx.arc(cx, cy, dynamicR * radiusScale, 0, Math.PI * 2);
          ctx.closePath();
        };

        // Pass 1: Soft outer electric blue aura stroke
        ctx.save();
        buildRingPath(1.02);
        ctx.strokeStyle =
          listeningMix > 0.5
            ? 'rgba(56, 215, 255, 0.42)'
            : isSpeaking
              ? 'rgba(56, 189, 248, 0.52)'
              : 'rgba(14, 150, 250, 0.38)';
        ctx.lineWidth = 14 + smoothedRms * 14;
        ctx.shadowColor = '#0EA5E9';
        ctx.shadowBlur = 28 + smoothedRms * 24;
        ctx.stroke();

        // Pass 2: Medium luminous cyan-cobalt ring
        buildRingPath(1);
        ctx.strokeStyle = isSpeaking ? '#38BDF8' : '#22B3F6';
        ctx.lineWidth = 6 + smoothedRms * 4.5;
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 18;
        ctx.stroke();

        // Pass 3: Razor-sharp bright ice-cyan filament core
        buildRingPath(0.98);
        ctx.strokeStyle = smoothedRms > 0.12 || isSpeaking ? '#FFFFFF' : '#BAE6FD';
        ctx.lineWidth = 2.4 + smoothedRms * 1.5;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();

        // 3e. Inner Rotating White-Cyan Sweep Arcs
        const arcSpeed =
          curStatus === JarvisStatus.THINKING
            ? 2.4
            : isSpeaking
              ? 1.35 + smoothedRms * 1.8
              : curStatus === JarvisStatus.LISTENING
                ? -0.75
                : 0.32;
        innerArcAngle += arcSpeed * dt;
        outerArcAngle -= arcSpeed * 0.72 * dt;

        if (detailAlpha > 0.02) {
          ctx.save();
          ctx.globalAlpha = coreAlpha * detailAlpha;

          const innerR = dynamicR * 0.835;
          const sweepSpan = 1.28 + smoothedRms * 0.55;

          ctx.beginPath();
          ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(125, 211, 252, 0.12)';
          ctx.lineWidth = 1;
          ctx.stroke();

          const arcSteps = 28;
          for (let s = 0; s < arcSteps; s++) {
            const frac0 = s / arcSteps;
            const frac1 = (s + 1) / arcSteps;
            const a0 = innerArcAngle + frac0 * sweepSpan;
            const a1 = innerArcAngle + frac1 * sweepSpan;
            const taper = Math.sin(frac0 * Math.PI);

            ctx.beginPath();
            ctx.arc(cx, cy, innerR, a0, a1 + 0.015);
            ctx.strokeStyle = `rgba(224, 242, 254, ${(0.92 * taper).toFixed(3)})`;
            ctx.lineWidth = 1.3 + 1.35 * taper;
            ctx.stroke();
          }

          // 3f. Outer Micro-Dot Ring + 8 Luminous Anchor Dots (pulses concentrically with dynamicR)
          outerDotsAngle += (isSpeaking ? 0.22 + smoothedRms * 0.35 : 0.05) * dt;
          const outerDotR = dynamicR * 1.33;
          const microCount = 72;

          ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
          for (let i = 0; i < microCount; i++) {
            const a = outerDotsAngle + (i / microCount) * Math.PI * 2;
            const mx = cx + Math.cos(a) * outerDotR;
            const my = cy + Math.sin(a) * outerDotR;
            ctx.beginPath();
            ctx.arc(mx, my, 0.9, 0, Math.PI * 2);
            ctx.fill();
          }

          for (let k = 0; k < 8; k++) {
            const nodeAngle = (k * Math.PI) / 4 + (isSpeaking ? outerDotsAngle * 0.5 : 0);
            const nx = cx + Math.cos(nodeAngle) * outerDotR;
            const ny = cy + Math.sin(nodeAngle) * outerDotR;

            ctx.beginPath();
            ctx.arc(nx, ny, 5.5 + smoothedRms * 2.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(nx, ny, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = '#E0F2FE';
            ctx.fill();
          }

          if (listeningMix > 0.04) {
            ctx.save();
            ctx.globalAlpha = coreAlpha * detailAlpha * listeningMix * 0.75;
            const tickR = outerDotR + 10;
            for (let m = 0; m < 3; m++) {
              const ma = -t * 0.35 + (m * Math.PI * 2) / 3 - 0.8;
              ctx.beginPath();
              ctx.arc(cx, cy, tickR, ma, ma + 0.16);
              ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
              ctx.lineWidth = 1.8;
              ctx.stroke();
            }
            ctx.restore();
          }

          // 3g. 4 Outer Diagonal Tangential Reticle Bars
          const reticleR = baseR * 1.66 + smoothedRms * 7 + listeningMix * 4;
          const barHalfLen = 5.5;
          ctx.strokeStyle = 'rgba(186, 230, 253, 0.52)';
          ctx.lineWidth = 1.4;
          for (let d = 0; d < 4; d++) {
            const diagAngle = Math.PI * 0.25 + d * Math.PI * 0.5;
            const rx = cx + Math.cos(diagAngle) * reticleR;
            const ry = cy + Math.sin(diagAngle) * reticleR;
            const tx = -Math.sin(diagAngle) * barHalfLen;
            const ty = Math.cos(diagAngle) * barHalfLen;

            ctx.beginPath();
            ctx.moveTo(rx - tx, ry - ty);
            ctx.lineTo(rx + tx, ry + ty);
            ctx.stroke();
          }

          // 3h. Floating Orbital Stardust Sparks
          const sparkBoost = 1 + smoothedRms * 1.8 + listeningMix * 0.9;
          for (let s = 0; s < ORBITAL_SPARKS.length; s++) {
            const sp = ORBITAL_SPARKS[s];
            const curAngle = sp.angle + t * sp.speed * sparkBoost;
            const radialWave = Math.sin(t * 0.9 + sp.phase) * 6;
            const sr = baseR * sp.radiusFactor + radialWave + smoothedRms * 8;
            const sx = cx + Math.cos(curAngle) * sr;
            const sy = cy + Math.sin(curAngle) * sr;

            const twinkle =
              0.22 +
              0.55 * (0.5 + 0.5 * Math.sin(t * sp.twinkleSpeed + sp.phase)) +
              smoothedRms * 0.22;

            ctx.beginPath();
            ctx.arc(sx, sy, sp.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(224, 242, 254, ${Math.min(0.95, twinkle).toFixed(3)})`;
            ctx.fill();
          }

          ctx.restore();
        }

        ctx.restore();
      }

      // =========================================================================
      // MODE B: STANDBY 3D PARTICLE SPHERE & CLOCK (00:20 - 00:23)
      // =========================================================================
      if (standbyMix > 0.01) {
        ctx.save();
        ctx.globalAlpha = standbyMix;

        const sphereR = baseR * 0.92;
        globeRotY += dt * 0.28;
        globeRotX = 0.22 + Math.sin(t * 0.35) * 0.08;

        const cosY = Math.cos(globeRotY);
        const sinY = Math.sin(globeRotY);
        const cosX = Math.cos(globeRotX);
        const sinX = Math.sin(globeRotX);

        const globeGlow = ctx.createRadialGradient(
          cx,
          cy,
          sphereR * 0.08,
          cx,
          cy,
          sphereR * 1.38
        );
        globeGlow.addColorStop(0, 'rgba(14, 116, 204, 0.26)');
        globeGlow.addColorStop(0.65, 'rgba(14, 165, 233, 0.16)');
        globeGlow.addColorStop(1, 'rgba(3, 7, 18, 0)');
        ctx.fillStyle = globeGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, sphereR * 1.38, 0, Math.PI * 2);
        ctx.fill();

        const fov = 340;
        for (let i = 0; i < SPHERE_POINTS.length; i++) {
          const p = SPHERE_POINTS[i];

          const ripple =
            1 +
            0.032 * Math.sin(t * 1.6 + p.bx * 4.5 + p.by * 3.8) +
            smoothedRms * 0.08;

          const x0 = p.bx * sphereR * ripple;
          const y0 = p.by * sphereR * ripple;
          const z0 = p.bz * sphereR * ripple;

          const x1 = x0 * cosY - z0 * sinY;
          const z1 = x0 * sinY + z0 * cosY;
          const y2 = y0 * cosX - z1 * sinX;
          const z2 = y0 * sinX + z1 * cosX;

          const scale = fov / (fov + z2 + sphereR);
          const sx = cx + x1 * scale;
          const sy = cy + y2 * scale;

          const depthNorm = (sphereR - z2) / (2 * sphereR);
          const alpha = (0.14 + 0.72 * depthNorm) * p.bandBoost;
          const dotSize = p.size * (0.65 + 0.55 * depthNorm);

          ctx.beginPath();
          ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
          if (depthNorm > 0.68) {
            ctx.fillStyle = `rgba(147, 221, 255, ${alpha.toFixed(3)})`;
          } else {
            ctx.fillStyle = `rgba(14, 155, 240, ${alpha.toFixed(3)})`;
          }
          ctx.fill();
        }

        for (let s = 0; s < 16; s++) {
          const sp = ORBITAL_SPARKS[s];
          const a = sp.angle + t * sp.speed * 0.45;
          const r = sphereR * (1.22 + (s % 5) * 0.16);
          const sx = cx + Math.cos(a) * r;
          const sy = cy + Math.sin(a) * r * 0.88;
          const tw = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + sp.phase));
          ctx.beginPath();
          ctx.arc(sx, sy, sp.size * 0.85, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(224, 242, 254, ${tw.toFixed(3)})`;
          ctx.fill();
        }

        ctx.restore();
      }

      // =========================================================================
      // INTERMITTENT INDUSTRIAL HUD GLITCH PASS (Exclusively during THINKING)
      // =========================================================================
      if (curStatus === JarvisStatus.THINKING && standbyMix < 0.2) {
        const thinkElapsed = Math.max(0, (now - thinkingStartAt) * 0.001);
        const fract = (v: number) => v - Math.floor(v);
        const hash = (n: number) => fract(Math.sin(n * 127.1) * 43758.5453123);

        const initPulse =
          thinkElapsed >= 0.04 && thinkElapsed <= 0.22 ? 0.9 : 0;
        const slot = Math.floor(t * 7.5);
        const subTick = Math.floor(t * 28.0);
        const periodicBurst =
          hash(slot * 19.37) > 0.79 && hash(subTick * 7.13) > 0.32 ? 1 : 0;
        const burst = Math.max(initPulse, periodicBurst);

        if (burst > 0.05) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          ctx.save();
          // Draw 3 crisp horizontal slice displacements across the HUD core & bezel
          for (let s = 0; s < 3; s++) {
            const seed = subTick * 13.7 + s * 31.1;
            const bandNorm = (hash(seed) - 0.5) * 2.2;
            const sliceYCss =
              s === 0 && hash(seed + 4.2) > 0.55
                ? 14
                : cy + bandNorm * baseR * 1.18;
            const sliceHCss = 4 + Math.floor(hash(seed + 1.9) * 11);
            const shiftXCss = (hash(seed + 8.3) - 0.5) * 16 * burst;

            const sy = Math.max(0, Math.floor(sliceYCss * dpr));
            const sh = Math.min(
              canvas.height - sy,
              Math.max(2, Math.floor(sliceHCss * dpr))
            );
            if (sh > 1 && sy + sh < canvas.height) {
              ctx.drawImage(
                canvas,
                0,
                sy,
                canvas.width,
                sh,
                shiftXCss,
                sliceYCss,
                w,
                sliceHCss
              );

              // Subtle industrial cyan sync hairline on the displaced slice edge
              ctx.fillStyle = `rgba(56, 189, 248, ${(0.22 * burst).toFixed(3)})`;
              ctx.fillRect(
                Math.max(0, cx - baseR * 1.75 + shiftXCss),
                sliceYCss,
                baseR * 3.5,
                1
              );
            }
          }
          ctx.restore();
        }
      }

      animId = window.requestAnimationFrame(render);
    };

    animId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const isStandby = viewMode === ViewMode.STANDBY;
  const isWaking = viewMode === ViewMode.WAKING;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <HudGlitchShader status={status} viewMode={viewMode} />

      {/* Semantic Interactive Core Anchor */}
      <button
        type="button"
        onClick={onCoreClick}
        aria-label={
          isStandby
            ? 'Despertar J.A.R.V.I.S.'
            : status === JarvisStatus.LISTENING
              ? 'Pausar escuta do J.A.R.V.I.S.'
              : 'Falar com J.A.R.V.I.S.'
        }
        className={`group fixed left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 transition-all duration-500 ${
          isStandby
            ? 'top-[40%] w-44 h-44'
            : elevated
              ? 'top-[23.5%] w-36 h-36'
              : 'top-[48.5%] w-52 h-52'
        }`}
      >
        <span
          className={`font-display font-semibold tracking-[0.28em] pl-[0.28em] text-slate-50 select-none transition-all duration-300 ${
            isStandby
              ? 'text-base sm:text-lg opacity-95 drop-shadow-[0_0_10px_rgba(125,211,252,0.55)]'
              : isWaking
                ? 'text-lg sm:text-xl opacity-0 scale-95'
                : elevated
                  ? 'text-sm sm:text-base opacity-100 scale-95 drop-shadow-[0_0_14px_rgba(186,230,253,0.65)] group-hover:text-sky-100'
                  : 'text-lg sm:text-[21px] opacity-100 scale-100 drop-shadow-[0_0_14px_rgba(186,230,253,0.65)] group-hover:text-sky-100'
          }`}
        >
          JARVIS
        </span>
      </button>

      {/* Standby Digital Clock & Portuguese Date Overlay */}
      <div
        className={`fixed left-1/2 top-[63.5%] -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center pointer-events-none transition-all duration-500 ${
          isStandby ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        <div className="font-mono-tech text-3xl sm:text-[38px] font-semibold tracking-[0.16em] pl-[0.16em] text-slate-100 drop-shadow-[0_0_16px_rgba(186,230,253,0.22)] whitespace-nowrap">
          {clock.time}
        </div>
        <div className="mt-2 text-[10px] sm:text-[11px] font-medium tracking-[0.24em] pl-[0.24em] text-slate-400 whitespace-nowrap">
          {clock.dateStr}
        </div>
      </div>
    </div>
  );
};
