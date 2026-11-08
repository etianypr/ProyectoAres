# Spec 021 · Lector de etiquetas en el teléfono

**Creada**: 2026-11-05 · **Estado**: en curso (US1 hecha en la rama, 2026-11-07) · **Rama**:
`021-lector-etiquetas` (desde `main`) · **Pedido del dueño**: "en el escáner de pedidos, cuando obtenemos la info
personal de cada persona, que sea simplemente un escáner especializado en etiquetas de pedidos de
Starken (que no son las mismas siempre), para saltarnos el problema de la privacidad".

Monedas: **privacidad** y **dinero**.
- Hoy cada foto de etiqueta (nombre, teléfono y dirección del destinatario) sale del teléfono hacia
  Anthropic y se intenta también con Google Cloud Vision (`docs/PRIVACIDAD.md` §3).
- La IA lee todas las etiquetas porque es la única que describe el paquete: ~US$0,003 por etiqueta
  con Haiku, unos **US$5–9 al mes** con 60–100 etiquetas al día.
- Con esta spec la etiqueta se lee **solo en el teléfono**: US$0, y Anthropic y Google dejan de
  recibir datos de destinatarios por esta vía.

Decidido con el dueño (2026-11-05):
- Sin IA para la etiqueta, ni siquiera de respaldo. La descripción del paquete pasa a tres toques.
- Solo texto, sin tocar `android/`: sirve la APK instalada. Si un formato mezcla columnas, ver
  `plan.md` §5.
- El dueño tiene ejemplos anonimizados de los formatos; se convierten en pruebas (T002).
- (2026-11-07) La guía sigue con la IA: «en la guía de despacho no sale datos personales de
  nada». El escáner en vivo, que sí toca `android/`, va en la [028](../028-escaner-en-vivo/spec.md).

## US1 (P1) · La foto de la etiqueta no sale del teléfono

| Hoy | Debe |
|---|---|
| La foto va a `/api/lectura` (Anthropic Haiku) siempre que la IA esté encendida | Se lee con ML Kit dentro de la APK. Ni la foto ni su texto pasan por la red |
| Antes que ML Kit se intenta `/api/texto` (Cloud Vision) | La etiqueta no usa Cloud Vision. La guía sigue igual (fuera de alcance) |
| La IA describe el paquete (tipo, tamaño, color) | Tres toques (`CamposPaquete`, ya existe). Que el selector se abra solo después de la foto se confirma con una maqueta (T006) |
| Sin la APK, el botón de foto aparece si hay IA | Sin la APK no hay foto: se pega el texto de Google Lens, que pasa por el mismo lector |

## US2 (P1) · Un lector especializado en Starken, con formatos distintos

| Hoy | Debe |
|---|---|
| `leerEtiqueta` busca 5 palabras clave fijas, en un solo formato | Reconoce cada formato conocido (tabla de abajo) y las variantes de cada palabra clave |
| Toma el primer teléfono que sigue a "Tel." | Separa la etiqueta en zonas: el teléfono, el nombre y la dirección salen de la zona del **destinatario**, nunca de la del **remitente** |
| Sin "Tel." no encuentra el teléfono | Encuentra un celular chileno (+569…) aunque no lleve palabra clave. Descarta la OF, el RUT, el código de barras y los montos |
| Los errores del lector en las palabras clave se arreglan de a uno (0.F.) | Un solo paso de normalización: tildes, mayúsculas, O↔0, I↔1, S↔5 (solo en las palabras clave, nunca en los valores) |

**Formatos conocidos.** Cada uno tiene su archivo de prueba en `pruebas/fixtures/lectura/`, con
datos inventados.

