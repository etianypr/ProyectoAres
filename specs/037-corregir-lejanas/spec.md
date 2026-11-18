# 037 · Corregir direcciones lejanas al optimizar la ruta

Terreno (dueño, 2026-11-17): al optimizar, una dirección quedó muy lejos de las demás. Desde la
vista previa no se podía editar la parada, y al corregir varias se olvidaba cuál faltaba.

## Qué cambia
- **Editar desde la vista previa.** Cada parada pendiente (lejana o sin ubicar) tiene «Editar», que
  abre el mismo formulario del pedido (`PedidoFormLocal`). Al guardar, el punto nuevo reemplaza al
  anterior en la propuesta **sin cambiar el orden**: no se recalcula nada por cada edición.
- **Franja de pendientes.** Franja delgada sobre los botones, con la dirección por corregir
  («Corregir 1 de 2 · Calle X 123»), «Editar» y «Mantener». Se oculta sin pendientes.
  - Una lejana sale de la lista cuando el punto nuevo queda a menos de `METROS_SOLA` de otra
    parada (`sigueLejos`, en línea recta) o con «Mantener» (queda en la ruta, sin ⚠ `lejana`).
  - Un pedido sin ubicar solo se puede editar: entra a la ruta al recalcular.
- **Recalcular ruta (manual).** Botón en la franja, destacado cuando hubo ediciones: vuelve a
  optimizar con los puntos nuevos (`calcularRutaLocal`, partiendo y terminando donde la propuesta).
  «Usar esta ruta» sigue igual; con ediciones sin recalcular, el aviso lo dice.

## Sin cambios de datos
No hay stores ni campos nuevos en IndexedDB: `PropuestaRuta.lejanas` ya se guardaba, y
`conCambios` es solo de pantalla.

## Verificación
- `pruebas/`: `sigueLejos` y `conPuntoNuevo` (orden intacto, lejana que sale, lejana que sigue).
- A mano a 360 px, modo prueba: guía con una dirección lejana → franja → «Editar» → corregir →
  sale de pendientes y el orden no cambia → «Recalcular ruta».
