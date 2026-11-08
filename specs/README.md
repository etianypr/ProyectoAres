# Specs: features pendientes

**Todo lo que falta desarrollar está aquí**, una carpeta por feature (`NNN-nombre/`). Lo que no
tiene carpeta no está pendiente: o está hecho (resumen en `docs/HOJA-DE-RUTA.md`) o nadie lo ha
pedido. Un *Pendiente* en `AGENTS.md` apunta a su carpeta.

- Una carpeta crece así: `spec.md` (qué y por qué; un borrador alcanza para anotarla) → `plan.md`
  (+ `research`, `data-model`, `contracts`, `quickstart`) → `tasks.md`.
- Reglas: `.specify/memory/constitution.md`. Orden: `docs/HOJA-DE-RUTA.md`.
- Spec Kit en Claude Code: `/speckit-specify` (crea la carpeta aquí), `/speckit-clarify`,
  `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze` y `/speckit-implement`.

**Próximo número: 029.**

## Índice

Estados: borrador → definida → en curso → hecha (falta día real) · postergada.

### App del conductor (prioridad, 2026-11-05)

| Feature | Qué | Estado | Rama | Tareas | Abierto |
|---|---|---|---|---|---|
| [020](020-burbuja-google-maps/spec.md) burbuja de Google Maps | la ruta en ARES, la guía en Google Maps con la burbuja encima | hecha (falta APK 1.5.0 y día real) | — (en `main` desde 2026-11-06) | 16/19 | APK 1.5.0 firmada (tag `apk-v1.5.0`) e instalada con el día cerrado; el dueño sube `APK_VERSION_MINIMA`; día real (T019) |
| [019](019-sin-mapbox/spec.md) sin Mapbox | ORS, MapLibre y OpenFreeMap (Liberty); Google da el número de casa | hecha (falta día real) | — (en `main` desde 2026-11-06) | 13/16 | el dueño borra el token de Mapbox en Vercel (T013); sin tope de Google, decisión del dueño (T012); día real (T014) |
| [021](021-lector-etiquetas/spec.md) lector de etiquetas | la foto de la etiqueta se lee solo en el teléfono (ML Kit + lector Starken), sin IA: US$0 y ningún dato sale del teléfono | en curso | `021-lector-etiquetas` | 10/13 | el dueño prueba el escaneo completo con la 028 y pasan juntas a `main`; terreno (T012) y `LECTURA_MODELO` en Vercel (T013) |
| [028](028-escaner-en-vivo/spec.md) escáner en vivo | al cargar el auto, la cámara queda abierta: cada etiqueta vibra y muestra su parada, sin toques; código y texto con ML Kit en el teléfono | en curso | `028-escaner-en-vivo` (sale de la 021) | — | medir primero si ML Kit lee la letra chica en vivo; toca `android/` (APK 1.6.0, permiso `CAMERA`); pasa a `main` junto con la 021 |
| [027](027-hoja-por-paso/spec.md) la hoja paso por paso | la cabecera de la hoja dice el paso del día que toca (guía, ⚠, ruta, cargar el auto, recorrer, cerrar) y adentro va solo lo de ese paso | hecha (falta día real) | — (en `main` desde 2026-11-06) | 15/16 | día real en la APK (T016); usa `Ruta.inicioReparto` (campo opcional, sin subir idb) |
| [022](022-pedidos-con-problemas/spec.md) pedidos con ⚠ | el ⚠ queda en el pedido (`Pedido.problemas`), la dirección en duda entra a la ruta con su primera opción y se avisa dos paradas antes; la OF de otro largo deja de ser ⚠ | hecha (falta día real) | — (en `main` desde 2026-11-06) | 11/12 | la línea de la burbuja y un día real en la APK (T012) |
| [023](023-paradas-cercanas/spec.md) paradas cercanas | en cada parada, las paradas que quedan cerca | borrador | — | — | ¿va dentro de la 020? qué es «cerca» |
| [024](024-criterios-de-ruta/spec.md) criterios de ruta | bultos fuera antes (≤ 1 % de km) e «Invertir orden de ruta», hechos; faltan tiempo, éxito por parada y ganancia | en curso (bultos e invertir en `main` desde 2026-11-07) | `024-criterios-de-ruta` | 7/9 | día real con trazados (T009); cupo de trazados de ORS y aviso «Sin señal» engañoso; cómo pesan tiempo, éxito y ganancia |
| [025](025-referencias-en-direcciones/spec.md) referencias en direcciones | se ubica por la calle con número; «con…», «frente a…» quedan para el conductor | borrador | — | — | dónde se guarda la referencia |
| [026](026-guardado-persistente/spec.md) guardado persistente | pedir que el teléfono no borre IndexedDB (el día y la `cola`) por falta de espacio | borrador | — | — | medir en la APK si la WebView desaloja y si `persist()` responde |
| [015](015-app-android/spec.md) app Android (APK) | llamar con un toque (sin resultado automático desde la 020), abrir sin señal, pantalla encendida, escáner | en curso | — | 27/30 | probar llamadas con chip (T019) |
| [016](016-ubicar-direcciones/spec.md) ubicar direcciones | tipeo de la guía y calles cortas sin numerar | en curso (Google conectado) | — | 11/13 | clave de Google y prueba de un día real |
| [017](017-listo-para-terreno/spec.md) listo para terreno | errores del flujo, rutas por calle y con horarios | en curso | — | 25/27 | prueba en terreno (T051) |
| [018](018-corregir-direcciones-ia/spec.md) corregir direcciones con IA | las «Sin ubicar» se corrigen con los buscadores y el catálogo de calles | hecha (falta día real) | — | 9/10 | probar con una guía real |
| [005](005-carga-rapida-pedidos/spec.md) carga rápida | guía → ruta → escaneo de etiqueta | en curso (falta terreno) | — | 32/34 | ≥ 50 etiquetas reales (T030, junto con la 021) y quickstart (T031) |
| [003](003-referencia-paquete/spec.md) OF y referencia del paquete | OF y descripción en cada parada, búsqueda por OF | hecha (falta día real) | — | 15/16 | foto con la cámara y SC-001 en terreno |

