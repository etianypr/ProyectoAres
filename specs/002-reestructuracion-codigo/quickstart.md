# Quickstart: validar la reestructuración

## Cada fase

```bash
npm test && npm run lint && npm run build
```

Lista de excepciones de `arquitectura.test.mjs` igual o más corta que antes. Prueba manual:
conductor (login → pedido → ruta → entrega → cerrar) y panel (Encomiendas, día, Conductores).

Pendiente en iPhone real: bug de la hoja deslizable en Safari. Si reaparece, el aviso de
depuración se recupera con `git show 001a468:src/components/encomiendas/debug-errores.tsx`.

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
