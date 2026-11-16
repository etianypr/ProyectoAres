# 035 · Calles repetidas: la referencia de la guía elige el lugar

Estado: en curso (en la rama `034-barrido-sin-saltos`, junto a la 034; probada en el V2430 en modo prueba, falta una guía real) · paso 2 del
flujo (resolver los ⚠ de la guía) · dueño, 2026-11-15. Toma de la 025 lo de separar referencias.

## Qué y por qué
- «Pasaje 1», «Calle 2»… están en muchos lugares de Arica y la app no sabía dónde estaba cada uno:
  el catálogo tenía una fila por nombre (8 km para «Pasaje 1») y «Pasaje 1» sin puerta terminaba en
  «Sin número: va a mitad de cuadra». La población que trae la guía antes de la calle se mandaba
  entera al buscador.
- Pedido del dueño: si la guía trae una referencia, la app capta **de inmediato** cuál es la
  dirección correcta; si no, el ⚠ muestra cada opción con su población (maqueta aprobada). Solo las
  opciones de la zona de la ruta: una de otro sector no se recomienda. **Sin consultas de más a
  Google: todo con datos que viajan en el código.**

## Lo decidido (dueño)
- La segunda línea de cada opción: «Pob. X · Sector».
- Las que no calzan, ordenadas por cercanía a las demás paradas del día.
- Solo las de la zona de la ruta (mismo sector que otros pedidos del día o a ≤ 1 km de alguno).
- El aviso dos paradas antes suma «Cambiar lugar».
- La referencia queda en **Notas** («Ref.: …»); la dirección guarda el texto entero.
- Las poblaciones salen del Plano de Poblaciones municipal (OSM conocía la población de 24 de 50
  «Pasaje/Calle N»).

## Cómo quedó
- **Datos (sin red):**
  - `geo/geocoding/poblaciones-arica.ts`: 335 poblaciones del plano (abril 2025), con su polígono.
    Los nombres se leyeron con el OCR de Windows y se corrigieron a mano; las coordenadas salen de la
    grilla UTM del plano (validadas contra OSM: 33 m y 186 m).
  - `geo/geocoding/lugares-calles.ts` (`npm run calles`, `scripts/generar-calles.mjs`): 160 lugares de
    71 nombres repetidos, cada uno con su punto, puntos de muestra y las calles que lo cruzan.
- **Lógica:** `separarReferencias` (la calle es la que va junto al número; la población de antes y
  «con…», «esq.», «frente a…», «pob…» de después son referencia) → se busca solo la calle.
  `ubicarEnLugares` (`calle-repetida.ts`) arma una opción por lugar, con población y sector; calza la
  que está en la población escrita o la que cruza la calle nombrada (con «con» o sin él: «LINDEROS
  PROVIDENCI CALLE 2…» → la Calle 2 que cruza Providencia). Una sola que calza → ubicada, sin ⚠.
  `elegirConLaRuta`, al final de la carga (con los puntos del día): un solo lugar en la zona → ese;
  varios → solo esos, por cercanía; ninguno → todos.
  - Un nombre genérico («Pasaje 1», «Calle 2», «1 Norte») va siempre por los lugares; uno con nombre
    propio solo si los buscadores no dieron una puerta segura (una avenida cortada en dos tramos no
    pregunta).
- **Pantalla:** el ⚠ muestra «Pob. X · Sector» y «✓ Coincide con la guía»; el aviso dos paradas
  antes dice «Va a Pob. X · Sector; hay N lugares más» con «Llamar» y «Cambiar lugar».
- **Formato:** `OpcionLugar` y `SugerenciaDireccion` suman `poblacion?`, `sector?`, `calza?`
  (opcionales: lo guardado antes sigue sirviendo; IndexedDB sigue en v7).
- Pruebas: `pruebas/calles-repetidas.test.mjs`.

## 2026-11-16 · La IA revisa los dudosos; opciones con «Elegir»
- Con 45 pedidos el dueño reescribió muchos a mano: la IA solo veía los **sin ubicar** y como mucho 15.
  Ahora revisa también los de la carga que quedaron en la cuadra (aproximada), solo con la calle o
  en una calle repetida sin resolver (`ResumenUbicarCarga.dudosos` → `corregirDirecciones`), sin
  tope de 15 (100). Una propuesta a < 60 m del punto que ya tenía no se muestra. ~US$0,02 por
  dirección (autorizado por el dueño). La hoja cuenta también los de lugar en duda (`porRevisar`).
- El ⚠ de lugar arranca abierto; cada opción con mapa ancho donde se leen las calles, «Pob. X ·
  Sector», «Cruza con: …» (dueño: «tiene que verse las calles que tiene alrededor») y «Elegir».
- Probado en el V2430: «AVDA STA MRIA 2150» y «PJE ALFONZO NESPOLO 1450 FRENTE A LA PLAZA» → 2
  propuestas de la IA; «PASAJE 1 1453» → 3 opciones con sus cruces.
- Arreglado: fuera de «Cargar guía», «Por resolver» no mostraba las propuestas que la IA terminó con
  la hoja ya armada y ofrecía volver a corregir (pagar). Ahora el bloque se rearma al llegar.
- **Todo se resuelve en «Por confirmar»** (dueño, 2026-11-16: «nunca tengas que ir a editar el
  pedido»): en el paso 3 de «Cargar guía» y en «Por resolver» de la hoja, junto a las propuestas de
  la IA, van la calle en varios lugares y la solo-calle con sus opciones («Elegir»,
  `opciones-lugar.tsx`) y los sin ubicar sin propuesta con el campo de dirección (`por-confirmar.tsx`).
  Una calle repetida ya no va a la IA: eligió el Pasaje 1 de Condominio Hualles, lejos de la ruta.

## Falta
- Probar con una guía real: en modo prueba ya se vio con y sin referencia (2026-11-16).
- Pasarla a su propia rama (`035-calles-repetidas`) y reservar el número en `main`: se hizo sobre la
  rama de la 034 porque comparte archivos con lo pendiente de esa rama.
- OSM no tiene nombrados muchos pasajes de las poblaciones: los que no están en `lugares-calles.ts`
  siguen como antes. Se suman corrigiendo OSM y corriendo `npm run calles`.
- Si el plano municipal cambia, se vuelve a sacar `poblaciones-arica.ts` (el método está en su cabecera).
- Algunas etiquetas cortas del plano se botaron por parecer mal leídas: si falta una población, se
  revisa contra el plano y se suma a mano en la corrección de nombres.
