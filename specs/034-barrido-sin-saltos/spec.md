# 034 · Barrer la nómina sin saltarse un encargo

Estado: borrador · paso 1 del flujo («Cargar la guía» → «Barrer la nómina», spec 029) · dueño,
2026-11-14.

## Qué y por qué
- Terreno, 2026-11-14: al barrer la nómina el conductor no supo qué parte ya estaba leída y tuvo que
  recorrerla entera de nuevo para encontrar la OF que se saltó. El otro problema es la luz (sombra de
  la mano en el borde izquierdo, justo donde va la OF, y brillo del papel térmico).
- El dueño eligió cuatro ideas de la maqueta (siete propuestas, en el scratchpad de la sesión): **A**
  pintar en verde lo leído, **B** contador y lista de OF, **D** marcar el encargo cortado o ilegible
  y **G** mejorar la imagen antes de leer. Descartó el solape entre fotos (C), la linterna
  automática (E) y el semáforo de calidad (F).
- Todo corre en el barrido en vivo, no en las fotos.

## Lo que ya hace la 029 y lo que cambia
| Idea | Hoy | Cambio |
|---|---|---|
| A · verde | El encargo confirmado va verde con ✓ solo 2 s; después, una línea fina blanca sin etiqueta (`RECIEN_MS`, tipo `cargada`). Decisión del dueño del 2026-11-11 («me confundo del progreso») | El verde **se queda**: todo encargo ya leído sigue relleno en verde con ✓ cada vez que vuelve a la cámara. Al repasar la nómina, lo que no está verde es lo que falta. Reemplaza la decisión del 11-11 |
| B · contador y lista | «N OF confirmadas · M por confirmar · la nómina dice T» y la última confirmada | Se suma «Ver lista»: las OF leídas en el orden de la nómina, con su dirección y su estado (✓, ⚠ por confirmar, a medias), para comparar con el papel sin volver a barrer |
| D · cortado o ilegible | Se pierden **en silencio**: la OF que se leyó sin su dirección (`lineasDelBarrido` la descarta) y la que se vio en un solo cuadro (`unaVez`). Solo Diagnóstico las cuenta | Quedan «a medias»: marcadas sobre la cámara, contadas abajo («1 a medias») y en la lista. «Terminar» con alguna a medias las muestra antes de salir |
| G · mejorar la imagen | El cuadro va tal cual a ML Kit (1080×1920, ~123 ms). Linterna a mano | Realzar el cuadro antes de leerlo, **solo si la medición dice que sirve** (abajo) |

## Requisitos
- **FR-001 (A).** Un encargo confirmado se marca relleno en verde con ✓ siempre que está en el cuadro,
  no solo los primeros 2 s. Uno por confirmar o a medias no va verde.
- **FR-002 (A).** Ningún estado depende solo del color: ✓ (leído), … (leyendo) y ⚠ (por confirmar o a
  medias), con la OF escrita.
- **FR-003 (B).** «Ver lista» muestra las OF en el orden de la nómina con su estado; se abre y se
  cierra sin apagar la cámara ni perder lo barrido.
- **FR-004 (D).** Una OF vista sin dirección, o vista una sola vez, no desaparece: queda a medias,
  se cuenta y se lista.
- **FR-005 (D).** Si se vuelve a pasar por un encargo a medias y se lee entero, deja de estarlo.
- **FR-006 (D).** «Terminar» con encargos a medias los muestra, con «Seguir barriendo» y «Terminar
  igual».
- **FR-007 (G).** El realce no cambia la regla de la OF (dígito por dígito, ≥ 3 votos) ni baja los
  cuadros por segundo de forma que el barrido deba ir más lento.
- **FR-008.** Sin red ni proveedores: la nómina trae el nombre y no sale del teléfono (como la 029).

## Por decidir (dueño)
1. **A medias al terminar:** ¿pasan a la revisión como «⚠ Por confirmar» con la dirección vacía (no
   se pierden, se completan mirando el papel) o solo se avisan en la cámara? Recomendado: pasan.
2. **Ruido:** una OF «vista una vez» puede ser una lectura mala de otra OF ya confirmada. Hay que
   medir cuántas salen en un barrido real (Diagnóstico → «Probar barrido de nómina») antes de
   mostrarlas todas; si son muchas, se muestran solo las que no se parecen a ninguna confirmada.
3. **G toca `android/`** (APK nueva y `APK_VERSION_MINIMA`): se pregunta antes de empezarla.

## Etapas
1. **Sin APK (llega con el deploy):** A, B y D con los tres dibujos que la APK 1.7.0 ya trae (verde
   relleno, ámbar punteado, línea blanca). Solo web: `use-barrido-nomina.ts`, `camara-barrido.tsx`,
   `barrido-nomina.ts`, `cargar-guia.tsx` y la Ayuda.
2. **Con APK:** un dibujo propio para «a medias» (rojo) y G. Antes de escribir G se mide en el V2430,
   sobre la misma nómina con sombra: % de dígitos de poca confianza y OF confirmadas, con y sin
   realce, y los ms por cuadro. Candidatos, del más barato al más caro: compensación de exposición
   de la cámara, contraste sobre el plano de luz del cuadro, contraste por zonas. Si no mejora, G no
   se hace.

## Datos y sistema
- **Postgres:** sin cambios. **IndexedDB:** sin store ni versión nueva; las líneas a medias viajan
  como `LineaGuia` con `porConfirmar` (y entran al borrador `borradoresGuia`, v7, como las demás).
  Si la decisión 1 es «pasan», `LineaGuia.destino` vacío en una línea del barrido: revisar con la
  skill `base-local-idb` que el borrador lo aguante.
- **Flujo:** cámara → `EscanerVivoPlugin` (ML Kit, en el teléfono) → `alCuadro`
  (`use-barrido-nomina`) → votos (`barrido-nomina.ts`) → recuadros (`EscanerVivo.marcar` →
  `MarcasEscaner.java`) y, una vez por segundo, la vista (`camara-barrido.tsx`) → «Terminar» →
  líneas de «Cargar la guía». Nada sale del teléfono.
- **Docs que no calzan:** la skill `lectura-starken` no nombra el barrido (`nomina.ts`,
  `barrido-nomina.ts`, `camara-barrido.tsx`).

## Riesgos
- Con la cámara encendida cada redibujo de la WebView es caro (028): la lista se abre con un toque y
  no se actualiza más de una vez por segundo. Medir trabas en el V2430 con la lista abierta.
- Más recuadros con relleno por cuadro: los dibuja Android, no la web; medir igual.

## Verificación
- Pruebas enfocadas en `pruebas/barrido-nomina.test.mjs`: una OF sin dirección y una vista una vez
  quedan a medias; al leerse entera deja de estarlo; una confirmada sigue marcada verde pasado
  `RECIEN_MS`.
- En el V2430 (APK de prueba, skill `apk-local`): barrer una nómina inventada impresa, saltarse un
  encargo a propósito y encontrarlo sin recorrerla entera.
