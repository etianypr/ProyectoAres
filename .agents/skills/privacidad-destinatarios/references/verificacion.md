# Cómo se verifica la privacidad, y qué queda sin cubrir

Léelo cuando vas a escribir o arreglar una prueba de privacidad, cuando una pasa en verde y
dudas de que proteja algo, o antes de confiar en el hook de commits.

## Comandos (sin red ni base; los 9 archivos de abajo dieron 101 pruebas en verde el 2026-11-05)
```powershell
node --import ./pruebas/registrar.mjs --test pruebas/privacidad.test.mjs pruebas/arquitectura.test.mjs
node --import ./pruebas/registrar.mjs --test pruebas/4-envio.test.mjs pruebas/whatsapp-contract.test.mjs pruebas/lectura-servidor.test.mjs pruebas/vision.test.mjs pruebas/modo-prueba.test.mjs pruebas/idb-version.test.mjs pruebas/nativo-llamada.test.mjs
npm test; npm run lint; npm run build
```
`npm run test:base` y `npm run test:esquema` leen la base real (solo lectura): úsalos después de
una migración, no para privacidad.

## Qué protege cada prueba
| Prueba | Protege | No ve |
|---|---|---|
| `privacidad.test.mjs` | cerrar el día y cerrar sesión dejan vacíos los `STORES_DEL_DIA` y sin datos de persona lo que queda (`dias`, `cola`; lista `CAMPOS_DE_PERSONA`); la `cola` intacta; lo no entregado no pasa al día siguiente | solo los stores que la prueba llena: un store nuevo hay que llenarlo ahí |
| ídem, «ninguna tabla encomienda_*…» | columnas `nombre`, `telefono`, `direccion`, `of`, `destinatario*` en `create table` o `add column` de `encomienda_*` | otras tablas, columnas con otro nombre (`fono`, `receptor`), `jsonb` con datos adentro |
| ídem, «las rutas de API no escriben en el log» | `console.*` en `src/app/api/**` | `console.*` en `lib/**` que las rutas llaman, `throw` con datos que Next registra, logs del cliente |
| `arquitectura.test.mjs` A10 | todo `https://host` literal de `src/**/*.ts(x)` (sin comentarios) tiene su nombre en `PROVEEDORES` y ese nombre aparece en `docs/PRIVACIDAD.md` | proveedores por SDK (Anthropic), hosts armados con variables (Supabase), `android/`, `mcp/`, `scripts/`, `public/`; tampoco revisa que la fila diga los datos correctos ni que esté en §3 |
| `arquitectura.test.mjs` A5 | los módulos de `SERVER_ONLY` llevan `import "server-only"` | un módulo nuevo con secreto que no se sumó a la lista |
| `4-envio.test.mjs` | a `encomienda_actividad` van exactamente sus columnas; un evento viejo con `motivo` sale sin él | lo que mande otra tabla |
| `whatsapp-contract.test.mjs` | la plantilla lleva nombre y «cuándo», nada más; no sale dirección ni coordenadas; el token nunca en la URL ni en errores; la pausa no manda nada | Meta real |
| `lectura-servidor.test.mjs` · `vision.test.mjs` | qué sale a Anthropic y a Vision (doble de `fetch`, no gasta) | que la foto **no** salga: eso lo agrega la spec 021 (SC-001) |
| `modo-prueba.test.mjs` | encendido no manda cola ni día; salir borra pedidos, ruta y cola | fotos y direcciones a los proveedores, que salen igual |
| `idb-version.test.mjs` | subir de versión no pierde pedidos, ruta ni cola | — |
| `nativo-llamada.test.mjs` | «contestó» con ≥ 5 s, solo salientes después del toque | el plugin Java (no hay pruebas de `android/`) |
| `asistencia-local.test.mjs` | lee la migración 0003: la correlación no gana columnas del receptor | — |

Al escribir una prueba nueva:
- Importa el `src/` real y sustituye el proveedor reemplazando el `fetch` global.
- Afirma lo que **no** sale, no solo lo que sale: busca en el cuerpo enviado un nombre, un
  `+569` o una calle de los datos de prueba (modelo: «NO sale la dirección ni las coordenadas del
  pedido» en `whatsapp-contract`).
- Datos de prueba inventados (ver «Pruebas, fixtures, docs y specs» en el SKILL.md).

## El hook de commits (`.claude/hooks/revisar-commit.mjs`)
Registrado en `.claude/settings.json` como `PreToolUse` de `Bash|PowerShell`. Solo corre cuando
Claude Code hace el commit; un commit hecho a mano por el dueño no pasa por él.

Avisa (pide confirmación, **no bloquea**):
- Teléfonos móviles `+56 9 XXXX XXXX` (con o sin `+`, espacios o guiones). Toma como inventados
  los de 8 dígitos iguales, los que empiezan con `1234`, los que contienen `0000` y `87654321`:
  `+56912345678` pasa sin aviso.
- RUT con puntos (`12.345.678-9`); inventados los de dígitos iguales o que empiezan con `12345`.
- Correos, salvo `example.*`, `anthropic.com`, `users.noreply.github.com`, `.test`, `.invalid`,
  `localhost` y `git@`.
- Archivos: `.env*` (salvo `.env.example`), `*.keystore`, `*.jks`, `MEMORY.md` y fotos
  (`jpg`, `png`, `webp`, `heic`) dentro de `pruebas/` o `specs/`.
- Revisa lo agregado al índice (o todo lo que difiere de `HEAD` con `git add … &&` o `-a`), los
  archivos nuevos y el texto del comando, donde viaja el mensaje con `-m` o un heredoc.

No ve: direcciones, nombres, OF, teléfonos fijos o sin `56`, RUT sin puntos, fotos fuera de
`pruebas/`/`specs/`, ni el mensaje que viene en un archivo (`git commit -F`). Por eso el diff y el
mensaje se leen siempre a mano antes de commitear.
