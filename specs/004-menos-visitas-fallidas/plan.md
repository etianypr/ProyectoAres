# Implementation Plan: Menos visitas fallidas

**Branch**: `004-menos-visitas-fallidas` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

## Summary

El aviso de WhatsApp de la 010 pasa a preguntar por la dirección: plantilla con un botón Flow, el
receptor responde en un formulario y la respuesta baja al teléfono por el mismo buzón de la 010
(código opaco, el teléfono busca y confirma). Se reutiliza todo lo de la 010; lo nuevo es la
plantilla, la lectura de `nfm_reply`, una columna temporal y dos campos del pedido.

## Cómo viaja

```
Teléfono ──POST /api/whatsapp/send {tipo:"direccion", nombre, teléfono, dirección}──▶ Servidor ──▶ Meta ──▶ receptor
  (al leer la etiqueta; el sondeo de 30 s manda los que falten)        guarda solo la correlación
Receptor ──formulario (confirma, texto, flow_token = código)──▶ Meta ──webhook──▶ Servidor
                                                         respuesta_accion + respuesta_texto (0008)
Teléfono ◀──GET /api/whatsapp/status── Servidor      → aplica en IndexedDB → POST confirma → fila borrada
```

## Estructura de datos

- **Postgres** (0008): `encomienda_whatsapp_correlaciones.respuesta_texto text` (≤ 300) y
  `respuesta_accion` acepta `DIRECCION_SI`/`DIRECCION_NO`. Sin tablas nuevas.
- **IndexedDB** (sigue en v6, sin store nuevo): `Pedido.direccionConfirmada: boolean | null`,
  `Pedido.referenciaReceptor: string | null` (los de antes, por `alDia`), y el ⚠
  `receptor_otra_direccion` en `Pedido.problemas`. `pedidos` ya está en `STORES_DEL_DIA`.
- Detalle en [data-model.md](data-model.md).

## Archivos

| Qué | Dónde |
|---|---|
| Acciones nuevas; botones de la 010 aparte | `lib/encomiendas/catalogos.ts` (`BOTONES_DISPONIBILIDAD`) |
| Leer y limpiar el formulario | `lib/encomiendas/config.ts` (`leerFormularioDireccion`, `limpiarTextoReceptor`) |
| Plantilla a Meta | `lib/whatsapp/confirmar-direccion.ts` (usa `mandar` de `meta.ts`) |
| Rutas | `api/whatsapp/send` (`tipo: "direccion"`), `webhook` (`nfm_reply`), `status` (`texto`) |
| Teléfono | `local/sincronizar-whatsapp.ts` (qué se avisa, envío), `local/aplicar-respuestas.ts` (nuevo, sale del anterior por las 400 líneas), `almacen/disponibilidad.ts` (`registrarRespuestaDireccion`) |
| Pantalla | `_componentes/problemas-pedido.tsx` (⚠), `contenido-hoja.tsx` (referencia en la parada), `_hooks/use-whatsapp-dia.ts` (aviso en pantalla) |
| Pruebas | `pruebas/confirmar-direccion.test.mjs` |

## Constitución

- II (dimensiones separadas): la confirmación de la dirección no toca `disponibilidad` ni el
  resultado.
- V (privacidad): excepción del dueño, registrada en `docs/PRIVACIDAD.md`; el texto vive en el
  servidor solo hasta que se baja.
- III (pruebas): Meta se sustituye con el doble del `fetch` (`pruebas/dobles/meta-whatsapp.mjs`).

## Docs que no calzaban con el código

- La versión anterior de esta spec describía el WhatsApp propio del conductor y «voy llegando»;
  quedó en «Después» de `spec.md`.
- `docs/PRIVACIDAD.md` decía que Meta recibía solo teléfono y nombre, y que Supabase no recibía
  datos de destinatarios: actualizado.
