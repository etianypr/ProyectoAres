# Research: Indicadores del negocio

## R1. Meta del bono en el teléfono
- **Hallazgo**: el conductor no puede leer `encomienda_reglas_pago` (RLS solo admin/operador, `0002_encomiendas.sql`).
- **Decision**: función `security definer` que devuelve solo `meta_entregas_dia` (int | null), con `grant execute` a `authenticated`; la página del conductor la llama por RPC y la pasa a la pantalla.
- **Rationale**: expone el mínimo; abrir la tabla entera mostraría tarifas que no hacen falta.
- **Alternatives**: política de lectura para el rol conductor (expone toda la regla).

## R2. Asignados
- **Decision**: al cerrar, `sincronizarDiaTrabajo()` (`lib/encomiendas/local/enviar.ts`) agrega `asignados` = pedidos del día (activos + cerrados en la ruta) al upsert de `encomienda_jornadas`. La política `encomienda_jornadas_conductor_update` ya permite la escritura.
- **Rationale**: un número; viaja en la misma llamada que el cierre.

## R3. Duración del día
- **Decision**: `inicio` → hora del último evento de actividad del día (no `cerrada_en`, que con el cron puede ser 00:30).

## R4. Margen
- **Decision**: `ingresos_totales − pago_total` de `encomienda_pagos` (ya calculados en SQL con tarifa congelada). No se reimplementa la fórmula: `pago.ts` y SQL siguen siendo las dos únicas copias (regla del README).
