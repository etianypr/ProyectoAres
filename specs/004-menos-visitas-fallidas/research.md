# Research: Menos visitas fallidas

## R1. Abrir el WhatsApp del conductor
- **Decision**: enlace `https://wa.me/<569XXXXXXXX>?text=<mensaje codificado>` (número sin "+", normalizado con `lib/whatsapp/telefono.ts`). Al volver la app a primer plano (`visibilitychange`) se registra el aviso como "abierto HH:MM".
- **Rationale**: abre WhatsApp o WhatsApp Business desde la PWA sin permisos ni API. No se puede saber si el conductor apretó enviar: la app no lo afirma.
- **Alternatives**: API de Meta (inactiva, US4); SMS (solo respaldo si no hay WhatsApp).

## R2. Tiempo estimado a la parada ("voy llegando")
- **Decision**: guardar por parada la distancia y duración del tramo que devuelve Mapbox al trazar la ruta (`Ruta.tramos`). En ruta: minutos ≈ metros restantes por el trazado (`metrosRestantes`, existente) ÷ velocidad del tramo (distancia/duración). Sin tramo: 20 km/h.
- **Rationale**: offline, sin llamadas nuevas; la respuesta de Mapbox ya trae `legs` por par de paradas.
- **Alternatives**: pedir ETA a Mapbox en cada lectura de GPS (red y cuota).

## R3. Franja del aviso programado
- **Decision**: hora de inicio de la ruta + duración acumulada hasta la parada, redondeada al bloque de 2 h de `config.ts` que la contiene. Sin ruta: "durante el día".
- **Rationale**: reusa los bloques horarios que ya entiende el receptor (001).

## R4. Plantillas
- **Decision**: dos textos en `empresa` (`mensaje_aviso`, `mensaje_llegando`; null = texto por defecto de `config.ts`) con marcadores `{nombre}`, `{franja}`, `{minutos}`, `{negocio}`. Al guardar se exige `{negocio}` y la palabra "Starken" (007 FR-010).
- **Rationale**: mismo patrón que `bloques_horarios_activos` (columna en `empresa`, formulario en `configuracion/`).

## R5. Sin doble aviso
- **Decision**: antes de ofrecer el aviso programado se revisan `Pedido.mensajes` y el aviso automático (`Pedido.aviso`) (`Pedido.aviso.estado ≠ pendiente` = ya avisado por el automático).