| Formato | Cómo se reconoce | Pago | Prueba |
|---|---|---|---|
| Starken EXPRES | "starken", "EXPRES", O.F. impresa | POR PAGAR + "Total Monto O.F." | `etiqueta-por-pagar.txt` |
| Starken | "starken" | CONTADO (trae monto, pero no se cobra) | `etiqueta-contado.txt` |
| Lion × Starken | "LION x starken" | CTA CTE | `etiqueta-lion.txt` |
| Lion × Starken en renglones (terreno 2026-11-07) | «LION», nombre y dirección partidos con guion, «Tel:» del remitente arriba, «OF» sola | CTA CTE | `etiqueta-lion-renglones.txt` |
| Lion × Starken (real, anonimizada, 2026-11-08) | en esa foto ML Kit no leyó «LION» ni «DESTINATARIO» (formato desconocido, nombre sin leer); dirección en tres renglones; «Bulto N» ilegible | CTA CTE con número | `etiqueta-lion-real.txt` |
| Starken EXPRES (real, anonimizada, 2026-11-08) | «EXPRES», código con 9210…; sin POR PAGAR ni CONTADO; «Totai Monto oF» y «$0» abajo | «$0» impreso → no se cobra (dueño) | `etiqueta-expres.txt` |
| Starken normal (real, anonimizada, 2026-11-08) | «starken», «NORMAL»; ML Kit mezcla los renglones: «DIRECCIÓN» sola y su valor abajo, «001/001» suelto; el remitente trae su dirección y teléfono; «CTA. CTE.» casilla vacía; la OF con comas | CONTADO | `etiqueta-starken-normal.txt` |
| *Por completar con los ejemplos del dueño (T002)* | | | |

## US3 (P2) · Ver qué leyó, sin mandar nada

Menú → Diagnóstico → «Probar etiqueta». Se saca la foto y se muestra el texto que leyó ML Kit, lo
que entendió el lector (formato, nombre, teléfono, pago, monto y dudosos) y el botón «Copiar
anonimizado». Ese botón cambia las letras y los números de los valores, pero mantiene las palabras
clave y la forma.

Sirve para dos cosas: convertir una etiqueta que falló en terreno en una prueba nueva sin copiar
datos reales, y medir el SC-004. No guarda nada.

## Reglas

Las de `AGENTS.md`, «Escaneo de la etiqueta de Starken», siguen igual. Lo nuevo:
- La foto y el texto de la etiqueta no salen del teléfono: ni al servidor, ni a los logs, ni a un
  proveedor. `/api/lectura` deja de aceptar `tipo=etiqueta`.
- Lo que no se lee queda «sin leer» y marcado como dudoso. Nunca se inventa: un POR PAGAR sin monto
  queda «por revisar», nunca $0. Hay salida siempre: otra foto, pegar el texto o escribirlo. El
  teléfono también se puede consultar en Infologistic.
- Si hay dos teléfonos en la zona del destinatario, se usa el primero y se marca como dudoso.
- No se extrae RUT, remitente, correo ni cuenta corriente (FR-017 de la 005).
- La OF sigue saliendo del código de barras. La impresa solo sirve para rechazar la foto de otra
  etiqueta.

## Criterios

- **SC-001**: leer una etiqueta no hace ninguna consulta de red. Lo verifica una prueba que
  reemplaza `fetch`, y `/api/lectura` contesta 400 a `tipo=etiqueta` sin llamar a Anthropic.
- **SC-002**: el costo de leer etiquetas es US$0. `LECTURA_MODELO` ya no existe.
- **SC-003**: cada prueba de formato da bien el nombre, el teléfono, el pago y el monto. Ninguna
  toma el teléfono del remitente.
- **SC-004**: en terreno, ≥ 90 % de ~50 etiquetas reales quedan con nombre, teléfono y pago sin
  pegar ni escribir (el mismo umbral que el SC-005 de la 005; se mide junto con su T030).
- **SC-005**: en la APK, la lectura de una etiqueta tarda ≤ 4 s. Antes decía ≤ 2 s; el dueño
  (2026-11-08): «es más importante que se demore más en procesar y que todos los datos importantes
  estén bien». Por eso la foto se lee dos veces (2400 y 1600 px) y lo que no coincide queda por
  revisar.

## Supuestos

- El conductor usa la APK. El navegador es solo de respaldo.
- Toda etiqueta de Starken trae las palabras clave impresas («DESTINATARIO», el pago). Lo que no
  esté en la tabla de formatos se confirma con los ejemplos del dueño.
- ML Kit devuelve el texto por bloques, de arriba abajo. Si una etiqueta tiene columnas, el valor
  puede quedar lejos de su palabra clave. Las zonas lo cubren mientras la zona del destinatario
  venga en un bloque. Si no alcanza, está el plan B (`plan.md` §5).

## Fuera de alcance

- La guía, que sigue con la IA (Opus): no trae nombre ni teléfono.
- `/api/texto` (Cloud Vision) para la guía.
- Las direcciones sin ubicar de la spec 018.
- La descripción automática del paquete.
