# Data Model: OF y referencia del paquete (003)

Modelo completo: `docs/CLASES.md`.

## `Pedido` (store `pedidos`) — campos nuevos

| Campo | Tipo | Regla |
|---|---|---|
| `of` | `string \| null` | 9 dígitos sin separadores; opcional; aviso (no bloqueo) si otro pedido del día tiene la misma |
| `referencia` | `{ tipo, tamano, color, nota } \| null` | `tipo` ∈ caja · bolsa · sobre · otro; `tamano` ∈ chico · mediano · grande; `color` ∈ café · blanco · negro · gris · amarillo · azul · rojo · verde · transparente; `nota` ≤ 40 caracteres; cada campo puede ser `null` |
| `fotoId` | `string \| null` | id en el store `fotos` |

`alDia()` completa los tres con `null` en pedidos anteriores (sin migración del store).

## `Foto` (store `fotos`, IndexedDB v5)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUIDv7 | clave |
| `pedidoId` | string | — |
| `fecha` | día de trabajo | índice `por_fecha`: el borrado del día (007) busca las claves sin cargar las imágenes |
| `blob` | `Blob` JPEG | ≤ 1280 px, calidad 0,7 |

- Una foto por pedido (reemplazar borra la anterior).
- Se borra al cerrarse el pedido (entregado o no entregado) cuando vence la ventana de deshacer,
  al eliminar el pedido sin restaurar (la purga siguiente o el cierre del día) y al cerrar el día.
  Restaurar dentro del deshacer la conserva.

## Funciones puras (`paquete.ts`)

- `formatoOf("123456789")` → `"123 456 789"` · `ofValida(texto)` → 9 dígitos o `null`.
- `textoReferencia(ref)` → `"Bolsa gris grande · cinta roja"`; `null` sin datos.
- `buscarPorOf(pedidos, digitos)` → pedidos pendientes cuya OF termina en esos dígitos (≥ 3).
- `notaPaquete(texto)` (recorta a 40) · `referenciaOVacia(ref)` (sin datos → `null`).
- La referencia concuerda en género: "Caja blanca chica", "Sobre blanco chico"; tipo "otro" se lee "Paquete".
