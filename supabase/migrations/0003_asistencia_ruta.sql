-- ============================================================================
-- 0003 — Asistencia de ruta y entrega: motivo de no entrega y la correlación
--        temporal de WhatsApp, y los bloques horarios configurables.
--        Ejecutar DESPUÉS de la 0002, en Supabase > SQL Editor. Re-ejecutable.
--
-- ----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN AGREGA, Y LO QUE SE NEGÓ A AGREGAR
--
-- Agrega dos cosas:
--
--   1. `encomienda_actividad.motivo` — por qué no se entregó, en tres valores.
--      El jefe necesita distinguir "no encontré a la persona" de "el receptor
--      rechazó el pedido" (FR-021), y hasta ahora las tres cosas llegaban como
--      un 'omision' indistinguible. Es una etiqueta de tres valores: no dice
--      quién era el receptor ni dónde vivía.
--
--   2. `encomienda_whatsapp_correlaciones` — una fila TEMPORAL por aviso
--      mandado, con lo mínimo para que la respuesta del receptor pueda volver al
--      teléfono que la necesita.
--
-- Y se negó a agregar lo que habría sido mucho más cómodo: una tabla de pedidos.
-- Con los pedidos en la base, el webhook resolvería la respuesta con un join y
-- no haría falta nada de lo de abajo. Es exactamente lo que la 0027 del sistema
-- anterior retiró a propósito (Ley 21.719) y lo que el principio V de la
-- constitución del proyecto prohibe. El nombre, el teléfono y la dirección del
-- receptor siguen viviendo SOLO en el teléfono del conductor.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ HACE FALTA UNA CORRELACIÓN, EN CUATRO FRASES
--
-- 1. El receptor contesta tocando un botón de WhatsApp. Esa respuesta llega a un
--    webhook, o sea al SERVIDOR: Meta no sabe hablarle al IndexedDB de un
--    teléfono.
-- 2. El servidor no tiene los pedidos, así que no puede saber a cuál corresponde
--    esa respuesta ni a qué conductor mandársela.
-- 3. Entonces al mandar el aviso se guarda ACÁ una fila con un identificador
--    aleatorio, el conductor y el id local del pedido. Ese identificador viaja
--    dentro del payload del botón, así que la respuesta lo trae de vuelta.
-- 4. El teléfono consulta sus respuestas, las escribe en IndexedDB y recién
--    entonces confirma que las aplicó. Ahí la fila ya no hace falta.
--
-- Ver la Decisión 7 de specs/001-asistencia-ruta-entrega/research.md para las
-- alternativas que se descartaron (empujar por Web Push o por Realtime, y
-- empatar la respuesta por el número de teléfono del receptor).
--
-- ----------------------------------------------------------------------------
-- QUÉ NO GUARDA ESTA TABLA
--
-- Ni nombre, ni teléfono, ni hash del teléfono, ni dirección, ni cuerpo de la
-- conversación, ni orden de las paradas. El nombre y el teléfono los manda el
-- teléfono del conductor en el cuerpo de POST /api/whatsapp/send, se usan para
-- armar la llamada a Meta y no se persisten: viven en memoria del proceso lo que
-- dura esa consulta.
--
-- `pedido_id_local` es un UUID que generó el teléfono. Por sí solo no identifica
-- a nadie: no hay en toda la base ninguna fila que lo asocie a una persona.
--
-- RETENCIÓN: la fila se borra en cuanto se cierra la jornada del conductor
-- (trigger de abajo), y como máximo 72 horas después de crearse si la jornada
-- nunca se cierra (barrido de pg_cron). Si el teléfono confirma que ya aplicó la
-- respuesta antes de eso, se borra en ese momento.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Motivo de no entrega
-- ----------------------------------------------------------------------------
--
-- Nullable y sin default a propósito: las filas que ya están en la base se
-- registraron cuando la app tenía un solo botón de "no se pudo entregar" y no
-- preguntaba el motivo. Rellenarlas con un valor inventado sería peor que
-- dejarlas en blanco — el panel muestra "sin motivo registrado", que es
-- exactamente lo que se sabe de ellas.
alter table encomienda_actividad
  add column if not exists motivo text;

comment on column encomienda_actividad.motivo is
  'Por qué no se entregó: persona_no_encontrada | sin_respuesta | rechazo. Solo en filas de tipo omision. Etiqueta operativa, sin datos del receptor. null = omisión registrada antes de que la app preguntara el motivo.';

-- El motivo solo tiene sentido en una omisión: una entrega con motivo o una
-- llamada con motivo son un error de programación, no un dato posible.
do $$
begin
  alter table encomienda_actividad
    add constraint encomienda_actividad_motivo_check
    check (
      motivo is null
      or (tipo = 'omision' and motivo in ('persona_no_encontrada', 'sin_respuesta', 'rechazo'))
    );
