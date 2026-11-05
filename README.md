# ARES — reparto de encomiendas (Dashund)

App del conductor (APK Android o PWA) + panel del jefe. Next.js 16.4 + Supabase, en Vercel.

```bash
npm install
cp .env.example .env.local   # completar con el proyecto de Supabase y las claves
npm run dev
```

- Cómo trabajar en el repo (stack, comandos, convenciones, reglas, verificación): `AGENTS.md`.
- Estado del proyecto y decisiones recientes: `MEMORY.md` (local; no se versiona).
- Ramas: `main` es producción; cada feature va en su rama (ver `AGENTS.md`).
- El flujo del conductor: `AGENTS.md` · sistema, datos y acceso: `docs/ARQUITECTURA.md` · tipos y módulos:
  `docs/CLASES.md` · prioridades: `docs/HOJA-DE-RUTA.md` · privacidad: `docs/PRIVACIDAD.md` ·
  WhatsApp: `docs/WHATSAPP.md` · features pendientes: `specs/README.md`.
- APK: se instala pasando el archivo al teléfono y permitiendo "instalar apps desconocidas". Firma
  y secretos de GitHub: `specs/015-app-android/quickstart.md`.
- Base: las migraciones de `supabase/migrations/` se corren en orden (detalle en
  `docs/ARQUITECTURA.md` §2).
