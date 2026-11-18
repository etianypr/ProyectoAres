# 039 · Escanear la nómina: el «8» que se lee «0»

Terreno (dueño, 2026-11-17): «en casi todos los escaneos confunde el 0 con el 8», siempre en el
mismo sentido (**lee 0 donde hay un 8**). Además, las OF de un día son de una misma serie: «los
primeros tres dígitos serán los mismos… a lo máximo estarán entre 281 000 000 y 282 000 000».
Rama `039-nomina-ocho-cero`, encima de la 038; las tres (037, 038 y 039) entraron a `main` el 2026-11-18.

## Decisiones del dueño (2026-11-17)
- Es al **escanear la nómina** (cámara en vivo). La etiqueta ya sale del código de barras.
- El rango **se aprende solo** del mismo escaneo (la serie sube con los meses).
- Al **escanear la etiqueta**, el código de barras corrige la OF del pedido si difiere solo en 0/8.

## Qué cambia
- **Rango del escaneo** (`lectura/rango-nomina.ts`): con 3 o más OF firmes de 9 dígitos, el rango
  es su mediana ± 1 000 000. Una OF fuera del rango vuelve cambiando «0» por «8» si hay una sola
  forma con la menor cantidad de cambios (281 → 201 es el caso típico); si no, queda por confirmar.
  Las OF de otro largo no se tocan.
- **Cada dígito** (`bloques-nomina.ts`, `decidir`): en una posición con votos de «0» y de «8», gana
  el «8» si salió 2 veces o más y suma al menos un cuarto de los «0» (`OCHOS_PARA_GANAR`); y los
  «0» de una posición que es «8» cuentan para firmarla.
- **La etiqueta** (`almacen/carga.ts`, `aplicarLecturaEtiqueta`): si la OF del código de barras no
  está en el día y hay **un solo** pedido sin etiquetas escaneadas cuya OF es esa salvo «0»/«8», es
  ese pedido y se queda con la OF del código. Solo con el código (trae el bulto), nunca con una OF
  escrita a mano. El escáner en vivo dice «OF … · corregida (era …)».

## Los 3 primeros dígitos del día (terreno 2026-11-18)
Una OF «no se leía nunca»: el «8» de «281» salía como otro dígito en 7 de cada 10 cuadros (no siempre «0»;
en la 034 ya se vio «6»), así que ese dígito nunca llegaba a 2 de cada 3 y quedaba fuera del rango. Esas
lecturas armaban una OF fantasma por confirmar; las buenas ya estaban en verde (misma fila: leídas
alternadas, nunca en el mismo cuadro, y los 9 dígitos iguales una vez corregido el comienzo).
- Si `0`→`8` no la deja dentro del rango, se prueba con los primeros 3 dígitos de las firmes del escaneo
  (`Rango.prefijos`) si hay una sola forma de entrar. Sin más condición (dueño, 2026-11-18: «quita esa
  condición»; antes se exigía haber visto el dígito del día en sus lecturas). Vale por el resto de sus
  dígitos (`firmeSinPrefijo`, del 4.º al 9.º). Las pruebas que mezclaban series (200…, 279…, 281…) pasaron
  a usar una sola serie, como un día real.
- Con el escaneo real del teléfono (solo cifras, por CDP): la fantasma se junta con su OF; quedan 17 firmes,
  3 por confirmar, 1 a medias y ninguna repetida.

## El título «DIRECCION» mal leído (terreno 2026-11-18)
Una sola OF de la boleta «no se leía nunca»: la OF, su dirección y el pie se leían bien, pero el título de esa
fila salía «VLRECCION», «LRECCION» o «4LRECCION» en todos los cuadros (visto con un oyente de cuadros por CDP,
solo esa palabra), y sin el título el encargo nunca se armaba. Ahora (`tituloDireccion`, `nomina.ts`) vale
una primera palabra de 7 a 11 letras a 2 o menos de «DIRECCION»; «SECCION», «ELECCION» y «LECCION», que pueden
empezar una dirección, quedan a 3. Con los cuadros reales de esa fila: arma el encargo en 4 de 6 (antes en 0;
los otros dos traen el título pegado a otra palabra).

## «Borrar pedidos» (dueño, 2026-11-18)
«No existe forma de borrar las OF con sus direcciones para poder hacer un nuevo escaneo»: «Deshacer esta
carga» solo estaba en el resumen de la carga, que se cierra, y lo demás era deslizar pedido por pedido.
- Al final de la hoja, antes de la ruta (`borrar-pedidos.tsx`; en la cabecera alargaba la pestaña y
  cambiaba el diseño, dueño), con un segundo toque: «¿Borrar N pedidos no iniciados? No se puede deshacer.» → «Borrar N».
