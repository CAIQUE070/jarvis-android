// Browser-native Edge neural TTS transport adapted from the MIT-licensed
// `msedge-tts` package, using only WebSocket and Web Crypto APIs.
const EDGE_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const EDGE_TTS_OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const EDGE_TTS_VERSION = '2-143.0.3650.96';
const EDGE_COPYRIGHT = 'Copyright (C) Microsoft Corporation. All rights reserved.';

const EDGE_VOICE_FALLBACKS = [
  'en-US-BrianMultilingualNeural',
  'en-AU-WilliamMultilingualNeural',
  'pt-BR-AntonioNeural',
];

interface EdgeChecksumMultipliers {
  swappedWord: number;
  swappedSum: number;
  swappedProduct: number;
}

const SWAP_FIRST_WORD: EdgeChecksumMultipliers = {
  swappedWord: 0xef0569fb,
  swappedSum: 0x76f50f34,
  swappedProduct: 0xc3efea97,
};

const SWAP_SECOND_WORD: EdgeChecksumMultipliers = {
  swappedWord: 0xc31713db,
  swappedSum: 0x1881ce3c,
  swappedProduct: 0x35bd1ec9,
};

const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

function swapHalves(value: number): number {
  const normalized = value >>> 0;
  return ((normalized << 16) | (normalized >>> 16)) >>> 0;
}

function swapTerm(
  word: number,
  key: number,
  multipliers: EdgeChecksumMultipliers
): number {
  const sum = (
    Math.imul(word, key) +
    Math.imul(swapHalves(word), multipliers.swappedWord)
  ) >>> 0;
  const product = Math.imul(swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (
    Math.imul(swapHalves(product), multipliers.swappedProduct) + product
  ) >>> 0;
}

function swapAndMultiply(
  value: number,
  key: number,
  multipliers: number[]
): number {
  let result = Math.imul(value, key) >>> 0;
  for (const multiplier of multipliers) {
    result = Math.imul(swapHalves(result), multiplier) >>> 0;
  }
  return result;
}

function createEdgeChecksum(message: Uint8Array, digest: Uint8Array): Uint8Array {
  const digestView = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength
  );
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
  const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
  padded.set(message);

  const words = new DataView(padded.buffer);
  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;

  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = words.getUint32(offset, true);
    const secondWord = words.getUint32(offset + 4, true);
    const firstSwap = swapTerm(firstWord, firstKey, SWAP_FIRST_WORD);
    lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
    swapSum = (swapSum + firstSwap + lastSwap) >>> 0;
    mix = swapAndMultiply((mix + firstWord) >>> 0, firstKey, MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = swapAndMultiply((mix + secondWord) >>> 0, secondKey, MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }

  const checksum = new Uint8Array(8);
  const checksumView = new DataView(checksum.buffer);
  checksumView.setUint32(0, (lastSwap ^ mix) >>> 0, true);
  checksumView.setUint32(4, (swapSum ^ mixSum) >>> 0, true);
  return checksum;
}

function toUpperHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function generateEdgeSecurityToken(): Promise<string> {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const roundedTicks = ticks - (ticks % 300);
  const windowsTicks = roundedTicks * 10000000;
  const message = new TextEncoder().encode(
    `${EDGE_COPYRIGHT}${windowsTicks}${EDGE_TRUSTED_CLIENT_TOKEN}`
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', message)
  );
  const checksum = createEdgeChecksum(message, digest);
  return `${toUpperHex(checksum)}-${toUpperHex(digest)}`;
}

function createRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toUpperHex(bytes).toLowerCase();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;')
    .replace(/'/g, '&' + 'apos;');
}

function inferVoiceLocale(voice: string): string {
  return voice.match(/\b[a-z]{2,}-[A-Z]{2}\b/)?.[0] || 'en-US';
}

function createSpeechConfiguration(): string {
  return [
    'Content-Type:application/json; charset=utf-8',
    'Path:speech.config',
    '',
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'false',
            },
            outputFormat: EDGE_TTS_OUTPUT_FORMAT,
          },
        },
      },
    }),
  ].join('\r\n');
}

