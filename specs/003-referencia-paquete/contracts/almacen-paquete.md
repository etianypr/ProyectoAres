# Contrato: funciones nuevas del almacén local

Interfaz que usan las pantallas. Las garantías son las que verifican las pruebas.

## `lib/encomiendas/local/paquete.ts` (puro, sin IndexedDB)

| Función | Entrada → Salida | Garantía |
|---|---|---|
| `asignarNumeros(idsEnOrden, actuales)` | `string[]`, `Map<string, number>` → `Map<string, number>` | Si `actuales` está vacío: posición 1…N en el orden dado. Si no: conserva los existentes y da mayor + 1, + 2… a los que no tienen, en el orden de la ruta. Nunca cambia un número existente ni repite uno |
| `describirPaquete(ref)` | `ReferenciaPaquete \| null` → `string` | "Bolsa gris grande · cinta roja"; partes faltantes se omiten; `null` → "sin referencia" |
| `buscarPorNumero(pedidos, n)` | `Pedido[]`, `number` → `Pedido \| null` | Solo entre pedidos activos |
| `ordenDeCarga(ruta, pedidos)` | `Ruta`, `Pedido[]` → `{pedido, cargado}[]` | Paradas pendientes de la ruta, del último al primero en el orden de visita |

## `lib/encomiendas/local/almacen/` (cambios y altas)

| Función | Cambio | Garantía |
|---|---|---|
| `guardarRuta(entrada)` | asigna números con `asignarNumeros()` y conserva `cargados` | Dos confirmaciones en paralelo no producen números repetidos (corre en `enFila()`); reoptimizar no cambia números existentes; devuelve qué pedidos recibieron número nuevo para avisar al conductor |
| `guardarPedido(datos, id?)` | conserva `numero` y `fotoId` al editar | Editar nunca cambia el número |
| `restaurarPedido(eliminado, fecha)` | conserva el número | El pedido restaurado vuelve con su número |
| `marcarCargado(fecha, pedidoId, cargado)` | **nueva** | Persiste la marca; idempotente |

## `lib/encomiendas/local/fotos.ts` (cliente)

| Función | Garantía |
|---|---|
| `comprimirFoto(archivo)` | Devuelve un JPEG ≤ 800 px de lado mayor |
| `guardarFoto(pedidoId, blob)` | Devuelve el `fotoId`; reemplaza la foto anterior del pedido |
| `leerFoto(fotoId)` | `Blob \| null` |
| `borrarFoto(fotoId)` | Idempotente |
| `purgarFotos()` | Borra huérfanas y las de pedidos no activos; devuelve cuántas borró |

Nada de este contrato escribe en el store `cola` ni hace llamadas de red. El borrado de
todo al cerrar el día es de la spec 007.
