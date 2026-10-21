# Research: Número y referencia de cada paquete

## R1. Cómo se asigna el número

- **Decision** (2026-10-20, definida por el responsable del producto): el número es la
  **posición en la ruta optimizada** al confirmarla por primera vez en el día (1…N). Se
  asigna dentro de `guardarRuta()` de `almacen/`, que ya corre en `enFila()`. Desde ahí
  queda **fijo** durante el día:
  - al reoptimizar, los pedidos que ya tienen número lo conservan;
  - los pedidos que entran después reciben el mayor número asignado + 1;
  - la app muestra el orden de visita con los números escritos (1, 2, 6, 3…).
- **Rationale**: el conductor escribe el número con rotulador al cargar; cambiarlo después
  dejaría paquetes rotulados con un número que la app ya no reconoce. El borrado diario
  (spec 007) hace que cada día empiece de 1, así que no hace falta una secuencia que
  evite repetir números entre días.
- **Alternatives considered**: (a) secuencia circular independiente de la ruta (versión
  anterior de esta spec) —se descartó porque el negocio pidió la posición en la ruta y el
  borrado diario elimina el problema que resolvía; (b) renumerar al reoptimizar —se
  descartó porque invalida lo ya escrito en los paquetes.

## R2. Pedidos guardados antes de esta funcionalidad

- **Decision**: los pedidos de la versión 2 sin número reciben uno en la próxima
  confirmación de ruta, como cualquier pedido nuevo (mayor + 1, o la posición si es la
  primera numeración del día).
- **Rationale**: no hace falta un paso de migración aparte; `alDia()` completa
  `numero: null` al leer.

## R3. Dónde vive la marca de "cargado"

- **Decision**: en la ruta del día, `Ruta.cargados: string[]`. `guardarRuta()` la
  conserva al rehacer la ruta.
- **Rationale**: la carga del vehículo es de ese día y se borra con él (spec 007).

## R4. Foto del paquete

- **Decision**: `<input type="file" accept="image/*" capture="environment">`, compresión con
  `<canvas>` a 800 px de lado mayor y JPEG calidad 0,6 (≈ 60–150 KB), guardada como `Blob`
  en el store `fotos`. El pedido guarda solo `fotoId`.
- **Rationale**: el `input` con `capture` abre la cámara en iOS y Android sin pedir permisos
  de `getUserMedia` ni manejar un visor propio. Guardar la foto aparte del pedido evita
  reescribir el blob cada vez que se edita el pedido o se marca una entrega.
- **Riesgo a verificar en el teléfono**: guardar `Blob` en IndexedDB de Safari. Si falla, se
  guarda como `ArrayBuffer` con su tipo; la interfaz de `fotos.ts` no cambia.

## R5. Borrado de fotos (FR-011)

- **Decision**: una foto se borra cuando su pedido deja de estar activo (entregado,
  rechazado o eliminado sin restaurar) y, en todo caso, con el borrado del día (spec 007).
  `purgarFotos()` al abrir la app borra además las huérfanas. Eliminar un pedido no borra su
  foto en el momento: el recibo de "deshacer" vive en memoria, así que la foto queda huérfana
  y se borra en la próxima apertura o al cerrar el día.
- **Rationale**: la foto puede mostrar la etiqueta con nombre y dirección: es un dato
  personal y no debe durar más que su uso (principio V).

## R6. Texto de la referencia

- **Decision**: `describirPaquete()` arma "Bolsa gris grande · cinta roja": tipo, color,
  tamaño (orden natural del castellano), y la nota después de un separador. Sin
  referencia: "sin referencia".
- **Rationale**: se lee igual que se busca con la vista. Una función pura con pruebas evita
  que cada pantalla lo arme distinto.

## R7. Versión de la base local

- **Decision**: subir `VERSION` a la siguiente libre en `idb.ts` (v4: la v3 la tomó la spec 009) y crear `fotos` (con índice `por_pedido`)
  en `onupgradeneeded`, con el patrón "si no existe, crear" que ya usa; registrar `fotos` en
  `STORES_DEL_DIA` (spec 007) para que el borrado diario lo incluya.
- **Rationale**: es la regla escrita en `idb.ts`: se sube la versión solo al agregar un
  store o un índice. Los campos nuevos de `pedidos` y `rutas` no la necesitan y se leen con
  valores por defecto en `alDia()` y `rutaAlDia()`.
