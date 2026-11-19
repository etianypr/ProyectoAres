# 043 · Segunda pasada del panel

Dueño, 2026-11-19: «anda con fase 5». Lo que quedó de la auditoría del panel después de la 042,
como la segunda pasada que tuvo la app del conductor en la 041: piezas repetidas a mano que pasan a
las compartidas. Solo lo visual, sin tocar lógica.

## Qué cambió
- **Diálogos**: «Eliminar conductor» y «Agregar día trabajado» usan `Dialogo` (portal, Escape y la
  página de atrás quieta en un solo lugar). Antes cada uno tenía su portal y su Escape; el de
  eliminar no bloqueaba el scroll de atrás. `Dialogo` gana `relleno={false}` para un formulario con
  su propio scroll y el pie fijo, y queda en la escala (`rounded-2xl`, cabecera `bg-card`, cerrar de
  36 px). La advertencia «tiene días de reparto registrados» pasa a la descripción del diálogo.
- **Botones**: «Sí, eliminar definitivamente» y «Cancelar» con `buttonClass` (el rojo del token).
- **Títulos de sección** de la ficha del conductor como rótulo, igual que los KPI.

## Fuera
Login y contraseña conservan su fondo cálido y su propio armado. Las tablas (`tabla-dias.tsx`,
`conductor-accordion.tsx`) quedan como están: entre ellas ya son iguales.

## Falta
Recorrer con la cuenta del jefe: Conductores → eliminar (las dos opciones y Cancelar) y Encomiendas →
«Agregar día» (scroll del formulario y pie fijo).
