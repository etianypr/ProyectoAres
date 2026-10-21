-- ============================================================================
-- 0004 — El aviso pregunta "¿Estarás en tu domicilio?" (spec 010).
--        Ejecutar DESPUÉS de la 0003, en Supabase > SQL Editor, y ANTES de
--        desplegar el código de la spec 010. Re-ejecutable.
--
-- Los botones de la plantilla pasan a ser: Sí, estaré · Mañana · Otro horario.
-- "Mañana" ocupa el lugar que tenía "No lo recibiré" y su payload es MANANA. El
-- teléfono lo registra como no entregado (specs 010 y 012), así que
-- encomienda_actividad no cambia: solo la acción que guarda el webhook.
--
-- RECHAZAR se sigue aceptando: correlaciones creadas antes del cambio (viven
-- 72 h como máximo) y el código anterior mientras se despliega el nuevo. El
-- código nuevo lo lee como MANANA (ver leerPayloadBoton) y nunca lo escribe.
-- ============================================================================

alter table encomienda_whatsapp_correlaciones
  drop constraint if exists encomienda_whatsapp_correlaciones_respuesta_accion_check;

alter table encomienda_whatsapp_correlaciones
  add constraint encomienda_whatsapp_correlaciones_respuesta_accion_check
  check (
    respuesta_accion is null
    or respuesta_accion in ('CONFIRMAR', 'MANANA', 'HORARIO', 'RECHAZAR')
  );