- Borra los que nadie tocó (`sinIniciar`/`borrarSinIniciar`, `almacen/carga.ts`: sin etiqueta,
  resultado, llamada ni foto, y fuera de la ruta), con la misma regla que «Deshacer esta carga». Los
  iniciados quedan y se dice cuántos. No toca la cola. Ayuda actualizada.

## Lo ya leído no vuelve atrás (dueño, 2026-11-18)
Terreno: «volví a leer la misma boleta y sale por confirmar OF ya leídas»; y «si hay una OF ya leída al 100 %,
lo que apenas se le parezca no hay que escanearlo entero». En `revisarParecidas` (`bloques-nomina.ts`):
- **El mismo número es el mismo encargo**, firme o no: se queda el de más cuadros (antes la misma OF podía
  salir dos veces, una leída y otra por confirmar; la dorada de la 036 ya tenía una).
- **Una OF firme no vuelve a «por confirmar»** por algo parecido leído después: queda por confirmar solo la
  nueva (antes, las dos: `dobles`).
- **Lo que se parece a una firme** (contando el «8» leído «0» como igual) y no juntó más cuadros es ella: no se
  lista, se pinta verde y no se intenta leer entera. Entre dos firmes que difieren solo en «0»/«8», gana la del «8».
- **La misma calle con otro número de casa son dos encargos** (`otraCasa`): «AV SANTA MARIA 1239» y «… 2278»
  se parecían en un 75 % y la regla de 3 a 1 absorbía un encargo real de al lado. Una dirección mal leída
  por un cuadro movido cambia también las letras, y esa sigue siendo la misma fila.

Dos pasadas por la misma boleta (6 boletas inventadas de 40 OF, 30 % de «8» leídos «0»):

| | Antes | Después |
|---|---|---|
| Firmes que vuelven atrás (misma sesión / volviendo a entrar) | 5 / 4 | 0 / 0 |
| OF repetidas | 2 / 2 | 0 / 0 |
| Por confirmar | 30 / 22 | 9 / 5 |

La dorada de la 036 (`fixtures/barrido-nomina-100.json`) se regeneró: las firmes no cambian (92 bien, 0 mal);
se recupera una OF real que se perdía, se van la OF repetida y dos lecturas de un cuadro, y aparece una de dos.

## Medido (barrido inventado, `pruebas/barrido-sintetico.mjs` con `ochoACero`; serie 281, 6 barridos de 60 OF)

| «8» leídos «0» | Antes: firmes bien / con otro número | Después |
|---|---|---|
| 0 % | 337 / 0 | 345 / 0 |
| 30 % | 208 / 11 | 345 / 1 |
| 50 % | 38 / 55 | 340 / 10 |
| 70 % | 7 / 236 | 293 / 51 |

- Sin el error no empeora nada: en la serie 27x, 347 firmes bien y 0 mal (antes 344 y 0).
- **Descartado (medido):** juntar en un mismo encargo, al armar los bloques, las lecturas que difieren
  solo en «8»/«0» (aunque traigan su dirección). Ganaba un poco con el error muy alto, pero sin el error
  juntaba encargos vecinos de la misma serie (más OF con otro número). Contra una OF ya firme sí se usa.

## Verificación
- `pruebas/039-ocho-cero.test.mjs` (rango, dígito, título «DIRECCION», barrido con el error, dos pasadas
  por la misma boleta, etiqueta) y `pruebas/039-borrar-pedidos.test.mjs`. Ajustadas: `nomina-reglas` (la OF con un «8» leído «6» o «0» 4 de 10 ahora confirma con la
  regla de siempre), `barrido-nomina` (OF de una misma serie; dos firmes parecidas: la leída primero sigue
  firme) y la dorada de la 036 (regenerada dos veces, las firmes iguales). `npm test` 1113/1113, lint, tsc
  y build.
- **Falta, en el teléfono:** escanear una nómina real en la APK de prueba y comparar con el papel
  cuántas OF quedan firmes con otro número (Diagnóstico → «Probar barrido de nómina», solo cifras);
  escanear una etiqueta cuya OF la nómina dejó con un «0».
- Si el error resulta más fuerte que el 50 % (casi todos los «8» leídos «0»), lo que queda lo
  arregla el código de barras al cargar el vehículo.