function createSsmlRequest(
  requestId: string,
  text: string,
  voice: string,
  rate: number,
  pitchHz: number
): string {
  const clampedRate = Math.max(0.75, Math.min(1.35, rate));
  const clampedPitch = Math.max(-15, Math.min(10, Math.round(pitchHz)));
  const pitch = `${clampedPitch >= 0 ? '+' : ''}${clampedPitch}Hz`;
  const ssml = [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"',
    ` xmlns:mstts="https://www.microsoft.com/2001/mstts" xml:lang="${inferVoiceLocale(voice)}">`,
    `<voice name="${escapeXml(voice)}">`,
    `<prosody pitch="${pitch}" rate="${clampedRate}" volume="100">`,
    escapeXml(text),
    '</prosody>',
    '</voice>',
    '</speak>',
  ].join('');

  return [
    `X-RequestId:${requestId}`,
    'Content-Type:application/ssml+xml',
    'Path:ssml',
    '',
    ssml,
  ].join('\r\n');
}

function findAudioPayload(bytes: Uint8Array): Uint8Array | null {
  const delimiter = new TextEncoder().encode('Path:audio\r\n');
  for (let index = 0; index <= bytes.length - delimiter.length; index++) {
    let matches = true;
    for (let offset = 0; offset < delimiter.length; offset++) {
      if (bytes[index + offset] !== delimiter[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return bytes.slice(index + delimiter.length);
    }
  }
  return null;
}

function concatAudioChunks(chunks: Uint8Array[]): ArrayBuffer {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output.buffer;
}

async function synthesizeWithEdgeVoice(
  text: string,
  voice: string,
  rate: number,
  pitchHz: number
): Promise<ArrayBuffer> {
  const securityToken = await generateEdgeSecurityToken();
  const requestId = createRequestId();
  const endpoint = new URL(EDGE_TTS_URL);
  endpoint.searchParams.set('TrustedClientToken', EDGE_TRUSTED_CLIENT_TOKEN);
  endpoint.searchParams.set('Sec-MS-GEC', securityToken);
  endpoint.searchParams.set('Sec-MS-GEC-Version', EDGE_TTS_VERSION);
  endpoint.searchParams.set('ConnectionId', requestId);

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const socket = new WebSocket(endpoint.toString());
    const audioChunks: Uint8Array[] = [];
    let settled = false;
    let synthesisTimer: number | null = null;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (synthesisTimer !== null) {
        window.clearTimeout(synthesisTimer);
      }
      try {
        socket.close();
      } catch {
        // Ignore socket close errors.
      }
      if (error) {
        reject(error);
      } else {
        resolve(concatAudioChunks(audioChunks));
      }
    };

    synthesisTimer = window.setTimeout(() => {
      finish(new Error('Tempo limite da síntese neural no dispositivo.'));
    }, 15000);

    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      socket.send(createSpeechConfiguration());
      socket.send(
        createSsmlRequest(requestId, text, voice, rate, pitchHz)
      );
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          finish();
        } else if (
          event.data.includes('Path:response') &&
          event.data.includes('"error"')
        ) {
          finish(new Error('O serviço Edge TTS recusou a síntese.'));
        }
        return;
      }

      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const payload = findAudioPayload(bytes);
      if (payload && payload.length > 0) {
        audioChunks.push(payload);
      }
    };

    socket.onerror = () => {
      finish(new Error('Falha na conexão Edge TTS do dispositivo.'));
    };

    socket.onclose = () => {
      if (!settled) {
        finish(new Error('A conexão Edge TTS foi encerrada antes do áudio.'));
      }
    };
  });
}

export function canUseDirectEdgeNeuralTts(): boolean {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return false;
  }
  if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
    return false;
  }
  return /\bEdg\//.test(window.navigator.userAgent);
}

export async function synthesizeDirectEdgeNeuralTts(
  text: string,
  voice: string,
  rate: number,
  pitchHz: number
): Promise<ArrayBuffer> {
  const fallbackVoice =
    voice === 'pt-BR-AntonioNeural'
      ? EDGE_VOICE_FALLBACKS[0]
      : 'pt-BR-AntonioNeural';
  const candidates = [voice, fallbackVoice].filter(
    (candidate, index, list) => list.indexOf(candidate) === index
  );
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      return await synthesizeWithEdgeVoice(text, candidate, rate, pitchHz);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Síntese neural indisponível no dispositivo.');
}