### Base, cumplimiento, panel y pagos

| Feature | Qué | Estado | Rama | Tareas | Abierto |
|---|---|---|---|---|---|
| [002](002-reestructuracion-codigo/spec.md) reestructuración | `lib/` por dominio, archivos chicos, nombres del glosario | en curso | — | 45/51 | tablas `encomienda_*` (T049–T051, con aprobación); partir `pedido-form-local` (T042); quickstart (T047) |
| [007](007-cumplimiento-datos/spec.md) cumplimiento | borrado diario, no entregados, modo piloto/oficial | en curso (MVP hecho) | — | 13/20 | modo piloto/oficial (P3) y plantillas (con la 004) |
| [006](006-indicadores-negocio/spec.md) indicadores | entregas sobre asignado, contactados, rendimiento, margen, bono | hecha (falta quickstart) | — | 14/15 | — |

### Fase WhatsApp (postergada hasta tener el chip)

| Feature | Qué | Estado | Rama | Tareas | Abierto |
|---|---|---|---|---|---|
| [004](004-menos-visitas-fallidas/spec.md) menos visitas fallidas | WhatsApp propio, «voy llegando» | postergada | — | 0/21 | — |
| [014](014-horario-conveniente/spec.md) ¿conviene ir al pedido con horario? | al tocarle el turno, ir, dejar para después o descartar | borrador | — | — | — |

**Hechas:** 001 (asistencia de ruta) y 008 a 013. Lo que decidieron está en `docs/` (resumen en
`docs/HOJA-DE-RUTA.md`, modelo en `docs/CLASES.md`, WhatsApp en `docs/WHATSAPP.md`). Sus carpetas se
borraron y siguen en el historial de git.

## Cómo se trabaja: una rama por feature

1. **Anotar en `main`.** Se crea la carpeta `NNN-nombre/` con su `spec.md` (un borrador alcanza),
   se agrega su fila aquí y se sube el «Próximo número». Así el número queda reservado y dos ramas
   no toman el mismo.
2. **Empezar.** La rama sale de `main` y se llama igual que la carpeta. Después, aquí, en `main`:
   estado «en curso» y el nombre de la rama.
   ```powershell
   git switch main; git pull
   git switch -c NNN-nombre
   ```
3. **Trabajar en la rama:**
   - En la rama se tocan la carpeta de la feature y el código. **Este índice se edita solo en
     `main`**, para que dos ramas no choquen aquí.
   - Para traer lo nuevo de `main`: `git merge main`.
   - Cada push publica un preview en Vercel.
   - Spec Kit busca la feature activa en `.specify/feature.json`, un archivo local que no se versiona.
     `/speckit-specify` lo escribe; si se retoma otra feature, se cambia a mano
     (`{ "feature_directory": "specs/NNN-nombre" }`).
4. **Terminar.** Se corre la verificación de `AGENTS.md`, el dueño aprueba y se une a `main`. Un push
   a `main` publica en producción: hacerlo con el día cerrado y la cola enviada. En ese mismo cambio
   se borra la carpeta, se escribe su resumen en `docs/HOJA-DE-RUTA.md` y se quita su fila de aquí.
5. **Varias a la vez.** Cada una va en su rama. Lo que se comparte se reserva primero aquí, en
   `main`, anotándolo en la fila de la feature (por ejemplo «usa idb v6» o «migración 0008»): ver
   «Reglas compartidas».

Commits y push: se pregunta antes (`AGENTS.md`, «Límites»).

**Volver atrás una feature.** Cada una entra a `main` con su propio merge (`git merge --no-ff`),
así que se puede deshacer entera sin tocar las demás: `git revert -m 1 <commit del merge>`
(`git log --merges --oneline` los lista). Si cambió `android/`, deshacerla también pide una APK.

## Reglas compartidas entre features

- **Base local (IndexedDB):** cada feature que agrega un store sube a la **siguiente versión libre**
  de `idb.ts` (hoy v5, la libre es la v6). Si el store tiene datos de destinatarios, se registra en
  `STORES_DEL_DIA` (lo borra el cierre del día, spec 007).
- **Migraciones SQL:** cada una toma el **siguiente número libre** de `supabase/migrations/` (hoy
  0008).
- **Reserva entre ramas:** la versión de `idb.ts` y el número de migración se anotan en la fila de la
  feature, en `main`, antes de usarlos. La siguiente rama toma el número que sigue.
- **Rutas de archivos:** las tareas asumen la estructura de la 002 (Fases 1–2 + US1).
- **Cruces:**
  - OF y referencia del paquete → 003.
  - Borrado y lista «No entregados» → 007.
  - Teléfono del receptor → 005 (lo usa la 004).
  - Asignados del día → 005 (lo usa la 006).
  - Etiqueta leída en el teléfono → 021 (cambia la 005). Escáner en vivo → 028 (usa el lector de
    la 021).
