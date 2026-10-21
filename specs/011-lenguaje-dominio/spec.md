# Feature Specification: Un mismo idioma para el dominio

**Feature Branch**: `011-lenguaje-dominio` · **Created**: 2026-10-21 · **Status**: Implementada la parte 1 (la base va en 002 T049–T050)

**Input**: "Verificar si estamos manejando el mismo idioma de clases y atributos: en vez de
jornada, día de trabajo; RutaLocal, PedidoLocal, EventoCola y EncomiendaJornada no quedan
claros." · "Apruebo totalmente el cambio." · "¿Por qué existen dos avisos si se podría separar
solamente con el estado?"

**Decisiones**:
- Glosario único (abajo): el mismo nombre en el diagrama, el código y la pantalla.
- **Un solo aviso por pedido**, con su estado. En el teléfono es un campo del pedido
  (`Pedido.aviso`), no un store aparte. En el servidor queda una copia temporal porque la
  respuesta de Meta llega al servidor y el pedido vive en el teléfono; guarda solo el código, el
  estado y la respuesta.
- Parte 1 (esta spec): código, textos de pantalla y campos del teléfono (entran en la v3 de
  IndexedDB, que todavía no salió). Parte 2: tablas y columnas de la base, junto con
  `chofer` → `conductor` (spec 002 US2). Hasta entonces el contrato HTTP y la base conservan
  sus nombres.

## Glosario

| Concepto | Nombre |
|---|---|
| Día de trabajo de un conductor (servidor) | `DiaTrabajo` (antes `EncomiendaJornada`) |
| Resumen de un día | `ResumenDia` (antes `DiaJornada`) |
| Estado de la pantalla del día | `useDiaTrabajo` → `DiaEnCurso` (antes `useJornada` / `Jornada`) |
| Paquete a entregar ese día | `Pedido` (antes `PedidoLocal`) |
| Orden de visita y trazado del día | `Ruta` (antes `RutaLocal`) |
| Pedido en la ruta, con su número | `Parada` (antes `ParadaVista`) |
| Hecho que cuenta para el pago, esperando señal | `ActividadPorEnviar` (antes `EventoCola`) |
| Ese hecho en el servidor | `Actividad` (antes `EncomiendaActividad`) |
| Aviso de WhatsApp de un pedido | `Pedido.aviso: Aviso` (antes `CoordinacionWhatsApp`) · servidor: `Aviso` (antes `EncomiendaWhatsappCorrelacion`) |
| Estado del aviso | `EstadoAviso` (antes `EstadoMensaje`) |
| Lo que valió el día | `PagoDelDia` (antes `EncomiendaPago`) |
| Tarifa vigente · los seis números · la de un día | `ReglaDePago` · `Tarifa` · `TarifaDelDia` |
| Facturación | `PeriodoFacturacion`, `IngresoReal` |
| Resultado de la visita | `Pedido.resultado` / `horaResultado`: `ResultadoVisita` (antes `entrega`; valores en la spec 012) |
| Llamada | `Pedido.llamada`: `ResultadoLlamada` |
| Inicio y cierre del día | `Ruta.inicio` / `Ruta.cierre` (antes `generadaEn` / `cerradaEn`) |
| Camino por calles | `trazado: Trazado` (antes `geometria`) |
| Avisos en la pantalla del conductor | `Notificacion` (antes `Aviso` de la UI) |
| En pantalla | "día" (antes "jornada") |

## Requirements *(mandatory)*

- **FR-001**: El teléfono MUST guardar el aviso dentro del pedido; el store `whatsapp` desaparece en la v3.
- **FR-002**: Tipos, funciones, campos del teléfono y textos de pantalla MUST usar el glosario.
- **FR-003**: Base, columnas y contrato HTTP MUST NOT cambiar en esta parte (parte 2 con 002 US2).
- **FR-004**: `docs/CLASES.md`, `docs/ARQUITECTURA.md` y `AGENTS.md` MUST usar el glosario.

## Success Criteria *(mandatory)*

- **SC-001**: Ningún nombre de la columna "antes" queda en `src/` ni en `pruebas/` (salvo nombres de tablas y columnas de la base).
- **SC-002**: Suite, lint y build en verde; la migración v3 convierte una base v2 con avisos.
