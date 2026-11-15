# Sincronização J.A.R.V.I.S. — PC ↔ Android

## Pastas

- **Projeto principal (PC):** `C:\Users\CAIQUE FONSECA\Desktop\Area de Trabalho\jarvis-local-assistant`
- **Cópia para Android:** `C:\Users\CAIQUE FONSECA\Desktop\Area de Trabalho\jarvis-android`

O projeto do PC é a **versão principal**. A pasta Android recebe as mesmas alterações de interface, recursos e comportamento.

## Sincronizar manualmente

A partir da pasta do PC, execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\sync-android.ps1"
```

O script atualiza principalmente:

- `src/`
- `public/`
- `index.html`
- arquivos de configuração do Vite/TypeScript
- `server.ts`
- `.env.example`

Por segurança, `package.json` e os lockfiles são preservados na pasta Android por padrão. Isso impede que uma sincronização sobrescreva dependências ou comandos específicos do projeto Android. Quando uma mudança no PC exigir novas dependências, sincronize também os manifests de forma consciente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\sync-android.ps1" -UpdatePackageFiles
```

> Antes de usar `-UpdatePackageFiles`, confira as dependências Android já adicionadas à pasta `jarvis-android`.

## Arquivos deliberadamente não copiados

- `.env.local` — pode conter chaves ou credenciais
- `node_modules/` — dependências instaladas, não código-fonte
- `dist/` — build gerado
- `.aistudio/` e `.gmp_cache/` — cache local

Use `.env.example` como modelo. Nunca envie chaves reais para um repositório ou compartilhamento público.

## Regra para as próximas alterações

Ao pedir uma alteração do J.A.R.V.I.S., a mesma mudança compatível será aplicada nas duas pastas:

1. `jarvis-local-assistant` (PC)
2. `jarvis-android` (celular)

Configurações exclusivas do Android — como `android/`, recursos nativos, permissões e Identidade de Aplicação — devem ser preservadas. Depois da sincronização, valide a versão PC com o lint/build e valide a compilação Android separadamente.

## Preparar e validar a cópia Android

```powershell
cd "C:\Users\CAIQUE FONSECA\Desktop\Area de Trabalho\jarvis-android"
npm install
npm run lint
npm run build
```

O próximo passo do build Android é configurar a pasta nativa e a ponte entre o WebView e os recursos do aparelho (microfone, permissões e voz).
