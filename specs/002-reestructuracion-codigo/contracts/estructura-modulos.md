# Contrato: estructura de módulos

Lo hace cumplir `pruebas/arquitectura.test.mjs`. Si una regla cambia, cambian juntos este
archivo, la prueba y la constitución (Architecture Rules).

| ID | Regla |
|---|---|
| A1 | `src/lib/**` no importa `src/app/**` ni `src/components/**` |
| A2 | `src/components/**` no importa `src/app/**` |
| A3 | `src/components/ui/**` solo importa `react`, `lucide-react`, `next/*`, `@/lib/comun/*` y `ui/*` |
| A4 | Nada del servidor importa `src/lib/encomiendas/local/**` (servidor = `route.ts`, actions, `"use server"`, `page`/`layout` sin `"use client"`, y lo que importe `server-only`) |
| A5 | Llevan `import "server-only"`: `lib/supabase/{server,admin}`, `lib/auth/{sesion,api-conductor}`, `lib/whatsapp/meta`, `lib/comun/periodo-servidor` y todo módulo nuevo que lea un secreto (p. ej. `lib/encomiendas/lectura/servidor.ts`, spec 005) |
| A6 | Primer nivel de `src/lib`: solo las carpetas de dominio |
| A7 | Ningún archivo de `src/` > 400 líneas salvo excepciones de `plan.md` |
| A8 | "chofer" no aparece en `src/`, `pruebas/`, `mcp/` salvo excepciones de FR-012 |
| A9 | Sin ciclos de importación entre carpetas de `lib/` |
| A10 | Todo dominio externo contactado figura en `docs/PRIVACIDAD.md` (spec 007) |

**Activación gradual**: la prueba nace con listas de excepciones del estado actual; cada
tarea que mueve o divide un archivo borra su excepción. Termina con A1–A7, A9, A10 sin
excepciones y A8 solo con las permanentes.
