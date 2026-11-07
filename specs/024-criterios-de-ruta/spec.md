# Spec 024 · La ruta por cinco criterios

**Creada**: 2026-11-05 · **Estado**: en curso (bultos e invertir hechos; faltan tiempo, éxito y ganancia) ·
**Rama**: `024-criterios-de-ruta` · **Pedido del dueño** (`AGENTS.md`, «Rutas»): las rutas se evalúan
por bultos, km, tiempo, porcentaje de éxito por parada y ganancia.

## Hoy
- El optimizador ordena por km, con zonas de 900 m y horarios (`generar-ruta/`,
  `rutas/orden-paradas/`).
- La ruta es cerrada y cada zona se recorre una sola vez.

## Debe
- Cada propuesta de ruta se compara por los cinco criterios.
- Se muestra una propuesta por defecto, y hasta tres solo si difieren de verdad.

## Bultos: sacarlos del móvil lo más rápido posible (hecho, 2026-11-07)
Por qué (dueño): con menos bultos en el auto, se encuentra más rápido el paquete.

- **Medida:** la espera de cada bulto en el auto, desde la central hasta su parada: lo manejado
  más 4 min por cada parada anterior (`MIN_POR_PARADA`), sumada por bulto.
- **De dónde salen los bultos:** del código de barras (o se van contando si aparecen más con la
  misma OF). Al armar la ruta (paso 3) todavía no se escanea: sin escanear, cada pedido vale uno.
- **Cuánto pesa (dueño: «solo si es casi gratis»):** sobre el orden de menos km, una pasada adelanta
  barrios enteros, tramos o paradas solo si:
  - maneja ≤ 1 % más (`TOLERANCIA_DESCARGA`);
  - no paga más cambios de zona ni vueltas en calles estrechas;
  - cada metro de más saca los bultos, en promedio, al menos un metro antes.
- **Medido** (16 días simulados de 60–100 paradas, sin consultas): 3 bajan la espera 5–10 %
  (~5 bultos menos a las 2 h) por +0,3 a +0,6 % de km; los demás quedan igual. La más corta ya
  descarga casi lo más rápido posible; sin tope de km, el techo es 10–15 % por +10–15 % de km.
- **Dónde:** `orden-paradas/descarga.ts` (`adelantarBultos`, puro), opción `descarga` de
  `ordenarParadas`; lo usan todas las estrategias (`DescargaDelDia`) y `ordenarConSentido`. La
  huella de la propuesta cuenta los bultos. Sin tablas, stores ni versión de IndexedDB nuevas.
- **Pruebas:** `pruebas/rutas-024.test.mjs` y «spec 024» en `asistencia-rutas.test.mjs`.
- **En el teléfono** (2026-11-07, vivo V2430, Chrome contra el PC, día de prueba de 53 paradas con la
  matriz real de ORS): la pasada cambió el orden, +0,1 % de km y −0,4 % de espera (31 bultos a las
  2 h, igual). Armar la ruta tardó 15 s: 1 matriz, 3,4 s de cálculo y 29 trazados (1 + 14 tramos de
  pasaje, dos veces: la mejora por sentido encontró un orden más corto).
- `ordenarConSentido` vuelve a dibujar solo si la estimación mide menos: un orden que cambió solo por
  los bultos no paga otros ~15 trazados.

### Tareas
- [x] T001 Medir cuánto se gana y cuánto cuesta (scripts fuera del repo).
- [x] T002 `adelantarBultos` con tolerancia, zonas y precio por metro.
- [x] T003 Conectarlo a las estrategias, a `ordenarConSentido` y a la huella.
- [x] T004 Pruebas enfocadas y de punta a punta.
- [x] T005 Un día real en el teléfono (arriba). Falta un día de reparto de verdad.
- [ ] T006 (Si el dueño lo pide) mostrar en la propuesta «A las 2 h quedan N bultos»: maqueta antes.

## Invertir orden de ruta (hecho, 2026-11-07)
Pedido del dueño: hacer la ruta propuesta en el orden de ARES o al revés (la última parada primero).

