import React, { useEffect, useRef } from 'react';
import { JarvisStatus, ViewMode } from '../types/jarvis';

interface HudGlitchShaderProps {
  status: JarvisStatus;
  viewMode: ViewMode;
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision highp float;
  varying vec2 v_uv;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_thinking_time;
  uniform float u_active;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Intermittent burst envelope: mostly 0.0, spikes briefly during THINKING
  float computeIntermittentBurst(float t, float thinkElapsed) {
    // Initial brief handshake pulse right as THINKING starts (0.06s - 0.20s)
    float initPulse = smoothstep(0.04, 0.08, thinkElapsed) * (1.0 - smoothstep(0.16, 0.24, thinkElapsed));

    // Occasional irregular industrial bursts (~12-16% duty cycle)
    float slot = floor(t * 7.5);
    float slotRand = hash11(slot * 19.37);
    float subTick = floor(t * 28.0);
    float microFlicker = step(0.32, hash11(subTick * 7.13));

    float periodicBurst = step(0.79, slotRand) * microFlicker;
    return clamp(max(initPulse * 0.9, periodicBurst), 0.0, 1.0);
  }

  void main() {
    if (u_active < 0.01) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float burst = computeIntermittentBurst(u_time, u_thinking_time) * u_active;
    if (burst < 0.01) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec2 fragCoord = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
    vec2 center = vec2(u_resolution.x * 0.5, u_resolution.y * 0.485);
    float minDim = min(u_resolution.x, u_resolution.y);
    float baseR = clamp(minDim * 0.138, 82.0, 112.0);

    // Quantized scanline coordinate
    float tick = floor(u_time * 24.0);
    float bandId = floor(fragCoord.y / 14.0);
    float bandHash = hash21(vec2(bandId, tick));

    // Horizontal slice displacement mask
    float activeSlice = step(0.84, bandHash) * burst;
    float shiftDir = (hash21(vec2(bandId + 11.0, tick)) - 0.5) * 2.0;
    float shiftPx = shiftDir * (6.0 + 14.0 * bandHash) * activeSlice;

    vec2 shiftedDelta = (fragCoord + vec2(shiftPx, 0.0)) - center;
    float dist = length(shiftedDelta);
    float rawDist = length(fragCoord - center);

    // 1. Chromatic Ghost Ring Fringes at Core & Outer Reticle Radii
    float coreRingBand = exp(- abs(dist - baseR) * 0.28) * activeSlice;
    float outerDotBand = exp(- abs(dist - baseR * 1.33) * 0.35) * activeSlice * 0.75;
    float reticleBand  = exp(- abs(dist - baseR * 1.66) * 0.42) * burst * 0.45;

    // 2. High-Frequency CRT / HUD Scanline Modulation
    float scanline = 0.5 + 0.5 * sin(fragCoord.y * 1.5707963);
    float thinLine = step(0.965, hash21(vec2(floor(fragCoord.y * 0.5), tick))) * burst;

    // Radial containment around the HUD center & top bezel so it feels architectural
    float radialMask = smoothstep(baseR * 2.45, baseR * 0.65, rawDist);
    float topBezelProximity = exp(-abs(fragCoord.y - 22.0) * 0.18) * step(abs(fragCoord.x - center.x), u_resolution.x * 0.42);

    // 3. Industrial Blueprint Grid Micro-Cells (52px grid step alignment)
    vec2 gridCell = floor((fragCoord - center) / 52.0);
    float cellNoise = hash21(gridCell + vec2(tick * 0.7, tick * 1.3));
    vec2 cellUv = fract((fragCoord - center) / 52.0);
    float cellBorder = step(0.94, max(cellUv.x, cellUv.y));
    float telemetryBlock = step(0.94, cellNoise) * radialMask * burst * (0.22 + 0.55 * cellBorder);

    // Combine industrial glitch luminance
    float ringGlitch = (coreRingBand + outerDotBand + reticleBand) * (0.45 + 0.55 * scanline);
    float scanSweep = thinLine * max(radialMask * 0.65, topBezelProximity * 0.85) * 0.38;

    float intensity = clamp(ringGlitch * 0.75 + scanSweep + telemetryBlock * 0.45, 0.0, 0.85);

    // Stark Industrial Cobalt / Ice-Blue / Cyan Chromatic Tint
    vec3 cobaltColor = vec3(0.015, 0.48, 1.0);   // Electric cobalt blue
    vec3 skyCyanColor = vec3(0.08, 0.72, 1.0);   // Vivid Stark cyan
    vec3 iceWhiteColor = vec3(0.88, 0.95, 1.0);   // #E0F2FE

    vec3 col = mix(cobaltColor, skyCyanColor, clamp(coreRingBand + scanline * 0.35, 0.0, 1.0));
    col = mix(col, iceWhiteColor, clamp(coreRingBand * 0.65 + thinLine * 0.4, 0.0, 1.0));

    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export const HudGlitchShader: React.FC<HudGlitchShaderProps> = ({ status, viewMode }) => {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<JarvisStatus>(status);
  const viewModeRef = useRef<ViewMode>(viewMode);
  const thinkingStartRef = useRef<number>(performance.now());

  useEffect(() => {
    if (status === JarvisStatus.THINKING && statusRef.current !== JarvisStatus.THINKING) {
      thinkingStartRef.current = performance.now();
    }
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
    });
    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    gl.useProgram(program);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uResLoc = gl.getUniformLocation(program, 'u_resolution');
    const uTimeLoc = gl.getUniformLocation(program, 'u_time');
    const uThinkTimeLoc = gl.getUniformLocation(program, 'u_thinking_time');
    const uActiveLoc = gl.getUniformLocation(program, 'u_active');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    let animId = 0;
    let activeMix = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const isThinking =
        statusRef.current === JarvisStatus.THINKING &&
        viewModeRef.current !== ViewMode.STANDBY;
      const targetActive = isThinking ? 1 : 0;
      activeMix += (targetActive - activeMix) * (1 - Math.exp(-14 * dt));

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (activeMix > 0.01) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const thinkElapsed = Math.max(0, (now - thinkingStartRef.current) * 0.001);

        gl.useProgram(program);
        gl.uniform2f(uResLoc, w, h);
        gl.uniform1f(uTimeLoc, now * 0.001);
        gl.uniform1f(uThinkTimeLoc, thinkElapsed);
        gl.uniform1f(uActiveLoc, activeMix);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      animId = window.requestAnimationFrame(render);
    };

    animId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={glCanvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-10 block w-full h-full mix-blend-screen"
    />
  );
};
