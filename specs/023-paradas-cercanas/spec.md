# Spec 023 · Paradas cercanas en cada parada

**Creada**: 2026-11-05 · **Estado**: borrador (falta definirla) · **Rama**: sin empezar ·
**Pedido del dueño** (`AGENTS.md`, «Navegación»): "es importante que en cada parada también te
muestre qué paradas tienes cerca (esto por si tenemos un pedido pendiente o agendamos una entrega
que la aplicación no sabe)".

## Hoy
- La parada abierta muestra solo su pedido. Para saber qué otras paradas hay cerca, el conductor
  tiene que mirar el mapa o la lista.

## Debe
- En cada parada, las paradas que quedan cerca, para aprovechar el paso:
  - un pedido que quedó pendiente («Dejar como pendiente» lo mandó al final);
  - una entrega que el receptor agendó por teléfono y que la app no conoce.

## Por definir
- ¿Va dentro de la 020 (burbuja de Google Maps) o sola? Está abierto desde el 2026-11-05.
- Qué es «cerca»: ¿metros en línea recta o minutos por calle (ORS)? ¿Cuántas paradas se muestran?
- Cuáles cuentan: pendientes, las que están más adelante en la ruta y las no entregadas del día.
- Qué pasa al tocar una: ¿se adelanta en la ruta, se abre o solo se marca?

## Cruces
020 (burbuja y parada abierta) · 017 (orden y «Dejar como pendiente») · 022 (⚠ dos paradas antes).
