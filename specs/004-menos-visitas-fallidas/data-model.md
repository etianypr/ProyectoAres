# Data Model: Menos visitas fallidas

Ver modelo completo en `docs/CLASES.md` y `docs/ARQUITECTURA.md` §2.

## Teléfono (IndexedDB, se borra al cerrar el día — spec 007)

| Objeto | Cambio | Regla |
|---|---|---|
| `Pedido.mensajes` | nuevo `MensajeEnviado[]` | `alDia()` completa `[]` |
| `MensajeEnviado` | `{ tipo: "programado" \| "llegando", canal: "whatsapp_propio" \| "automatico" \| "llamada", hora: ISO }` | se agrega con `registrarMensaje()` dentro de `enFila()` |
| `Ruta.tramos` | nuevo `{ pedidoId, distanciaM, duracionS }[]` opcional | se guarda al trazar la ruta; `rutaAlDia()` completa `[]` |

Sin cambio de versión de IndexedDB (solo campos dentro de stores existentes).

## Servidor (Postgres)

| Tabla | Cambio | Regla |
|---|---|---|
| `empresa` | `mensaje_aviso text null`, `mensaje_llegando text null` | null = texto por defecto; sin datos de receptores; RLS existente (lectura autenticados, escritura admin/operador) |

Migración: la próxima migración libre (`000N_avisos.sql`), re-ejecutable, con `select` de verificación.

## Derivados (no se guardan)

- **No entregados** = pedidos del día con `resultado = no_entregado`. Muestra OF (spec 005) o, sin OF, número del paquete (003) y dirección.
- **Ya avisado** = `mensajes` tiene un "programado" o el aviso automático (`Pedido.aviso`) ≠ pendiente.

## Lo que NO cambia
Cola de eventos, actividad, días, pagos. Ningún dato de receptor sale del teléfono.
