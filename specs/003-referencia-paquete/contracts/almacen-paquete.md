# Contrato: almacén del paquete (003)

Funciones nuevas del barril `src/lib/encomiendas/local/almacen`, en `almacen/paquete.ts` (todas en `enFila`, sin red).

| Función | Entrada | Salida | Efecto |
|---|---|---|---|
| `guardarPaquete` | `pedidoId`, `{ of?, referencia? }` | `{ ofRepetida: boolean }` | Escribe `of` (validada) y `referencia` en el pedido; avisa si la OF ya está en otro pedido del día |
| `guardarFoto` | `pedidoId`, `Blob` (ya comprimido) | `fotoId` | Reemplaza la foto anterior del pedido y actualiza `Pedido.fotoId` en la misma transacción |
| `leerFoto` | `fotoId` | `Blob \| null` | — |
| `borrarFoto` | `pedidoId` | `void` | Quita la foto y deja `fotoId = null` |
| `purgarFotosCerradas` | `fecha` | `number` (borradas) | Borra las fotos de pedidos cerrados y las huérfanas del día; se llama al vencer la ventana de deshacer |
| `ofRepetida` | `fecha`, `of`, `exceptoId?` | `boolean` | — (el formulario avisa después de guardar) |

`guardarPedido` también acepta `of` y `referencia`; si no vienen, conserva los que tenía.

`comprimirFoto(archivo: File): Promise<Blob>` vive en `local/foto.ts` (usa canvas; no es del
almacén).
