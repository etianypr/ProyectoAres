# 044 · Ubicar sin los errores de lectura de la nómina

Terreno (dueño, 2026-11-19), ensayo en el V2430 con una nómina real de 72 pedidos: «santiago arata
… no la ubica de una, lo mismo con david girvan … arica, siendo que está bien escrita». La IA
corrigió 18 direcciones (≈ US$0,085 y 69 s) y cada una costó un «Confirmar»; **16 de las 18 eran
errores de lectura de la cámara**, no de la dirección. Rama `044-errores-de-lectura`.

## Lo que se midió (72 pedidos, sin datos de destinatarios en el repo)
| Error | Ejemplo (calle real, número inventado) | Por qué no se ubicaba |
|---|---|---|
| «O» leída «0», «I» leída «1» | `SANTIAG0 ARATA 901`, `1SLA DESOLACION 903`, `CUATRO 0TE 904` | una palabra con dígito se compara exacta: ninguna calle calza |
| Depto sin «depto» | `NUEVA CALEDONIA 910 15`, `… 911 DP 51` | el número de casa era el depto |
| Basura tras la ciudad | `DAVID GIRVAN 914 ARICA \|Des` | sin número al final no se le pregunta a Google |
| Palabra partida por el renglón | `SIMOM MOL INARES`, `Nac imiento` | «mol» no es palabra de ninguna calle |
| Letra cambiada en palabra corta | `Jose Dlaz Gana`, `RAUY PEY CASADO` | palabras de 4 letras van exactas |
| Número pegado | `BOGOTA N917DEPTO 318CONDOMINIO …` | el depto quedaba pegado a la casa |
| Esquina antes del número | `CANCHA RAYADA CON BUENA ESPERANZA 925` | se buscaba la calle de la esquina |
| Código de depto mal leído | `PORTAL EL ALWA 0DK 97` | «0DK» pasaba por nombre de calle; sin él, OSM lo encuentra |

## Qué cambia
- `geocoding/errores-lectura.ts` (nuevo, puro): `corregirLectura` cambia el 0 por O y el 1 por I
  junto a letras (nunca junto a otro dígito ni en un ordinal), saca signos sueltos y separa el número
  pegado. Se aplica al **destino leído** (`limpiarDestino`: el conductor ve «SANTIAGO ARATA») y a la
  **consulta** (`normalizarConsulta`).
- `normalizarConsulta`: dos números al final son casa y depto (salvo «Pasaje 5 919»); unidades
  `dp`, `dpt`, `dto`, `bl` y el ordinal antes de «piso»; lo que sigue a «ARICA» tras el número; «Ote»
  es «Oriente» («Pte» no: también es «presidente»).
- `coincidenciaCalle`: una letra corregida en una palabra de 4 se acepta solo si otras **dos**
  palabras calzan tal cual («Jose … Gana»). Sola sigue exacta («Lebo» no es «Lebu»).
- `calles.ts`, `corregirConCatalogo` (con el catálogo, sin red): une la palabra partida si junta es
  una palabra de calle y alguno de los pedazos no lo es; quita un código de 2–3 letras que no es
  palabra de ninguna calle antes del número del final (el depto), si queda una palabra que distingue.
  Va en `ubicarDireccion` y en el adelanto de OSM (`consultaOsmDe` pasa a ser async).
- `separarReferencias`: «X con Y 925» busca «Y 925» y deja «con X» de referencia y cruce.

Con las 72 del ensayo (sin red): las 18 que corrigió la IA salen con la consulta correcta y su calle
en el catálogo. Queda sin arreglo una dirección que la nómina leyó cortada (sin número).

## Lo que siguió en el teléfono (2026-11-20)
- Palabra repetida seguida («CALLE CABRERO CABRERO») queda una; no en las calles que la repiten
  (Colo Colo, Llay Llay, Luis Urzúa Urzúa, Río Calle Calle: `REPETIDAS_EN_CALLES`, cruzada con el catálogo).
- El sector tras el número de casa («… 1450 CHINCHORRO ALTO») es referencia: la consulta termina en
  el número y se le pregunta a Google.
- **Coincidencia holgada** (`coincidenciaHolgada`, `callesSimilares`): si nada calza estricto, un
  cuarto de las letras por palabra, 3 en total, la mitad de las palabras estrictas y nunca
  norte/sur/oriente/poniente; Google confirma la puerta con ese número. Medido real: «ORIZOMBO BARBOZA
  …» exacta con 1 consulta.
- **La calle sola de Google trae su nombre** («alvarez» → «Francisco Alvares Romero»): con él y el
  número da la puerta. Medido real: exacta con 3 consultas.

## Calles aprendidas (dueño, 2026-11-20: «que cada corrección quede guardada»; Supabase compartido)
```
confirmar corrección (IA o a mano) ─┐                      ┌─ ubicarDireccion: la calle aprendida
Google confirma la puerta ──────────┴─ aprenderCalle ──────┤   se busca con su nombre oficial
                                        │ (no: ambigua, genérica,   └─ (sin IA, menos consultas)
                                        │  otra calle, con número)
                          IndexedDB `callesAprendidas` v8 ⇄ Supabase `encomienda_calles_aprendidas` (0009)
                          (no se borra con el día)        (lee todos; aprende por función; el jefe borra)
```
- Solo «calle escrita → oficial», sin número de casa, OF, nombre ni fecha: no identifica a nadie.
- En modo prueba se aprende y se usa en el teléfono, sin subir; sube cuando se apague.
- La 0009 corrió en producción el 2026-11-20 (MCP de Supabase, con el visto bueno del dueño): verificación
  todo `true` y `npm run test:esquema` OK. Pendiente: una vista en el panel para revisar y borrar lo mal
  aprendido.

## Armar la ruta
Ya usa las coordenadas de la carga: «Optimizar ruta» solo reintenta los pedidos **sin punto** (hasta 5,
con la memoria del día de Google y OSM; `generar-ruta/ubicar-pedidos.ts`). Menos «Sin ubicar» es menos
reintento al optimizar.

## Verificación
- `pruebas/044-errores-lectura.test.mjs` (14), `npm test`, `npm run lint`, `npm run build`.
- **Falta (dueño):** escanear de nuevo una nómina en el V2430 y comparar con el ensayo del 2026-11-19:
  cuántas van a la IA, cuántos «Confirmar», «Crear: ubicar» y «Crear: corregir con IA» en Diagnóstico →
  Tiempos, y consultas a Google.
