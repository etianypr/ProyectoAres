# Spec 024 · La ruta por cuatro criterios

**Creada**: 2026-11-05 · **Estado**: borrador (falta definirla) · **Rama**: sin empezar ·
**Pedido del dueño** (`AGENTS.md`, «Rutas»): las rutas se evalúan por km, tiempo, porcentaje de
éxito por parada y ganancia.

## Hoy
- El optimizador ordena por km, con zonas de 900 m y horarios (`generar-ruta/`,
  `rutas/orden-paradas/`).
- La ruta es cerrada y cada zona se recorre una sola vez.

## Debe
- Cada propuesta de ruta se compara por los cuatro criterios.
- Se muestra una propuesta por defecto, y hasta tres solo si difieren de verdad.

## Por definir
- Cómo se mide cada criterio con lo que hay en el teléfono:
  - **tiempo:** la matriz de ORS ya trae duraciones;
  - **éxito por parada:** ¿disponibilidad, contacto o horario? Un pedido es de un solo día y sus
    datos se borran al cerrarlo;
  - **ganancia:** ¿la tarifa del día (`pago.ts`) y el costo del km?
- Cuánto pesa cada uno, o si se muestran lado a lado y elige el conductor.
- Lo que ya se midió y se descartó está en `docs/HOJA-DE-RUTA.md`: sectorizar alarga la ruta, y no
  se proponen ALNS, Tabu ni colonias de hormigas. Leerlo antes de proponer.

## Cruces
017 (horarios y orden) · 022 (paradas con ⚠) · 006 (indicadores: entregas sobre asignado).
