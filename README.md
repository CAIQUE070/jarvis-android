# J.A.R.V.I.S. — Assistente Pessoal (PT-BR + Groq + TTS Neural Gratuito)

Réplica interativa fiel da interface holográfica do J.A.R.V.I.S. (com o núcleo reativo à voz em tempo real, grade técnica e modo descanso com globo de partículas 3D e relógio digital), projetada para rodar localmente no seu PC com **custo zero**.

## Arquitetura 100% Gratuita (Local no PC)

1. **Cérebro LLM (Groq Gratuito)**:
   - Conecta nativamente à API gratuita da Groq (`llama-3.3-70b-versatile` ou `llama-3.1-8b-instant`) com latência ultrarrápida.
   - Também suporta modelos locais offline via Ollama (`OLLAMA_BASE_URL`).
2. **Voz Idêntica ao J.A.R.V.I.S. em Português Brasileiro (Sem Custo)**:
   - Síntese neural local no servidor Node.js via `msedge-tts` (`pt-BR-AntonioNeural`) — sem necessidade de chaves pagas.
   - Cadeia de processamento acústico em tempo real via **Web Audio API (DSP)**: equalização barítono, clareza de estúdio, micro-reflexão espacial estilo capacete Stark e análise espectral FFT sincronizada a 60 FPS com o anel luminoso.
3. **Reconhecimento de Voz em Português (`pt-BR`)**:
   - Escuta por microfone via Web Speech API nativa do navegador (com opção de escuta contínua sem as mãos) e suporte automático ao `whisper-large-v3-turbo` da Groq.

## Como Rodar no Seu PC

1. Instale o **Node.js 20+** no seu computador.
2. Na pasta do projeto, instale as dependências:
   ```bash
   npm install
   ```
3. Copie o arquivo `.env.example` para `.env` e adicione sua chave gratuita obtida no painel da Groq.
4. Inicie o assistente:
   ```bash
   npm run dev
   ```
5. Abra `http://localhost:3000` no Chrome ou Edge (em tela cheia `F11` fica idêntico ao monitor do vídeo).
