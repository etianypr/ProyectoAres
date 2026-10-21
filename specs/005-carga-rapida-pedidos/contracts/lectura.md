# Contrato: `POST /api/lectura`

Servidor Next.js, `server-only`. Conductor autenticado (`lib/auth/api-conductor`). Sin persistencia ni logs de cuerpo.

**Solicitud** (`multipart/form-data`): `tipo` = `guia` | `etiqueta`; `imagen` JPEG (guía ≤ 2576 px, etiqueta ≤ 1280 px, ≤ 5 MB).

**Respuesta 200**: `{ "tipo": "guia", "campos": GuiaIA | EtiquetaIA, "dudosos": ["lineas[3].of"] }`

### Schema `GuiaIA` (salida estructurada del modelo)

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["folio", "totalDeclarado", "lineas"],
  "properties": {
    "folio": { "type": ["string", "null"] },
    "totalDeclarado": { "type": ["integer", "null"], "description": "MONTO NETO si cada línea vale 1" },
    "lineas": { "type": "array", "items": {
      "type": "object", "additionalProperties": false, "required": ["of", "destino"],
      "properties": { "of": { "type": "string" }, "destino": { "type": "string" } } } }
  }
}
```

### Schema `EtiquetaIA`

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["of", "bulto", "bultosTotal", "destinatario", "telefono", "direccion",
               "pago", "montoPorPagar", "descripcion", "dudosos"],
  "properties": {
    "of": { "type": ["string", "null"] },
    "bulto": { "type": ["integer", "null"] },
    "bultosTotal": { "type": ["integer", "null"] },
    "destinatario": { "type": ["string", "null"] },
    "telefono": { "type": ["string", "null"] },
    "direccion": { "type": ["string", "null"] },
    "pago": { "enum": ["POR_PAGAR", "CONTADO", "CTA_CTE", "DESCONOCIDO"] },
    "montoPorPagar": { "type": ["integer", "null"] },
    "descripcion": { "type": "object", "additionalProperties": false,
      "required": ["tipo", "tamano", "color", "nota"],
      "properties": {
        "tipo": { "enum": ["caja", "bolsa", "sobre", "otro", null] },
        "tamano": { "enum": ["chico", "mediano", "grande", null] },
        "color": { "type": ["string", "null"] },
        "nota": { "type": ["string", "null"], "maxLength": 40 } } },
    "dudosos": { "type": "array", "items": { "type": "string" } }
  }
}
```

## Reglas del servidor

- Ajustar los schemas a las palabras clave de JSON Schema que admite la salida estructurada de la API (verificar al implementar; si `maxLength` no se admite, recortar en el servidor).
- Valida la salida con `lib/encomiendas/lectura/{guia,etiqueta}.ts`; lo que no pasa va a `dudosos`.
- El `of` de la IA nunca reemplaza al del código de barras (lo decide el teléfono).
- No pide ni devuelve RUT, remitente, correo ni cuenta corriente.
- Errores: `401` sin sesión de conductor · `413` imagen grande · `422` imagen ilegible · `503` proveedor caído o función apagada en modo oficial (007). El teléfono reintenta `503` y guarda en `lecturasPendientes`.