exception
  when duplicate_object then null;  -- ya estaba: el archivo es re-ejecutable
end $$;

-- Índice parcial: el panel filtra por motivo para listar los rechazos, y solo
-- una fracción de las filas tiene motivo. Un índice completo sería casi todo
-- nulls.
create index if not exists idx_encomienda_actividad_motivo
  on encomienda_actividad (empresa_id, fecha, motivo)
  where motivo is not null;

-- ⚠️ El pago NO cambia. private.encomienda_congelar_dia() cuenta por `tipo`
-- ('entrega' suma, 'omision' no), y esta columna no entra en esa cuenta. Se
-- comprueba en la verificación del final.

-- ----------------------------------------------------------------------------
-- 1bis. Bloques horarios que se le ofrecen al receptor
-- ----------------------------------------------------------------------------
--
-- Cuáles de los seis bloques están activos (FR-010). Va en `empresa` y no en una
-- tabla propia porque es UNA lista de seis strings para UNA empresa: una tabla
-- con su RLS, sus policies y su trigger para eso sería más maquinaria que dato.
--
-- Los bloques en sí NO viven en la base: son constantes del código
-- (BLOQUES_HORARIOS en src/lib/encomiendas/config.ts). El motivo es que la
-- plantilla aprobada por Meta tiene una cantidad fija de botones y los ids viajan
-- dentro del payload; dejar que alguien invente tramos nuevos desde el panel
-- rompería las respuestas ya enviadas. Lo que el jefe elige es cuáles OFRECER.
--
-- null (el default) significa "los seis", y no "ninguno". Importa: una empresa
-- que nunca abrió esta pantalla tiene que ofrecer los seis bloques del documento
-- principal, no dejar al receptor sin opciones.
alter table empresa
  add column if not exists bloques_horarios_activos text[];

comment on column empresa.bloques_horarios_activos is
  'Ids de los bloques horarios que se le ofrecen al receptor por WhatsApp. null = los seis por defecto. Los tramos son constantes del código (config.ts), acá solo se elige cuáles ofrecer.';

-- ----------------------------------------------------------------------------
-- 2. Correlación temporal de WhatsApp
-- ----------------------------------------------------------------------------
create table if not exists encomienda_whatsapp_correlaciones (
  -- Aleatorio, generado por el servidor al mandar el aviso. Es lo ÚNICO nuestro
  -- que Meta llega a ver, y no se deriva de ningún dato del receptor: no hay
  -- nada que revertir por fuerza bruta (a diferencia de un hash del teléfono,
  -- que con nueve dígitos chilenos se rompe en minutos).
  correlation_id text primary key,
  empresa_id uuid not null references empresa(id) on delete cascade,

  -- on delete cascade, y no el "set null" que usa el resto de la base: acá no
  -- hay historial que preservar. Estas filas son coordinación en vuelo, y que
  -- borrar a un conductor se lleve sus correlaciones es lo correcto también por
  -- privacidad.
  chofer_id uuid not null references choferes(id) on delete cascade,

  -- El id que el TELÉFONO le puso al pedido (UUIDv7). No hay ninguna tabla que
  -- lo asocie a una persona, y a propósito.
  pedido_id_local uuid not null,

  -- El día de trabajo. No es un dato del receptor: es el mismo `fecha` que ya
  -- tienen actividad y jornadas. Está para que el cierre de la jornada pueda
  -- borrar exactamente las correlaciones de ese día.
  fecha date not null,

  -- wamid del aviso saliente que devolvió Meta. Sirve de segunda vía para
  -- resolver una respuesta cuando el payload del botón no viene (Meta manda el
  -- wamid del mensaje contestado en `context.id`).
  external_message_id text,

  -- Del MENSAJE, no de la entrega. 'fallido' quiere decir que WhatsApp no lo
  -- pudo dejar; nunca que el receptor haya rechazado el pedido.
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'entregado', 'leido', 'respondido', 'fallido')),

  -- --- La respuesta, cuando llega ---
  -- Qué botón tocó. Tres valores fijos, ningún texto del receptor: si escribe un
  -- mensaje libre, no se guarda (ver el webhook).
  respuesta_accion text
    check (respuesta_accion is null or respuesta_accion in ('CONFIRMAR', 'RECHAZAR', 'HORARIO')),
  -- El bloque horario que eligió, como id ('08-10'). Es configuración de la
  -- empresa, no un dato personal.
  respuesta_bloque_id text,
  -- wamid de la RESPUESTA. Único: es lo que hace idempotente al webhook.
  respuesta_mensaje_id text,
  respuesta_recibida_en timestamptz,

  -- Cuándo el teléfono confirmó haberla escrito en IndexedDB. Mientras sea null,
  -- la respuesta sigue bajando en cada consulta.
  aplicada_en timestamptz,

  -- Tope duro de retención. Lo pone el servidor al insertar, y el default está
  -- para que una fila creada a mano desde el SQL Editor tampoco pueda quedar
  -- viva para siempre: el barrido de abajo respeta esta columna pase lo que pase.
  expira_en timestamptz not null default (now() + interval '72 hours'),
  created_at timestamptz not null default now()
);

