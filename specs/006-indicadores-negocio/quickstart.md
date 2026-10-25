# Quickstart: Indicadores del negocio

## Automático
```bash
npm test && npm run lint && npm run build     # incluye pruebas/indicadores.test.mjs
npm run test:esquema && npm run test:base      # contra la base (credenciales en .env.local)
```

## Panel
1. Período con 2 semanas de actividad de prueba → entregas, intentos, tasa, no entregas, duración media, entregas/hora coinciden con el cálculo manual.
2. Cambiar el período → la comparación usa el período anterior de igual largo, con signo.
3. Día con día abierto → fuera de duración y entregas/hora, con aviso.
4. Día manual → cuenta en entregas y margen, no en duración ni asignados.
5. Día 40 entregas × $950, pago $25.000 → margen $13.000.

## Teléfono
6. Cerrar un día con 25 pedidos, 18 con llamada contestada o aviso respondido → `asignados = 25`, `contactados = 18`; el panel muestra entregados/asignados y contactados/asignados.
7. Regla con meta 45 → contador "N de 45"; sin conexión avanza igual. Regla sin meta → no aparece.

## Privacidad
8. Los únicos datos nuevos que viajan son `asignados` y `contactados` (dos números).
