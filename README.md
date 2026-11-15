# J.A.R.V.I.S. — Assistente Pessoal (PT-BR + Groq + TTS Neural Gratuito)

Réplica interativa da interface holográfica do J.A.R.V.I.S., com núcleo reativo à voz, grade técnica, modo descanso com globo de partículas 3D e relógio digital. O projeto possui build web para PC e build Android nativo via Capacitor.

## Arquitetura gratuita

1. **Cérebro LLM (Groq/Ollama)**:
   - Groq (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant` e outros modelos configuráveis).
   - Ollama local opcional via `OLLAMA_BASE_URL`.
2. **Voz neural idêntica no PC e no Android**:
   - **Brian Multilingual** (`en-US-BrianMultilingualNeural`) é a voz padrão barítona do JARVIS.
   - No PC, a síntese passa pelo servidor Node.js com `msedge-tts`.
   - No APK Android, a mesma voz Edge neural é sintetizada diretamente pelo WebView seguro, sem usar as vozes nativas defeituosas do Android.
   - DSP de estúdio via Web Audio API: equalização barítona, presença, compressão, saturação e análise FFT reativa.
3. **Reconhecimento de voz em português**:
   - Web Speech API no navegador e fallback para `whisper-large-v3-turbo` da Groq.

## Rodar no PC

1. Instale o **Node.js 20+**.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Copie `.env.example` para `.env` e configure a chave Groq, quando desejado.
4. Inicie o JARVIS:

   ```bash
   npm run dev
   ```

5. Abra `http://127.0.0.1:3000`.

## Build Android

### APK pronto para instalar

- **Download:** [J.A.R.V.I.S. Android v1.0.0](https://github.com/CAIQUE070/jarvis-android/releases/download/v1.0.0/jarvis-android-v1.0.0-debug.apk)

O APK exige internet para a voz neural Edge. As vozes padrão do sistema Android nunca são utilizadas para a fala do JARVIS.

### GitHub Actions

Quando o GitHub Actions está disponível na conta, cada push na branch `main` executa o workflow `Build Android APK`. Após a conclusão:

1. Abra a aba **Actions** no repositório.
2. Selecione a execução mais recente.
3. Baixe o artefato `jarvis-android-debug`.
4. Instale o `app-debug.apk` no celular.

### Build local

Pré-requisitos:

- Node.js 20+
- Java/JDK 21
- Android SDK com o platform usado pelo projeto

Execute:

```bash
npm install
npm run android:build
```

O APK será gerado em:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Para sincronizar somente os assets web com o projeto nativo:

```bash
npm run android:sync
```

O cérebro LLM, transcrição via Groq e demais rotas `/api/jarvis/*` continuam sendo fornecidos pelo backend Node.js quando o aplicativo precisa acessá-los. A reprodução de voz no APK é neural, direta e independe do TTS nativo do Android.