comment on table encomienda_whatsapp_correlaciones is
  'Correlación TEMPORAL entre un conductor, un pedido local y un mensaje de WhatsApp. Sin nombre, teléfono, hash de teléfono, dirección, conversación ni orden de ruta. Se borra al cerrar la jornada y como máximo 72 h después de crearse.';

-- No hay updated_at ni su trigger: la fila se escribe, se responde una vez y se
-- borra. No es un registro que se mantenga.

-- Idempotencia del webhook EN LA BASE y no con un `if` en el código: Meta
-- reintenta el mismo evento cuando no recibe el 200 a tiempo, y dos reintentos
-- que llegan en paralelo pasarían los dos por una comprobación previa. Acá el
-- segundo choca contra el índice y el webhook lo trata como duplicado.
create unique index if not exists uq_encomienda_whatsapp_respuesta
  on encomienda_whatsapp_correlaciones (respuesta_mensaje_id)
  where respuesta_mensaje_id is not null;

-- La segunda vía de resolución (por el wamid del mensaje contestado).
create unique index if not exists uq_encomienda_whatsapp_mensaje
  on encomienda_whatsapp_correlaciones (external_message_id)
  where external_message_id is not null;

-- Un pedido no puede tener dos avisos en vuelo el mismo día: mandarlo dos veces
-- le llega al receptor dos veces. El teléfono ya lo evita (ver pedidosSinAviso),
-- esto lo garantiza.
create unique index if not exists uq_encomienda_whatsapp_pedido_dia
  on encomienda_whatsapp_correlaciones (chofer_id, pedido_id_local, fecha);

-- La consulta que hace el teléfono cada vez: "mis respuestas sin aplicar".
create index if not exists idx_encomienda_whatsapp_por_aplicar
  on encomienda_whatsapp_correlaciones (chofer_id, aplicada_en)
  where respuesta_mensaje_id is not null;

-- El barrido de expiradas.
create index if not exists idx_encomienda_whatsapp_expira
  on encomienda_whatsapp_correlaciones (expira_en);

drop trigger if exists trg_encomienda_whatsapp_empresa on encomienda_whatsapp_correlaciones;
create trigger trg_encomienda_whatsapp_empresa
  before insert on encomienda_whatsapp_correlaciones
  for each row execute function set_empresa_id();

-- ----------------------------------------------------------------------------
-- 3. RLS
--    conductor: solo lo suyo · admin/operador: NADA · webhook: service_role
-- ----------------------------------------------------------------------------
alter table encomienda_whatsapp_correlaciones enable row level security;

-- Que el panel del jefe no tenga policy no es un olvido. El jefe no tiene
-- ninguna pantalla que necesite esta tabla —lo que él ve son los conteos de
-- actividad— y el principio V manda limitar el acceso a lo estrictamente
-- necesario. Si algún día hace falta depurar, se mira con service_role desde el
-- SQL Editor, que deja rastro.
drop policy if exists encomienda_whatsapp_chofer_read on encomienda_whatsapp_correlaciones;
create policy encomienda_whatsapp_chofer_read on encomienda_whatsapp_correlaciones
  for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- El aviso lo pide el teléfono a través de /api/whatsapp/send, que corre en el
-- servidor CON la sesión del conductor: inserta como él, no con service_role.
-- Es menos privilegio para la misma función.
drop policy if exists encomienda_whatsapp_chofer_insert on encomienda_whatsapp_correlaciones;
create policy encomienda_whatsapp_chofer_insert on encomienda_whatsapp_correlaciones
  for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- Lo único que el conductor actualiza es "ya la apliqué". No puede inventarse
-- una respuesta: `respuesta_accion` y compañía las escribe el webhook con
-- service_role, y el WITH CHECK de abajo exige que la respuesta ya exista.
drop policy if exists encomienda_whatsapp_chofer_confirmar on encomienda_whatsapp_correlaciones;
create policy encomienda_whatsapp_chofer_confirmar on encomienda_whatsapp_correlaciones
  for update to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  )
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and respuesta_mensaje_id is not null
    and aplicada_en is not null
  );

