# Data Model: Indicadores del negocio

Modelo completo: `docs/CLASES.md`, `docs/ARQUITECTURA.md` §2.

## Servidor (Postgres)

| Objeto | Cambio | Regla |
|---|---|---|
| `encomienda_jornadas.asignados` | nueva `int null check (asignados >= 0)` | la escribe el teléfono al cerrar; null = jornada anterior a esta spec |
| `encomienda_meta_entregas_dia()` | nueva función `security definer`, `stable` | devuelve `meta_entregas_dia` de la regla de la empresa; `grant execute` a `authenticated` |
| resto | sin cambios | margen sale de `encomienda_pagos` |

Migración: la próxima migración libre (`000N_indicadores.sql`), re-ejecutable, con `select` de verificación. Nombres según 002-US2 (`conductor_id` si ya corrió).

## Teléfono
- `sincronizarJornada()` envía `asignados`. Sin stores nuevos (el resumen diario es de la spec 007).
- La meta del día llega por props desde la página; el avance = entregas del día en `Ruta`.

## Indicador (calculado, no se guarda)

```text
Indicadores { entregas, intentos, tasaEntrega, noEntregas,
              duracionMediaMin, entregasPorHora,
              asignados, tasaSobreAsignados, desdeFechaAsignados,
              ingreso, pago, margen }
Comparacion { actual: Indicadores, anterior: Indicadores, diferencia }
```
Entradas: eventos de `encomienda_actividad`, `encomienda_jornadas`, `encomienda_pagos` del período y del anterior.
