-- ============================================================================
-- 0008 — El aviso pide confirmar la dirección (spec 004). Re-ejecutable.
--        Ejecutar ANTES de desplegar el código de la spec 004.
--
-- El receptor contesta con un formulario de WhatsApp: «Sí, es correcta» o «No,
-- es otra», más la referencia o la dirección correcta. El webhook guarda:
--   · respuesta_accion  DIRECCION_SI o DIRECCION_NO (además de las de la 0004);
--   · respuesta_texto   lo que escribió, con tope de 300 caracteres.
--
-- respuesta_texto es un dato del receptor en el servidor (excepción aceptada por
-- el dueño, 2026-11-09; docs/PRIVACIDAD.md). Vive lo que vive la fila: se borra
-- cuando el teléfono confirma que la guardó (/api/whatsapp/status) y, si no, a
-- las 72 h (expira_en y el barrido de la 0003).
-- ============================================================================

alter table encomienda_whatsapp_correlaciones
  drop constraint if exists encomienda_whatsapp_correlaciones_respuesta_accion_check;

alter table encomienda_whatsapp_correlaciones
  add constraint encomienda_whatsapp_correlaciones_respuesta_accion_check
  check (
    respuesta_accion is null
    or respuesta_accion in ('CONFIRMAR', 'MANANA', 'HORARIO', 'RECHAZAR', 'DIRECCION_SI', 'DIRECCION_NO')
  );

alter table encomienda_whatsapp_correlaciones
  add column if not exists respuesta_texto text;

alter table encomienda_whatsapp_correlaciones
  drop constraint if exists encomienda_whatsapp_correlaciones_respuesta_texto_check;

alter table encomienda_whatsapp_correlaciones
  add constraint encomienda_whatsapp_correlaciones_respuesta_texto_check
  check (respuesta_texto is null or char_length(respuesta_texto) <= 300);

comment on column encomienda_whatsapp_correlaciones.respuesta_texto is
  'Referencia o dirección correcta que escribió el receptor en el formulario (spec 004). Se borra con la fila: al confirmar el teléfono o a las 72 h.';

notify pgrst, 'reload schema';

-- Verificación: todo true.
select
  exists (
    select 1 from information_schema.columns
    where table_name = 'encomienda_whatsapp_correlaciones' and column_name = 'respuesta_texto'
  ) as hay_respuesta_texto,
  exists (
    select 1 from pg_constraint
    where conname = 'encomienda_whatsapp_correlaciones_respuesta_accion_check'
      and pg_get_constraintdef(oid) like '%DIRECCION_NO%'
  ) as acepta_direccion,
  exists (
    select 1 from pg_constraint
    where conname = 'encomienda_whatsapp_correlaciones_respuesta_texto_check'
  ) as texto_con_tope;