- Botón «Invertir orden de ruta» en la propuesta, bajo los km (a 360 px no cabe al lado). Invertida,
  dice «Orden invertido · +N km»; otro toque vuelve a la de ARES. Solo en la propuesta: después el
  auto ya va cargado en ese orden. El mapa no se mueve al invertir (dueño): encuadra solo cuando
  cambian las paradas (`ruta-mapa.tsx`), así se ve cambiar la ruta donde se estaba mirando.
- **Al revés mide distinto** por los sentidos únicos y los bandejones: en el día de 53 paradas, 36,4 →
  39,3 km (+2,8 km), el mismo tiempo; se alargan 16 de 54 tramos y 5 explican 2,3 km.
- Cupo (dueño: «a lo máximo debería cobrar una inversión»): una propuesta paga una sola inversión, el
  trazado del orden al revés (~15 consultas ese día); ir y volver después no consulta (`deAres` y
  `alReves` quedan guardadas, en memoria), aunque ese trazado haya fallado. Mientras llega, el botón
  dice «Invirtiendo…» y el panel no deja tocar nada (usarla guardaría el trazado viejo);
  `invertirOrden` tampoco hace nada si se la llama esperando. Los horarios se vuelven a medir con la matriz
  en memoria: si al revés se llega tarde, sale el aviso y queda como ⚠ al usarla.
- Dónde: `generar-ruta/invertir.ts` (`invertirOrden`), `_componentes/cifras-ruta.tsx` (km, tiempo
  —ocupa el resto, centrado: dueño— y el botón), `use-propuesta.ts`, Ayuda. Sin datos guardados nuevos.
- [x] T007 `invertirOrden` y pruebas («spec 024» en `asistencia-rutas.test.mjs`).
- [x] T008 Botón, estado y Ayuda.
- [ ] T009 Recorrerlo en el teléfono con la versión final: el encuadre se vio bien (53 paradas sobre el
  panel); falta ver la línea invertida con cupo de ORS.
- Al aparecer, la propuesta se encuadra en lo que queda visible sobre su panel (`ruta-mapa.tsx`,
  `rellenoConPanel`: se mide el panel, `data-propuesta-ruta`). Antes el sur de la ruta quedaba debajo.

## Por definir
- Cómo se mide cada criterio con lo que hay en el teléfono:
  - **tiempo:** la matriz de ORS ya trae duraciones;
  - **éxito por parada:** ¿disponibilidad, contacto o horario? Un pedido es de un solo día y sus
    datos se borran al cerrarlo;
  - **ganancia:** ¿la tarifa del día (`pago.ts`) y el costo del km?
- Cuánto pesa cada uno, o si se muestran lado a lado y elige el conductor.
- Lo que ya se midió y se descartó está en `docs/HOJA-DE-RUTA.md`: sectorizar alarga la ruta, y no
  se proponen ALNS, Tabu ni colonias de hormigas. Leerlo antes de proponer.

## Abierto
- **Cupo de trazados de ORS** (2026-11-07): en la prueba, ORS contestó 403 «Quota exceeded» a los
  trazados (las matrices seguían). Un armado de 53 paradas pide ~29 trazados (uno por parada en pasaje,
  y dos dibujos si la mejora por sentido cambia el orden). El navegador no ve el 403 (sin CORS) y la app
  dice «Sin señal»: hay que pedir el trazado por el servidor para distinguirlo, y medir cuánto gasta un
  día. El uso real y cuándo se renueva están en el panel de ORS del dueño.
- La central de carga no se ubica bien: la ruta del día de prueba partía a 2,8 km. El dueño dio la
  coordenada (-18.465889, -70.302556): escribir en Configuración la dirección como Plus Code
  `57HFGMMW+JXW` la resuelve sin red. Es la configuración de producción: lo decide el dueño.

## Cruces
017 (horarios y orden) · 022 (paradas con ⚠) · 006 (indicadores: entregas sobre asignado) ·
005/027 (escaneo de bultos al cargar el auto).