-- Borrar lo suyo: es la otra mitad de la retención. En cuanto el teléfono aplicó
-- la respuesta, la fila no hace falta y el propio conductor la puede eliminar
-- sin esperar al barrido nocturno.
drop policy if exists encomienda_whatsapp_chofer_delete on encomienda_whatsapp_correlaciones;
create policy encomienda_whatsapp_chofer_delete on encomienda_whatsapp_correlaciones
  for delete to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- 4. Retención: borrar en cuanto no haga falta
-- ----------------------------------------------------------------------------

-- (a) Al cerrar la jornada. Es el momento definido en el documento principal:
--     la jornada terminó, así que ninguna respuesta de ese día le sirve ya a
--     nadie. Se borra en la misma transacción que el cierre, no en un barrido
--     posterior: si el barrido fallara, las filas se quedarían.
create or replace function private.encomienda_borrar_correlaciones_jornada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Se ramifica en vez de escribir "tg_op = 'INSERT' or old.cerrada_en is null":
  -- en un INSERT el registro OLD no está asignado, y SQL no garantiza que un OR
  -- corte antes de evaluar el otro lado.
  v_recien_cerrada boolean;
begin
  if new.cerrada_en is null or new.chofer_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_recien_cerrada := true;
  else
    -- Solo la TRANSICIÓN a cerrada. Un update que no la mueve —o que reabre la
    -- jornada— no borra nada.
    v_recien_cerrada := old.cerrada_en is null;
  end if;

  if v_recien_cerrada then
    delete from encomienda_whatsapp_correlaciones
     where chofer_id = new.chofer_id
       and fecha = new.fecha;
  end if;

  return new;
end;
$$;

revoke all on function private.encomienda_borrar_correlaciones_jornada() from public;

drop trigger if exists trg_encomienda_jornada_borrar_correlaciones on encomienda_jornadas;
create trigger trg_encomienda_jornada_borrar_correlaciones
  after insert or update of cerrada_en on encomienda_jornadas
  for each row execute function private.encomienda_borrar_correlaciones_jornada();

-- (b) El tope duro. Para las jornadas que nunca se cierran (el conductor perdió
--     el teléfono, la app se desinstaló) y para las filas cuya respuesta ya se
--     aplicó. Devuelve cuántas borró, para poder verificarlo a mano.
create or replace function private.encomienda_limpiar_correlaciones()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  delete from encomienda_whatsapp_correlaciones
   where expira_en <= now()
      or aplicada_en is not null;
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function private.encomienda_limpiar_correlaciones() from public;

-- Cada hora, y no una vez al día: 72 horas es el TOPE, no el objetivo. Una fila
-- ya aplicada no tiene por qué esperar hasta la noche para desaparecer.
do $$
begin
  perform cron.unschedule('encomienda-limpiar-correlaciones');
exception
  when others then null;  -- no estaba programado
end $$;

select cron.schedule(
  'encomienda-limpiar-correlaciones',
  '7 * * * *',
  $cron$ select private.encomienda_limpiar_correlaciones(); $cron$
);

-- Una pasada ahora.
select private.encomienda_limpiar_correlaciones() as correlaciones_borradas_ahora;

-- ----------------------------------------------------------------------------
-- 5. Verificación: las ocho tienen que dar true.
-- ----------------------------------------------------------------------------
select
  -- La columna nueva está.
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'encomienda_actividad'
       and column_name = 'motivo'
  ) as "motivo_ok",

  -- Y su restricción, que es lo que impide que una entrega llegue con motivo.
  exists (
    select 1 from pg_constraint
     where conname = 'encomienda_actividad_motivo_check'
  ) as "motivo_restringido_ok",

  to_regclass('public.encomienda_whatsapp_correlaciones') is not null as "correlaciones_ok",

  -- La tabla NO puede tener columnas de datos personales. Esta comprobación es
  -- el guardia del principio V: si alguien agrega 'telefono' o 'direccion' de
  -- acá a un año, la migración se lo dice en la cara.
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'encomienda_whatsapp_correlaciones'
       and column_name in (
         'telefono', 'phone', 'phone_hash', 'telefono_hash',
         'nombre', 'name', 'direccion', 'address',
         'mensaje', 'cuerpo', 'body', 'texto', 'conversacion'
       )
  ) as "sin_datos_personales_ok",

  -- RLS encendida: sin esto, la anon key la leería completa.
  (
    select relrowsecurity from pg_class
     where oid = 'public.encomienda_whatsapp_correlaciones'::regclass
  ) as "rls_ok",

  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'empresa'
       and column_name = 'bloques_horarios_activos'
  ) as "bloques_horarios_ok",

  exists (select 1 from cron.job where jobname = 'encomienda-limpiar-correlaciones')
    as "limpieza_automatica_ok",

  -- Ninguna correlación pasada de las 72 horas sobrevivió.
  not exists (
    select 1 from encomienda_whatsapp_correlaciones
     where created_at < now() - interval '72 hours'
  ) as "retencion_respetada_ok";
