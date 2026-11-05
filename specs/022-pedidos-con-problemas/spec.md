# Spec 022 · Pedidos con problemas (⚠) dentro de la ruta

**Creada**: 2026-11-05 · **Estado**: borrador (falta definirla con `/speckit-specify` o a mano) ·
**Rama**: sin empezar · **Pedido del dueño**: `AGENTS.md`, «El flujo del conductor» (paso 2) y
«Pedidos con problemas (⚠)».

## Hoy (según `AGENTS.md`; confirmar en el código al empezar)
- El ⚠ solo marca la OF distinta. Los demás problemas se avisan en la pantalla donde aparecen, pero
  no quedan en el pedido.
- Un pedido sin resolver queda **fuera** de la ruta, con una advertencia
  (`generar-ruta/ubicar-pedidos.ts`).
- No hay aviso dos paradas antes.

## Debe
- Cada problema queda como ⚠ **en el pedido** desde que aparece:
  - **Al leer la guía:** OF ilegible o distinta de 9 dígitos, dirección sin ubicar o calle que existe
    en dos o más lugares.
  - **Al armar la ruta:** parada muy lejos de las demás, o que no alcanza su horario.
  - **Al escanear:** dirección distinta de la guía, paquete fuera de la guía o bultos sin escanear.
- Los ⚠ de la guía se intentan resolver **antes** de armar la ruta: el conductor elige el lugar o
  llama al receptor (el teléfono, en Infologistic).
- Si no se resuelve, el pedido entra a la ruta con la primera dirección que encontró la búsqueda,
  sin perder el ⚠.
- La app avisa **dos paradas antes** de llegar a un pedido con ⚠, para confirmar antes de ir.

## Por definir
- Dónde se guarda el ⚠: ¿un campo nuevo en `pedidos` (lista de problemas) o se deriva del estado?
  Si es un campo nuevo, cambia el formato de datos: se pregunta antes y sube la versión de `idb.ts`.
- Cómo se ve el aviso dos paradas antes: ¿voz, tarjeta o burbuja? Depende de la 020.
- Cuándo se considera resuelto cada tipo de ⚠.

## Cruces
016 y 018 (ubicar direcciones) · 005 (escaneo) · 017 (horarios) · 020 (burbuja, para el aviso).
