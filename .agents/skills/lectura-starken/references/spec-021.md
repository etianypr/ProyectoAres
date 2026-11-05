# Implementar la spec 021 (lector de etiquetas en el teléfono)

Lo que se decidió está en `specs/021-lector-etiquetas/spec.md`, el cómo en `plan.md` y el orden en
`tasks.md`. Este archivo **no** los repite: suma qué toca cada borrado y las trampas que no están
ahí. Estado al 2026-11-05: definida, 0/13, sin rama.

## Orden y bloqueos
1. **T001.** Crear la rama `021-lector-etiquetas` desde `main`. En `main`, la fila de
   `specs/README.md` pasa a «en curso» (el índice se edita solo en `main`).
2. **T002 bloquea el lector.** Hacen falta los ejemplos anonimizados del dueño.
   - Revísalos uno por uno antes de agregarlos: ningún nombre, teléfono, RUT ni dirección real.
     Ya se bloqueó un commit por eso (MEMORY 2026-10-28).
   - Si los ejemplos son fotos, el texto sale de «Probar etiqueta» (T009), así que T009 va antes.
3. **T003 antes que T004.** Las pruebas tienen que fallar contra el `leerEtiqueta` de hoy. Hoy ya
   falla, por ejemplo, el teléfono del remitente cuando va primero (ver `flujo-y-codigo.md` §5.3).
4. **T006 lleva maqueta primero**: ¿el selector de tres toques se abre solo después de la foto? Lo
   pide `AGENTS.md` («En cambios de diseño…»).
5. **T007 pide preguntar** antes de borrar `pruebas/descripcion-etiqueta.test.mjs` (Límites:
   borrar archivos).
6. **T013 es del dueño**: borrar `LECTURA_MODELO` en Vercel. El agente no toca las variables de
   Vercel.

## Qué se borra y quién lo usa hoy
| Símbolo | Vive en | Lo usan |
|---|---|---|
| `EtiquetaIA` | `lectura/esquemas.ts` | `contrato.ts` (tipo y re-export), `etiqueta.ts` (`etiquetaDesdeIA`), `servidor.ts` (`zodOutputFormat`, `parse`) |
| `etiquetaDesdeIA` | `lectura/etiqueta.ts` | `servidor.ts` |
| `conDescripcion`, `EtiquetaLeida` | `lectura/etiqueta.ts` | `local/lectura-cliente.ts`, `pruebas/descripcion-etiqueta.test.mjs` |
| `MODELO_POR_DEFECTO`, `LECTURA_MODELO`, `INSTRUCCIONES.etiqueta` | `lectura/servidor.ts` | `pruebas/lectura-servidor.test.mjs` (las de etiqueta y la del rechazo, que usa una etiqueta), `.env.example` |
| Variante `etiqueta` de `RespuestaLectura` | `lectura/contrato.ts` | `app/api/lectura/route.ts`, `lectura-cliente.ts` (`desdeIA`) |
| `leerImagen("etiqueta")` → `leerFotoEtiqueta` | `lectura-cliente.ts` | `resultado-escaneo.tsx` |
| Prop `lecturaIA` del escaneo | `page.tsx` → `pantalla.tsx` → `ventanas-pantalla.tsx` → `escanear-etiqueta.tsx` → `resultado-escaneo.tsx` | **Se queda** en `cargar-guia.tsx`, `pedidos-fuera.tsx` y `contenido-hoja.tsx` (guía y spec 018) |

**Lo que no se toca:**
- El camino de la guía: `leerFotosGuia`, `textoEnLaNube`, `guiaDesdeIA` y `faltanEnLaPrimera`.
- `TipoLectura` y `LADO_MAXIMO.etiqueta`, que siguen sirviendo para comprimir la foto.
- `etiquetaCompleta`, que no cambia.

## Trampas
- **Carpeta e import.** `etiqueta.ts` pasa a `lectura/etiqueta/index.ts` y `@/lib/encomiendas/lectura/etiqueta`
  tiene que seguir funcionando. El resolvedor de pruebas (`pruebas/resolver-ts.mjs`) prueba
  `.ts` antes que `/index.ts`: si quedan los dos, gana el archivo viejo y las pruebas pasan contra
  él. Hay que borrar `etiqueta.ts` en el mismo paso (T004).
- **Normalizar solo las palabras clave.** O↔0, I↔1 y S↔5 se aplican a la copia que se compara, nunca
  al valor. Si se aplican al valor, un nombre o un teléfono quedan cambiados.
- **Candidatos a teléfono.** Se excluyen los 26 dígitos que empiezan con 92, la OF impresa, un RUT y
  lo que va después de `$` (plan §3). En la zona del remitente nunca se elige uno.
- **SC-001.**
  - `/api/lectura` tiene que contestar 400 a `tipo=etiqueta` **sin llamar a Anthropic**. Hoy la ruta
    revisa la clave (503) antes que el tipo, así que conviene validar el tipo primero.
  - La ruta no tiene prueba propia: no hay un doble de la sesión (005, T012). La prueba va contra el
    adaptador o es una prueba estática.
  - Suma la prueba estática de `privacidad.test.mjs`: el camino de la etiqueta en
    `lectura-cliente.ts` no nombra `/api/lectura` ni `/api/texto`.
- **Botón de foto solo con `esApp()`.** En el navegador queda pegar el texto, que pasa por el mismo
  lector. Si cambia un botón, se cambia también `ayuda.tsx`.
- **Diagnóstico.** `conductor/diagnostico/page.tsx` tiene 215 líneas. «Probar etiqueta» va en un
  componente propio si la página pasa de ~400. No guarda nada. «Copiar anonimizado» no deja ni un
  dígito ni una palabra del valor original.
- **Plan B (§5)** solo entra si un fixture de ML Kit falla con el diccionario completo. Toca
  `android/`, así que se pregunta antes. Obliga a recompilar la APK (skill `apk-local`) y a subir
  `APK_VERSION_MINIMA`, que carga el dueño.
- **Docs en el mismo cambio (T010).** La lista está en `plan.md` §2. Suma `docs/CLASES.md` §4
  (`vision.ts` y `/api/texto` solo para la guía) y quita el *Pendiente* de la 021 en `AGENTS.md`.
- **Al terminar** (`specs/README.md`, «Terminar»): borrar la carpeta, escribir el resumen en
  `docs/HOJA-DE-RUTA.md`, quitar la fila del índice y actualizar `MEMORY.md`.
