# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Dos cosas de este proyecto que sí conviene saber de entrada:

- El "middleware" de Next.js 16 se llama **Proxy** y vive en `src/proxy.ts`.
- El panel y la app del conductor son **dos grupos de rutas distintos**:
  `src/app/(app)` (escritorio, con sidebar) y `src/app/(conductor)` (teléfono,
  PWA instalable). No comparten layout a propósito.
