# Research: OF y referencia del paquete (003)

## R1 · Dónde vive la OF

- **Decision**: `Pedido.of: string | null` (9 dígitos, sin separadores). Se carga a mano (opcional)
  en el formulario; la 005 la llena desde el código de barras. Se muestra en grupos de 3
  (`123 456 789`).
- **Rationale**: es el "número de orden" que el conductor necesita al entregar y lo que va impreso
  en la etiqueta: sirve para reconocer el paquete sin escribir nada en él.
- **Alternatives**: número de posición escrito con rotulador (descartado por el dueño, 2026-10-24).

## R2 · Referencia del paquete

- **Decision**: `Pedido.referencia: { tipo, tamano, color, nota } | null` con listas cerradas en
  `catalogos.ts` (`TIPOS_PAQUETE`, `TAMANOS_PAQUETE`, `COLORES_PAQUETE`) y una función pura
  `textoReferencia()` ("Bolsa gris grande · cinta roja").
- **Rationale**: tres toques arman la referencia; la 005 puede llenarla desde la foto con IA usando
  los mismos valores.

## R3 · Foto del paquete

- **Decision**: store nuevo `fotos` en IndexedDB **v5** (la v4 es la de la 007) (`{ id, pedidoId, fecha, blob }`), JPEG
  reducido a 1280 px y calidad 0,7 en el teléfono (canvas), ~150 KB. `Pedido.fotoId` apunta a la
  foto. Se borra cuando el pedido se cierra (entregado o no entregado) y al cerrar el día (007).
- **Rationale**: las fotos no deben inflar el store `pedidos` (se lee entero en cada pantalla).
- **Alternatives**: guardar la foto en el pedido como base64 (lento, ×1,33 de tamaño) · subirla al
  servidor (prohibido: datos de destinatarios solo en el teléfono).

## R4 · Pedidos que ya existen

- `alDia()` completa `of: null`, `referencia: null`, `fotoId: null`: no hace falta migrar el
  store `pedidos`. La v5 solo agrega `fotos`.

## R5 · Búsqueda por OF

- **Decision**: buscar por los últimos dígitos (≥ 3) entre los pedidos del día; si coinciden
  varios, se listan todos con su parada. Función pura `buscarPorOf(pedidos, digitos)`.
