# Research: carga desde guía y escaneo de etiquetas

## Fuentes de datos (observado en fotos reales, sin datos personales)

**Etiqueta Starken** — código de barras principal Code 128, 26 dígitos:

```text
92 0 0002256 · AAAA · OOOOOOOOO · BBB
   prefijo     agencia   OF (15–23)  bulto (24–26)
```

- Prefijos vistos: `9200002256` (normal), `9210002256` (EXPRES). Posición del OF fija.
- Campos: `DESTINATARIO:`, `Tel.`, `DIRECCIÓN:` (incluye comuna), recuadro de pago (`CONTADO`, `CTA CTE`, `POR PAGAR` en grande) + `Total Monto O.F. $`, `Bulto N° 001/001`, peso/medidas.
- Lion × Starken: sin recuadro de pago; muestra `CTA CTE: …` → pagado.
- No usar: R.U.T., remitente, correo, cuenta corriente, rampa.
- Casos: dos etiquetas en cuadro; bolsa arrugada con reflejo.

**Guía de despacho** ("Guías Traslado", Infologistic en equipo Mercado Pago):

- Líneas `OF:<9 dígitos> DESTINO:<dirección>`, monto 1 c/u. Sin nombre ni teléfono.
- Basura: `&amp;amp;`, "CHILE,", "XV REGION DE ARICA Y".
- MONTO NETO probablemente = cantidad de líneas (a confirmar con más guías).
- PDF417 inferior = timbre SII (folio + primer ítem): no sirve para la lista.
- Botón de descarga: uso desconocido; no se depende de él.
- Infologistic: app privada de Starken (sin documentación pública). No se manipula el equipo (Ley 21.459, términos de Mercado Pago).

## Decisiones

**R1. OF por código de barras en el teléfono**
- Decisión (2026-10-24, el conductor usa Android): el escáner nativo de la spec 015 (ML Kit, Code 128 e ITF, sin conexión) vía `escanearCodigo()`. En el navegador, `BarcodeDetector` (Chrome Android lo trae); si no existe, escribir el código.
- Motivo: exacto (dígito verificador), sin red, sin proveedor. La IA puede errar un dígito y enlazar mal la parada.
- Se descartó `zxing-wasm`: hacía falta solo por Safari iOS.

**R2. Parsers puros de texto**
- Decisión: `src/lib/encomiendas/lectura/{codigo-barras,guia,etiqueta}.ts`, funciones puras.
  - `codigo-barras`: 26 dígitos → `{of, bulto, agencia}` o null.
  - `guia`: texto → `LineaGuia[]` + avisos (formato, repetidos, total).
  - `etiqueta`: texto → campos por palabras clave.
- Uso: fallback sin IA (texto pegado desde Google Lens) y normalización/validación de la salida de IA.
- Pruebas con fixtures anonimizados en `pruebas/fixtures/lectura/`.

**R3. Lectura con IA**
- Endpoint `POST /api/lectura` (server-only, conductor autenticado con `lib/auth/api-conductor`).
- SDK oficial `@anthropic-ai/sdk`, modelo `claude-opus-5`, salida estructurada con `output_config.format` (JSON schema de `contracts/lectura.md`).
- Fallback de rechazo del lado del servidor (`fallbacks`) según la guía de Anthropic.
- Imagen reducida en el teléfono: guía ≤ 2576 px (alta resolución, texto chico), etiqueta ≤ 1280 px.
- Timeout + 1 reintento; sin registrar cuerpos de solicitud/respuesta; nada se guarda.
- Respuesta `{campos, dudosos}`; el servidor valida con los parsers de R2 antes de devolver.
- Clave `ANTHROPIC_API_KEY` solo en servidor (`.env.example`).

**R4. Costo**
- ~US$ 33/mes con Opus 5 (60 etiquetas + 1–3 guías/día). Sonnet 5 ≈ 1/3. Elegir modelo con prueba de ≥ 50 etiquetas (SC-003, SC-005).

**R5. Privacidad**
- IA usable desde el piloto; registrada en `docs/PRIVACIDAD.md` §3; autorización de Starken al lanzamiento oficial (spec 007 FR-009).
- Solo campos necesarios en el schema (FR-017). Fotos descartadas (FR-023).

## Validación durante la implementación

- Etiquetas POR PAGAR: ubicar monto en "Total Monto O.F.".
- Envío con 2+ bultos.
- 2–3 guías más: confirmar MONTO NETO = líneas.
- ≥ 50 etiquetas para SC-003.
