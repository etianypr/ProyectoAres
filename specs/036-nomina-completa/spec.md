# 036 · Nómina completa: más rápida, con bultos, sin fantasmas y con flecha a lo que falta

Estado: en curso (rama `036-nomina-completa`, sin commit; web hecha y probada sin teléfono, `android/` compilado
sin instalar) · paso 1 del flujo («Cargar la guía» → «Nóminas físicas», specs 029 y 034) · dueño, 2026-11-16.

## Qué y por qué (dueño, 2026-11-16)
1. **Lento**: hay que sostener el celular mucho rato sobre cada encargo.
2. **OF inventadas en «Falta confirmar»** que nunca se van: si en ~5 min no se lee nada parecido, que se borren.
3. **Contar bultos**: el total impreso al final de la boleta («TOTAL BULTOS») es de bultos, no de OF. Si la
   suma calza, se leyó todo. Los bultos pasan también al pedido.
4. **Dónde volver**: un ícono **sobre la cámara en vivo** (no texto) hacia la OF por confirmar que quedó atrás,
   o hacia un encargo saltado entero. Pastilla en el borde del recuadro (maqueta elegida).

## Lo medido antes (PC, barrido inventado de 100 OF: `pruebas/barrido-sintetico.mjs`)
- ML Kit no era el cuello de botella: la nómina de 15 OF dio ~15 lecturas por OF y aun así 4,9 s por OF. El
  tiempo se iba en **decidir** (una vez por segundo, y dígitos que no llegan a 2 de 3).
- Decidir crecía con la nómina: 120 ms de mediana y 311 ms en p95 con 100 OF, dos veces por revisión.

## Cómo quedó
### Fase 1 · web (llega con el deploy)
- **Decidir más rápido, lo mismo** (`votos-barrido.ts`, `bloques-nomina.ts`, `etiqueta/votos.ts`): una sola
  forma de juntar los renglones por decisión (`elegirVotosDelBarrido`), lo decidido de cada encargo guardado por
  la identidad de sus lecturas (`decidirGuardado`), la dirección de cada lectura guardada, cotas baratas antes
  de la distancia (`aLoMas`) y `aLaVista` sin comparar cuadros contra cuadros. Con 100 OF: **4 ms de mediana y
  12 ms en p95** (antes 120 y 311; con la hoja de las flechas, 5 y 15). La prueba dorada
  (`nomina-rapida.test.mjs`) fija que se decide lo mismo.
- **Decidir con cada cuadro**: cada ≥ 400 ms (o 3 veces lo que tardó la última), no una vez por segundo. El
  verde y el tic llegan antes. Prendido; se apaga en Diagnóstico para comparar.
- **Vence lo que falta confirmar** (`VENCE_MS` = 5 min): con el reloj del barrido (ms de cámara; con el
  celular bloqueado no corre, `relojDelCuadro`). Sale de la lista, de la flecha y de lo que pasa a la guía; sus
  votos quedan, y si se lee algo parecido revive. Lo ya pasado a la guía se revisa ahí.
- **Bultos** (`nomina.ts`, `bloques-nomina.ts`): la columna BULTOS de cada fila (3.er número chico tras la OF,
  o el 2.º con el TOTAL pegado), votada (≥ 2 iguales y 2 de cada 3); el TOTAL BULTOS del pie, válido leído
  igual 2 veces. El número grande del resumen es de bultos: «47 de 52 bultos», con ✓ si calza y no falta nada.
  Pasan a `LineaGuia.bultos` → `Pedido.bultos` («Cargar vehículo» y la ruta, spec 024). El aviso de la
  revisión compara el total con la suma de bultos. El «total en nómina» de antes salía de «MONTO NETO», que es
  de la guía de despacho.

### Fase 2 · APK 1.10.0 (`android/`)
- `LectorCuadros.java` (sale del plugin, que pasaba de 600 líneas): cada cuadro manda `n`, `msLector`,
  `msArmar` y, cada 30, el estado térmico y la memoria. Con `enVuelo: 2` lee dos cuadros a la vez (copia el
  plano Y, suelta el cuadro y lo lee otro lector con su hilo). Apagado: Diagnóstico → «Dos cuadros a la vez»
  y medir el solape.
- **Flechas** (`rumbo-nomina.ts`, `MarcasEscaner.java`): `marcar({ cajas, zona, flechas })` → `pantalla`. La
  pastilla va centrada en el borde de la zona libre del recuadro (sin «Falta confirmar» ni el resumen,
  `use-zona-libre.ts`): ámbar «▲ OF · 3» a una por confirmar; oscura punteada «▲ ? · 3» a un hueco. Una por
  confirmar se ubica justo después de la firme que salió encima de ella. Solo con la APK nueva (`flechas`).
- **Huecos** (apagados, «Flechas a huecos»): por la separación entre filas de OF de un mismo cuadro
  (`VotosNomina.vecinos`): dos seguidas a ≥ 1,6 encargos, o una fila suelta justo debajo que nunca se volvió
  encargo. En el PC, 0 falsos en 9 barridos y 16 de 18 saltos encontrados.
- **Fantasmas** (apagados, «Botar fantasmas»): una por confirmar que solo salió en el lugar de una firme, con
  la prueba hecha con lecturas exactas. En el PC, 0 OF reales botadas en 12 barridos.

### Fase 3 · reglas (solo se mide)
- Diagnóstico compara sobre el mismo barrido «dosDeTres» (la de siempre), «confianza06» y «ponderada»
  (`reglas-nomina.ts`): firmes, por confirmar, segundos hasta el verde y OF con otro número (tiene que ser 0).
  En vivo sigue la de siempre. La OF con dos «8» de la 034 confirma con las otras dos.

## Datos y sistema
- Postgres: sin cambios. IndexedDB: v7, sin versión nueva; todo lo nuevo es opcional.
- Tipos: `lectura/tipos-nomina.ts` (`VotosOf.visto`, `bultos`, `pesos`, `altos`; `VotosNomina.reloj`, `vecinos`;
  `LineaNomina.bultos`; `ResultadoNomina.vencidas`, `bultos`), `LineaGuia.bultos`, `LineaParaCrear.bultos`,
  `escaner-vivo.ts` (`FlechaViva`, `CamaraViva.flechas`/`enVuelo`, `CuadroVivo.n`/`msLector`…).
- Nada sale del teléfono.

## Falta
- [ ] APK de prueba en el V2430 (skill `apk-local`) y, en Diagnóstico → «Probar barrido de nómina» con la
  nómina real (cifras por CDP, nunca OF): cuadros/s, ML Kit p50/p90, segundos hasta el verde; uno contra dos
  cuadros a la vez (A/B/A/B); las flechas en el recuadro; dejar una a medias y esperar 5 min; «N de N bultos ✓»
  contra el papel; un barrido saltándose un encargo (hueco) y otro sin saltos (0 huecos); la regla ponderada.
- [ ] Ver con la boleta real que el pie dice «TOTAL BULTOS» (si no, el patrón en `nomina.ts`, con su prueba).
- [ ] Crear los pedidos y ver los bultos en «Cargar vehículo».
- [ ] Commit (preguntar), APK 1.10.0 (tag del dueño) y `APK_VERSION_MINIMA` si otro teléfono corre una anterior.
