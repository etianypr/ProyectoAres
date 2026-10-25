# Quickstart: validar la reestructuración

**Línea base (2026-10-24, antes de mover nada)**: 501 pruebas, lint y build en verde; 13
archivos de `src/` con más de 400 líneas (el mayor, `pantalla.tsx`, 1.699). Excepciones
iniciales de `pruebas/arquitectura.test.mjs`: A2 (1), A3 (5), A5 (3 por mover + 1 por crear),
A6 (14), A7 (13), A8 (102 archivos con "chofer").

## Cada fase

```bash
npm test && npm run lint && npm run build
```

Lista de excepciones de `arquitectura.test.mjs` igual o más corta que antes. Prueba manual:
conductor (login → pedido → ruta → entrega → cerrar) y panel (Encomiendas, día, Conductores).

Probar en el Android del conductor (APK de la 015). Si la hoja deslizable vuelve a fallar, el
aviso de depuración se recupera con `git show 001a468:src/components/encomiendas/debug-errores.tsx`.

## Renombrado (US2), en una copia de la base

1. Invariantes de `data-model.md` → `antes.txt`.
2. Correr la migración: `select` final todo `true`. Correrla otra vez: sin cambios.
3. Invariantes → `despues.txt` = `antes.txt` (salvo `chofer` → `conductor` en roles).
4. `pruebas/esquema.mjs` y `pruebas/base.mjs` con `.env.copia`: verdes.
5. App contra la copia: prueba manual + invitar conductor + `/choferes` redirige.
6. Cola vieja: app anterior sin migrar, dos entregas offline → migrar → app nueva → llegan
   una vez con `conductor_id`.

## Producción

Después de la 01:00 y sin conductores en ruta: respaldo → migración → despliegue →
invariantes → prueba manual. Si falla antes de desplegar: la transacción revierte o se
restaura el respaldo.
