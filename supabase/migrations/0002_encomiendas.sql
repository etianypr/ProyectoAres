-- HISTÓRICA: los nombres "chofer"/"choferes" de este archivo se renombraron a
-- "conductor"/"conductores" en 0006_conductor.sql (spec 002 US2). No se edita.
-- ============================================================================
-- 0002 — Encomiendas: actividad en terreno, jornadas, regla de pago,
--        liquidación por día, periodos de facturación e ingresos reales.
--        Ejecutar DESPUÉS de la 0001, en Supabase > SQL Editor. Re-ejecutable.
--
-- ⚠️ REQUIERE pg_cron y btree_gist. Las dos se activan solas más abajo, pero si
--    alguna falla: panel de Supabase > Database > Extensions, activarla a mano y
--    volver a correr el archivo.
--
-- ----------------------------------------------------------------------------
-- CÓMO FUNCIONA, EN CUATRO FRASES
--
-- 1. El teléfono del conductor inserta un evento por acción en terreno
--    (encomienda_actividad). Sin datos del destinatario: nombre, teléfono y
--    dirección viven SOLO en el teléfono (IndexedDB). Acá llega el hecho de que
--    la entrega ocurrió, que es lo único que la empresa necesita para cobrar y
--    para pagar.
-- 2. La ruta del día es una unidad: encomienda_jornadas dice cuándo empezó y
--    cuándo terminó. Mientras `cerrada_en` sea null el día NO se valora.
-- 3. Al cerrarse, la base cuenta el día y escribe sus cifras en
--    encomienda_pagos JUNTO CON LA TARIFA que usó. Esas cifras son definitivas:
--    cambiar la regla después no las mueve.
-- 4. Lo que el mandante liquidó de verdad se anota por periodo de facturación y
--    se contrasta contra el estimado. De esa comparación sale si `valor_pedido`
--    está bien calibrado.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ LA FÓRMULA VIVE EN LA BASE Y NO EN LA APP
--
-- Porque el teléfono del conductor escribe DIRECTO contra Postgres: no pasa por
-- el servidor de Next, así que en ese momento no hay ningún TypeScript que pueda
-- correr. La cuenta está en private.encomienda_congelar_dia().
--
-- src/lib/encomiendas/pago.ts tiene la MISMA aritmética en TS, y solo para la
-- vista previa de "Agregar día" (mostrar cuánto va a quedar el día antes de
-- guardarlo). Son dos copias de la misma cuenta y hay que tocarlas juntas.
--
-- ----------------------------------------------------------------------------
-- DE DÓNDE SALE ESTE ARCHIVO
--
-- Consolida las migraciones 0017, 0024, 0026, 0028, 0029, 0031, 0032, 0033,
-- 0034 y 0035 del sistema del que se separó este proyecto, en su estado FINAL.
-- Los cuerpos de las funciones son textuales: acá se paga sueldos, así que no se
-- reescribió nada al mudarlo.
--
-- Lo que no vino, porque ya se había retirado allá (migración 0027):
-- encomienda_pedidos, encomienda_rutas y encomienda_paradas. Eran los datos
-- personales de los destinatarios y el orden de visita; se sacaron de la base a
-- propósito (Ley 21.719) y hoy viven en el teléfono.
--
-- Lo que no vino porque no aplica: las policies del rol 'contador' (no existe
-- ese rol acá) y todo lo que dependía de chofer_categorias.
-- ============================================================================

create extension if not exists btree_gist;

-- ----------------------------------------------------------------------------
-- 1. Actividad en terreno
-- ----------------------------------------------------------------------------
create table if not exists encomienda_actividad (
  -- El id lo genera EL TELÉFONO (UUIDv7), no la base. Es la clave de
  -- idempotencia: el conductor marca entregas sin señal, la app las guarda y las
  -- reenvía cuando vuelve el internet, y ese reenvío puede repetirse (se cortó a
  -- mitad, recargó la página, el service worker reintentó). Con el id ya decidido
  -- en el origen, el reenvío choca contra la primary key y la app lo inserta con
  -- "on conflict (id) do nothing": el mismo evento nunca se cuenta dos veces.
  id uuid primary key,
  empresa_id uuid not null references empresa(id) on delete cascade,
  -- set null (no restrict): permite eliminar del todo a un conductor sin perder
  -- el historial de actividad, que es la base de liquidaciones ya pagadas.
  chofer_id uuid references choferes(id) on delete set null,
  -- Día de trabajo al que se imputa el evento, en fecha local de Chile — la manda
  -- el teléfono (hoyChile()), no se deduce de la hora del servidor: una entrega
  -- de las 21:30 en Arica ya es del día siguiente en UTC, y ese corrimiento
  -- movería el pago de un día al otro.
  fecha date not null,
  -- 'entrega'  → cuenta como entregada (base del ingreso y del pago por pedido)
  -- 'omision'  → salió a la dirección y no se pudo entregar
  -- 'llamada'  → llamó al destinatario. No suma ni resta al conteo: existe solo
  --              para que un día en que el conductor salió, llamó a todos y no
  --              logró entregar nada igual cuente como DÍA TRABAJADO y se pague
  --              el fijo diario.
  tipo text not null check (tipo in ('entrega', 'omision', 'llamada')),
  -- Cuándo ocurrió DE VERDAD, según el teléfono. Sin default: la manda la app,
  -- porque el evento pudo haber pasado horas antes de poder enviarlo.
  hora timestamptz not null,
  -- Cuándo llegó al servidor. La diferencia con "hora" es el retraso por falta
  -- de señal.
  created_at timestamptz not null default now(),
  -- 'app'    → lo envió el teléfono del conductor (default).
  -- 'manual' → lo cargó la oficina. La "hora" de estas filas es de relleno
  --            (mediodía UTC del día cargado): nadie sabe a qué hora fue cada
  --            entrega, y ninguna pantalla debe mostrarla como si lo supiera.
  origen text not null default 'app' check (origen in ('app', 'manual'))
);

-- No hay updated_at ni su trigger a propósito: estas filas son INMUTABLES. Un
-- evento pasó o no pasó; no se edita. Corregir un toque equivocado se hace
-- borrando el evento (ver la policy de delete), no reescribiéndolo.

comment on table encomienda_actividad is
  'Acciones del conductor en terreno, sin datos personales de destinatarios. Los pedidos, direcciones y el orden de la ruta viven en el teléfono del conductor.';
comment on column encomienda_actividad.origen is
  'app = enviado por el teléfono del conductor · manual = cargado por la oficina (la hora es de relleno).';

-- Conteo por conductor y día (liquidación, y la pantalla del propio conductor).
-- Además cubre el índice que pide la FK chofer_id para que el "on delete set
-- null" no tenga que escanear la tabla entera.
create index if not exists idx_encomienda_actividad_chofer_fecha
  on encomienda_actividad (chofer_id, fecha);

-- Panel del periodo: todos los conductores en un rango de fechas. empresa_id
-- primero porque toda consulta pasa por RLS de empresa.
create index if not exists idx_encomienda_actividad_empresa_fecha
  on encomienda_actividad (empresa_id, fecha);

drop trigger if exists trg_encomienda_actividad_empresa on encomienda_actividad;
create trigger trg_encomienda_actividad_empresa before insert on encomienda_actividad
  for each row execute function set_empresa_id();

-- ----------------------------------------------------------------------------
-- 2. Jornadas: el sobre del día
-- ----------------------------------------------------------------------------
create table if not exists encomienda_jornadas (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  chofer_id uuid references choferes(id) on delete set null,
  fecha date not null,
  -- Cuándo se generó la ruta. Lo manda el teléfono, que ya lo tenía guardado.
  inicio timestamptz,
  -- Cuándo terminó. null = en curso. Es LA columna: mientras sea null el día no
  -- se valora, y en cuanto deja de serlo se congela (sección 6).
  cerrada_en timestamptz,
  created_at timestamptz not null default now(),
  -- nulls not distinct para que un conductor eliminado no pueda tener dos
  -- jornadas del mismo día. Mismo criterio que encomienda_pagos.
  unique nulls not distinct (chofer_id, fecha)
);

create index if not exists idx_encomienda_jornadas_fecha
  on encomienda_jornadas (fecha desc);
-- Para el barrido de cierre, que busca exactamente esto.
create index if not exists idx_encomienda_jornadas_abiertas
  on encomienda_jornadas (fecha) where cerrada_en is null;

drop trigger if exists trg_encomienda_jornadas_empresa on encomienda_jornadas;
create trigger trg_encomienda_jornadas_empresa before insert on encomienda_jornadas
  for each row execute function set_empresa_id();

comment on table encomienda_jornadas is
  'Una ruta de reparto: cuándo empezó y cuándo terminó. Mientras cerrada_en sea null el día NO se valora. Al cerrarse se congelan sus cifras en encomienda_pagos.';

-- ----------------------------------------------------------------------------
-- 3. La regla de pago
-- ----------------------------------------------------------------------------
-- UNA fila, se edita encima. Sin historial ni vigencias: lo que se conserva no
-- es la regla, es EL RESULTADO de cada día (sección 4).
create table if not exists encomienda_reglas_pago (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  tipo_pago text not null check (tipo_pago in ('porcentaje', 'monto_fijo')),
  -- % (0-100) si tipo_pago = porcentaje, o CLP por pedido si monto_fijo.
  valor_pago numeric(10,2) not null check (valor_pago >= 0),
  -- CLP que se estima que entra por cada entrega. Base del ingreso estimado y,
  -- con tipo_pago = porcentaje, también del pago al conductor: por eso los dos
  -- viven en la misma regla.
  valor_pedido integer not null default 950 check (valor_pedido >= 0),
  -- Fijo en CLP por día trabajado, aparte de lo que pague por pedido.
  monto_dia integer not null default 0 check (monto_dia >= 0),
  meta_entregas_dia int check (meta_entregas_dia is null or meta_entregas_dia > 0),
  bono_monto integer check (bono_monto is null or bono_monto >= 0),
  -- created_at = cuándo se configuró por primera vez.
  created_at timestamptz not null default now(),
  -- updated_at = desde cuándo rige lo que dice ahora.
  updated_at timestamptz not null default now(),
  -- Lo que hace imposible volver a acumular reglas, aunque la app tenga un bug o
  -- alguien cargue por SQL.
  constraint encomienda_reglas_pago_una_por_empresa unique (empresa_id)
);

drop trigger if exists trg_encomienda_reglas_empresa on encomienda_reglas_pago;
create trigger trg_encomienda_reglas_empresa before insert on encomienda_reglas_pago
  for each row execute function set_empresa_id();
drop trigger if exists trg_encomienda_reglas_updated on encomienda_reglas_pago;
create trigger trg_encomienda_reglas_updated before update on encomienda_reglas_pago
  for each row execute function set_updated_at();

comment on table encomienda_reglas_pago is
  'La regla de pago del conductor. UNA fila: se edita encima, sin historial ni vigencias. Cambiarla no mueve los días ya registrados — esos tienen su propia tarifa congelada en encomienda_pagos.';

-- ----------------------------------------------------------------------------
-- 4. La liquidación de cada día
-- ----------------------------------------------------------------------------
-- Las columnas regla_* son la tarifa con la que se calculó ESTE día. Sin ellas,
-- un día seguiría dependiendo de la regla mientras estuviera vivo, y el caso que
-- lo destapa es el conductor repartiendo AHORA:
--
--   09:00  lleva 20 entregas, el día vale X
--   14:00  se cambia la regla
--   14:05  marca la entrega 21 → se recalcularía el día ENTERO con la regla nueva
--
-- Y si esa entrega 21 no llegaba, el día se quedaba con la regla vieja: el
-- efecto de cambiar la regla dependía de si el conductor marcaba una entrega más.
--
-- Guardando la tarifa en el día, un día existente se recalcula SIEMPRE con la
-- suya. La regla nueva rige para los días que todavía no existen, que es lo que
-- significa "los cambios se ven hacia adelante".
create table if not exists encomienda_pagos (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  chofer_id uuid references choferes(id) on delete set null,
  fecha date not null,
  pedidos_entregados int not null default 0 check (pedidos_entregados >= 0),
  pedidos_no_entregados int not null default 0 check (pedidos_no_entregados >= 0),
  ingresos_totales integer not null default 0 check (ingresos_totales >= 0),
  pago_base integer not null default 0 check (pago_base >= 0),
  pago_dia integer not null default 0 check (pago_dia >= 0),
  pago_bono integer not null default 0 check (pago_bono >= 0),
  pago_total integer generated always as (pago_base + pago_bono + pago_dia) stored,
  calculado_en timestamptz not null default now(),
  regla_valor_pedido integer,
  regla_tipo_pago text,
  regla_valor_pago numeric(10,2),
  regla_monto_dia integer,
  regla_meta_entregas_dia integer,
  regla_bono_monto integer,
  unique nulls not distinct (chofer_id, fecha)
);

create index if not exists idx_encomienda_pagos_fecha
  on encomienda_pagos (fecha desc);

drop trigger if exists trg_encomienda_pagos_empresa on encomienda_pagos;
create trigger trg_encomienda_pagos_empresa before insert on encomienda_pagos
  for each row execute function set_empresa_id();

comment on column encomienda_pagos.regla_valor_pedido is
  'La tarifa con la que se calculó ESTE día. Se copia de la regla la primera vez que el día se congela y no cambia después, aunque la regla sí. Para moverla hay que pedirlo explícitamente: encomienda_repreciar_dia (con la regla de ahora) o encomienda_valorar_dia (con una tarifa escrita a mano).';

-- ----------------------------------------------------------------------------
-- 5. Periodos de facturación e ingresos reales
-- ----------------------------------------------------------------------------
-- El corte con el que factura el mandante. Puede empezar y terminar cualquier
-- día, y por eso es distinto del periodo global de la app (un mes, en cookie).
create table if not exists encomienda_periodos_facturacion (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encomienda_periodos_fechas_ordenadas check (fecha_fin >= fecha_inicio)
);

create index if not exists idx_encomienda_periodos_empresa_inicio
  on encomienda_periodos_facturacion (empresa_id, fecha_inicio);

-- Dos periodos de la misma empresa no pueden solaparse: un día pertenece a un
-- corte o a ninguno. Restricción de exclusión y no código en la app: dos
-- pestañas guardando a la vez pasarían cualquier comprobación en TypeScript.
-- Va en un bloque condicional porque `add constraint` no tiene "if not exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'encomienda_periodos_sin_solape'
      and conrelid = 'public.encomienda_periodos_facturacion'::regclass
  ) then
    alter table encomienda_periodos_facturacion
      add constraint encomienda_periodos_sin_solape
      exclude using gist (
        empresa_id with =,
        daterange(fecha_inicio, fecha_fin, '[]') with &&
      );
  end if;
end $$;

drop trigger if exists trg_encomienda_periodos_empresa on encomienda_periodos_facturacion;
create trigger trg_encomienda_periodos_empresa before insert on encomienda_periodos_facturacion
  for each row execute function set_empresa_id();
drop trigger if exists trg_encomienda_periodos_updated on encomienda_periodos_facturacion;
create trigger trg_encomienda_periodos_updated before update on encomienda_periodos_facturacion
  for each row execute function set_updated_at();

-- Lo que el mandante liquidó DE VERDAD. Se contrasta contra el ingreso estimado
-- del mismo rango para saber si valor_pedido está bien calibrado.
--
-- Va por periodo y no por mes porque la liquidación llega por corte, y un corte
-- puede cruzar dos meses: imputarla a uno obligaba a repartirla a ojo.
--
-- Las columnas anio/mes son el historial heredado: así se cargaban las filas
-- antes de que existieran los periodos. El check de abajo obliga a que cada fila
-- sea una cosa o la otra, nunca las dos ni ninguna.
create table if not exists encomienda_ingresos_reales (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  -- on delete restrict: borrar un periodo que tiene cargada una liquidación
  -- perdería un dato que la app no puede reconstruir (vino de un papel).
  periodo_id uuid references encomienda_periodos_facturacion(id) on delete restrict,
  anio int check (anio is null or anio between 2000 and 2100),
  mes int check (mes is null or mes between 1 and 12),
  -- CLP sin decimales, como el resto del sistema.
  monto integer not null check (monto >= 0),
  -- De dónde salió el número: nº de liquidación, si es parcial, etc. Sin esto,
  -- dentro de seis meses nadie se acuerda por qué ese periodo no cuadra.
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sin empresa_id en las restricciones únicas, igual que encomienda_pagos: el
  -- cliente no lo conoce —lo pone un trigger— y necesita nombrar las columnas del
  -- conflicto para poder corregir una liquidación ya cargada.
  constraint encomienda_ingresos_reales_periodo_unico unique (periodo_id),
  constraint encomienda_ingresos_reales_mes_unico unique (anio, mes),
  constraint encomienda_ingresos_reales_imputacion check (
    (periodo_id is not null and anio is null and mes is null)
    or (periodo_id is null and anio is not null and mes is not null)
  )
);

-- Solo sirve para las filas heredadas (las que van por mes). Las que van por
-- periodo ya se buscan por su restricción única de periodo_id.
create index if not exists idx_encomienda_ingresos_reales_mes
  on encomienda_ingresos_reales (anio desc, mes desc);

drop trigger if exists trg_encomienda_ingresos_reales_empresa on encomienda_ingresos_reales;
create trigger trg_encomienda_ingresos_reales_empresa before insert on encomienda_ingresos_reales
  for each row execute function set_empresa_id();
drop trigger if exists trg_encomienda_ingresos_reales_updated on encomienda_ingresos_reales;
create trigger trg_encomienda_ingresos_reales_updated before update on encomienda_ingresos_reales
  for each row execute function set_updated_at();

comment on table encomienda_ingresos_reales is
  'Lo que el mandante liquidó de verdad. Las filas nuevas van por periodo de facturación; las heredadas quedaron por (anio, mes) y se conservan como historial de solo lectura.';

-- ----------------------------------------------------------------------------
-- 6. RLS
--    admin/operador: todo · conductor: lo suyo, y solo del día en curso
-- ----------------------------------------------------------------------------
alter table encomienda_actividad              enable row level security;
alter table encomienda_jornadas               enable row level security;
alter table encomienda_reglas_pago            enable row level security;
alter table encomienda_pagos                  enable row level security;
alter table encomienda_periodos_facturacion   enable row level security;
alter table encomienda_ingresos_reales        enable row level security;

-- --- actividad ---
drop policy if exists encomienda_actividad_admin_op_all on encomienda_actividad;
create policy encomienda_actividad_admin_op_all on encomienda_actividad for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists encomienda_actividad_chofer_read on encomienda_actividad;
create policy encomienda_actividad_chofer_read on encomienda_actividad for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- Solo puede registrar actividad A SU PROPIO nombre, y solo como 'app'. Sin la
-- primera condición, un conductor con el token de su sesión podría sumarle (o
-- restarle) entregas a otro; sin la segunda podría hacer pasar sus eventos por
-- carga de oficina y así saltarse el límite de borrado de abajo.
drop policy if exists encomienda_actividad_chofer_insert on encomienda_actividad;
create policy encomienda_actividad_chofer_insert on encomienda_actividad for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and origen = 'app'
  );

-- NO hay policy de update para el conductor: los eventos no se editan.
--
-- Sí puede BORRAR los suyos de las últimas 12 horas, y solo esos: es la vuelta
-- atrás de un toque equivocado ("marqué entregado en la parada de al lado"). La
-- ventana lo deja arreglar un error de la jornada en curso sin poder tocar días
-- ya liquidados. Se usa "hora > now() - interval" y no la fecha para no depender
-- de la zona horaria del servidor (Postgres en UTC, la empresa en Arica).
drop policy if exists encomienda_actividad_chofer_delete on encomienda_actividad;
create policy encomienda_actividad_chofer_delete on encomienda_actividad for delete to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and hora > now() - interval '12 hours'
    and origen = 'app'
  );

-- --- jornadas ---
drop policy if exists encomienda_jornadas_admin_op_all on encomienda_jornadas;
create policy encomienda_jornadas_admin_op_all on encomienda_jornadas for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists encomienda_jornadas_chofer_read on encomienda_jornadas;
create policy encomienda_jornadas_chofer_read on encomienda_jornadas for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- El conductor abre y cierra SU jornada del día: es quien genera la ruta y quien
-- llega a la última parada. El límite de fecha es lo que evita que un token
-- robado reabra y recierre jornadas viejas — y con eso fuerce que se revaloricen.
drop policy if exists encomienda_jornadas_chofer_insert on encomienda_jornadas;
create policy encomienda_jornadas_chofer_insert on encomienda_jornadas for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and fecha >= (now() at time zone 'America/Santiago')::date - 1
  );

drop policy if exists encomienda_jornadas_chofer_update on encomienda_jornadas;
create policy encomienda_jornadas_chofer_update on encomienda_jornadas for update to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and fecha >= (now() at time zone 'America/Santiago')::date - 1
  );

-- --- regla de pago ---
drop policy if exists encomienda_reglas_admin_op_all on encomienda_reglas_pago;
create policy encomienda_reglas_admin_op_all on encomienda_reglas_pago for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

-- El conductor NO lee la regla: no necesita saber la fórmula para trabajar, y su
-- propia liquidación ya la ve calculada en encomienda_pagos.

-- --- liquidaciones ---
drop policy if exists encomienda_pagos_admin_op_all on encomienda_pagos;
create policy encomienda_pagos_admin_op_all on encomienda_pagos for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

-- Lee las suyas; escribirlas, jamás. Nadie puede escribir su propio sueldo: las
-- escribe la base (sección 7, SECURITY DEFINER).
drop policy if exists encomienda_pagos_chofer_read on encomienda_pagos;
create policy encomienda_pagos_chofer_read on encomienda_pagos for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- --- periodos e ingresos reales: solo oficina ---
drop policy if exists encomienda_periodos_admin_op_all on encomienda_periodos_facturacion;
create policy encomienda_periodos_admin_op_all on encomienda_periodos_facturacion for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists encomienda_ingresos_reales_admin_op_all on encomienda_ingresos_reales;
create policy encomienda_ingresos_reales_admin_op_all on encomienda_ingresos_reales for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

-- ----------------------------------------------------------------------------
-- 7. LA CUENTA
-- ----------------------------------------------------------------------------
-- En el schema `private`, que PostgREST no expone: esto escribe plata y no tiene
-- por qué ser invocable desde la API por cualquiera con sesión.
--
-- security definer porque el disparador más frecuente es el TELÉFONO DEL
-- CONDUCTOR insertando una entrega, y el rol 'chofer' no tiene permiso de
-- escritura sobre encomienda_pagos — ni debe tenerlo: no puede poder escribir su
-- propia liquidación. La función corre como dueña de las tablas y escribe por él.
--
-- Los drop son para que volver a correr el archivo no deje conviviendo versiones
-- de menos argumentos: con los nuevos teniendo default, haría ambigua toda
-- llamada corta.
drop function if exists private.encomienda_congelar_dia(uuid, date);
drop function if exists private.encomienda_congelar_dia(uuid, date, boolean);

create or replace function private.encomienda_congelar_dia(
  p_chofer_id uuid,
  p_fecha date,
  -- true = volver a valorar el día descartando la tarifa que tenía. Es la única
  -- forma de mover un día ya congelado, y se pide a mano desde la pantalla del
  -- día (encomienda_repreciar_dia).
  p_repreciar boolean default false,
  -- Tarifa EXPLÍCITA para este día. Cuando viene, manda sobre la del día y sobre
  -- la regla, y queda congelada en la fila como cualquier otra.
  --
  -- Es la tercera fuente posible de tarifa y existe porque cargar días PASADOS
  -- desde la oficina es un caso real: la regla es una sola y rige hacia
  -- adelante, así que sin esto un día de hace tres meses solo se podía valorar
  -- con la tarifa de hoy. La pide la app por encomienda_valorar_dia, que
  -- comprueba rol y validez antes de llegar acá.
  p_valor_pedido      integer default null,
  p_tipo_pago         text    default null,
  p_valor_pago        numeric default null,
  p_monto_dia         integer default null,
  p_meta_entregas_dia integer default null,
  p_bono_monto        integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entregados   int;
  v_omitidos     int;
  v_eventos      int;
  v_valor_pedido int;
  v_tipo_pago    text;
  v_valor_pago   numeric;
  v_monto_dia    int;
  v_meta         int;
  v_bono_monto   int;
  v_tiene_tarifa boolean := false;
  v_ingresos     int;
  v_base         int;
  v_dia          int;
  v_bono         int;
begin
  -- Día sin conductor: la FK es on delete set null, así que el día se sigue
  -- viendo cuando se elimina a alguien, pero no hay a quién pagarle.
  if p_chofer_id is null then
    return;
  end if;

  -- ANTES de contar, no después. Dos sincronizaciones del teléfono cayendo a la
  -- vez sobre el mismo día se pisaban: cada transacción contaba sin ver la fila
  -- que la otra estaba insertando, las dos escribían el mismo total y una
  -- entrega quedaba sin pagar. Con el candado, la segunda espera y cuenta
  -- cuando la primera ya está confirmada.
  --
  -- Es por (conductor, día) y dura hasta el fin de la transacción, así que no
  -- frena la actividad de otro conductor ni la de otro día. Los bucles que
  -- llaman acá recorren los días ORDENADOS, para que dos transacciones que
  -- tocan los mismos días los tomen siempre en el mismo orden y no se traben
  -- entre sí.
  perform pg_advisory_xact_lock(
    hashtextextended(p_chofer_id::text || '|' || p_fecha::text, 0)
  );

  select count(*) filter (where tipo = 'entrega'),
         count(*) filter (where tipo = 'omision'),
         count(*)
    into v_entregados, v_omitidos, v_eventos
    from encomienda_actividad
   where chofer_id = p_chofer_id and fecha = p_fecha;

  -- Sin un solo evento el día dejó de existir para el panel, que arma los días
  -- agrupando actividad. Una liquidación sobreviviente sería plata a pagar por
  -- un día que ya nadie puede ver ni auditar.
  if v_eventos = 0 then
    delete from encomienda_pagos where chofer_id = p_chofer_id and fecha = p_fecha;
    return;
  end if;

  -- Una tarifa dictada desde afuera gana sobre todo lo demás: es alguien
  -- diciendo explícitamente con cuánto se pagaba ESTE día. Se piden los dos
  -- campos que no tienen default en la regla —sin valor por entrega no hay
  -- ingreso, y sin tipo de pago no hay fórmula—; los otros cuatro pueden venir
  -- nulos y significan lo mismo que en la regla (sin fijo, sin bono).
  if p_valor_pedido is not null and p_tipo_pago is not null then
    v_valor_pedido := p_valor_pedido;
    v_tipo_pago    := p_tipo_pago;
    v_valor_pago   := coalesce(p_valor_pago, 0);
    v_monto_dia    := coalesce(p_monto_dia, 0);
    v_meta         := p_meta_entregas_dia;
    v_bono_monto   := p_bono_monto;
    v_tiene_tarifa := true;
  end if;

  -- La tarifa del día es la que YA TIENE. Esto es lo que hace que sumar una
  -- entrega a las 14:05 no arrastre el día entero a una regla que cambió a las
  -- 14:00.
  if not p_repreciar and not v_tiene_tarifa then
    select regla_valor_pedido, regla_tipo_pago, regla_valor_pago,
           regla_monto_dia, regla_meta_entregas_dia, regla_bono_monto
      into v_valor_pedido, v_tipo_pago, v_valor_pago, v_monto_dia, v_meta, v_bono_monto
      from encomienda_pagos
     where chofer_id = p_chofer_id
       and fecha = p_fecha
       and regla_valor_pedido is not null;
    v_tiene_tarifa := found;
  end if;

  -- Día nuevo (o repreciado a mano): toma la regla de ahora.
  if not v_tiene_tarifa then
    select valor_pedido, tipo_pago, valor_pago, monto_dia, meta_entregas_dia, bono_monto
      into v_valor_pedido, v_tipo_pago, v_valor_pago, v_monto_dia, v_meta, v_bono_monto
      from encomienda_reglas_pago
     limit 1;

    -- Sin regla configurada no hay con qué calcular. No se escribe un cero: un
    -- cero se lee como "este día no vale nada", que es una afirmación. Se deja
    -- el día sin fila y el panel lo muestra como "Sin regla".
    if not found then
      return;
    end if;
  end if;

  -- Ingreso ESTIMADO: el mandante maneja el valor de cada envío en su sistema y
  -- esta empresa nunca lo conoce. Lo real se anota por periodo aparte
  -- (encomienda_ingresos_reales) y se contrasta contra esto.
  v_ingresos := round(v_entregados::numeric * v_valor_pedido)::int;

  -- Con 'porcentaje' el pago sale del ingreso estimado, o sea que valor_pedido
  -- también es parte del sueldo. Por eso los dos viven en la misma regla.
  v_base := case
              when v_tipo_pago = 'porcentaje'
                then round(v_ingresos::numeric * v_valor_pago / 100)::int
              else round(v_entregados::numeric * v_valor_pago)::int
            end;

  -- El fijo del día se paga sin condición: llegar hasta acá ya significa que
  -- hubo al menos un evento, y eso ES la definición de día trabajado.
  v_dia := coalesce(v_monto_dia, 0);

  -- >= y no >: alcanzar la meta ya paga el bono (la pantalla dice lo mismo).
  v_bono := case
              when v_meta is not null and v_entregados >= v_meta
                then coalesce(v_bono_monto, 0)
              else 0
            end;

  -- pago_total no se escribe: es columna generada.
  insert into encomienda_pagos (
    chofer_id, fecha, pedidos_entregados, pedidos_no_entregados,
    ingresos_totales, pago_base, pago_dia, pago_bono, calculado_en,
    regla_valor_pedido, regla_tipo_pago, regla_valor_pago,
    regla_monto_dia, regla_meta_entregas_dia, regla_bono_monto
  ) values (
    p_chofer_id, p_fecha, v_entregados, v_omitidos,
    v_ingresos, v_base, v_dia, v_bono, now(),
    v_valor_pedido, v_tipo_pago, v_valor_pago, v_monto_dia, v_meta, v_bono_monto
  )
  on conflict (chofer_id, fecha) do update set
    pedidos_entregados      = excluded.pedidos_entregados,
    pedidos_no_entregados   = excluded.pedidos_no_entregados,
    ingresos_totales        = excluded.ingresos_totales,
    pago_base               = excluded.pago_base,
    pago_dia                = excluded.pago_dia,
    pago_bono               = excluded.pago_bono,
    calculado_en            = excluded.calculado_en,
    regla_valor_pedido      = excluded.regla_valor_pedido,
    regla_tipo_pago         = excluded.regla_tipo_pago,
    regla_valor_pago        = excluded.regla_valor_pago,
    regla_monto_dia         = excluded.regla_monto_dia,
    regla_meta_entregas_dia = excluded.regla_meta_entregas_dia,
    regla_bono_monto        = excluded.regla_bono_monto;
end;
$$;

revoke all on function private.encomienda_congelar_dia(
  uuid, date, boolean, integer, text, numeric, integer, integer, integer
) from public;

-- ----------------------------------------------------------------------------
-- 8. Las dos puertas para volver a valorar un día a mano
-- ----------------------------------------------------------------------------
-- La contracara de que un día conserve su tarifa: si la regla estaba MAL cuando
-- ese día se registró —un 70 % donde iba 7 %—, corregir la regla no lo arregla.
-- Estas dos son la salida, y son a propósito un acto explícito y de a un día:
-- volver a valorar algo que ya se contó como pagado no puede ser un efecto
-- secundario.
--
-- Van en `public` porque las llama la app con la sesión del usuario, así que
-- comprueban el rol por dentro. Son las únicas de estas funciones expuestas.

-- 8a. Con la regla de AHORA.
create or replace function encomienda_repreciar_dia(p_chofer_id uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- coalesce: sin sesión get_rol() es null y `null not in (...)` no lanza (0005).
  if coalesce((select private.get_rol())::text, '') not in ('admin', 'operador') then
    raise exception 'No tienes permiso para recalcular pagos.';
  end if;
  perform private.encomienda_congelar_dia(p_chofer_id, p_fecha, true);
end;
$$;

revoke all on function encomienda_repreciar_dia(uuid, date) from public, anon;
grant execute on function encomienda_repreciar_dia(uuid, date) to authenticated;

-- 8b. Con una tarifa escrita a mano, sin tocar la regla. Para los días pasados
--     que se pagaban distinto: no hay ninguna tabla de la que sacar su tarifa.
--
-- Repreciar siempre (p_repreciar => true): pedir esto ES decir "olvidate de la
-- tarifa que tenía este día".
--
-- Las validaciones repiten las de la app a propósito. Esto es un endpoint de
-- PostgREST —cualquiera con sesión puede llamarlo— y escribe sueldos: un
-- porcentaje de 700 o un valor por entrega negativo no pueden depender de que el
-- formulario los haya frenado antes.
create or replace function encomienda_valorar_dia(
  p_chofer_id uuid,
  p_fecha date,
  p_valor_pedido integer,
  p_tipo_pago text,
  p_valor_pago numeric,
  p_monto_dia integer default 0,
  p_meta_entregas_dia integer default null,
  p_bono_monto integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select private.get_rol())::text, '') not in ('admin', 'operador') then
    raise exception 'No tienes permiso para valorar días.';
  end if;

  if p_chofer_id is null then
    raise exception 'Falta el conductor.';
  end if;

  if p_valor_pedido is null or p_valor_pedido <= 0 then
    raise exception 'Pon cuánto se estima que entra por cada entrega.';
  end if;

  if p_tipo_pago not in ('porcentaje', 'monto_fijo') then
    raise exception 'Tipo de pago inválido.';
  end if;

  if p_valor_pago is null or p_valor_pago < 0 then
    raise exception 'El valor de pago no puede ser negativo.';
  end if;

  if p_tipo_pago = 'porcentaje' and p_valor_pago > 100 then
    raise exception 'El porcentaje no puede superar 100.';
  end if;

  if coalesce(p_monto_dia, 0) < 0 then
    raise exception 'El monto por día no puede ser negativo.';
  end if;

  -- Meta y bono son un solo dato en dos columnas: una meta sin monto no paga
  -- nada y un monto sin meta no se paga nunca. Cualquiera de las dos sola es
  -- casi siempre un formulario a medio llenar.
  if (p_meta_entregas_dia is null) <> (p_bono_monto is null) then
    raise exception 'Para el bono, completa tanto la meta de entregas como el monto.';
  end if;

  perform private.encomienda_congelar_dia(
    p_chofer_id,
    p_fecha,
    true,
    p_valor_pedido,
    p_tipo_pago,
    p_valor_pago,
    coalesce(p_monto_dia, 0),
    p_meta_entregas_dia,
    p_bono_monto
  );
end;
$$;

revoke all on function encomienda_valorar_dia(
  uuid, date, integer, text, numeric, integer, integer, integer
) from public, anon;
grant execute on function encomienda_valorar_dia(
  uuid, date, integer, text, numeric, integer, integer, integer
) to authenticated;

comment on function encomienda_valorar_dia(
  uuid, date, integer, text, numeric, integer, integer, integer
) is
  'Vuelve a valorar un (conductor, día) con una tarifa dictada a mano, no con la regla. Para cargar días pasados que se pagaban distinto.';

-- ----------------------------------------------------------------------------
-- 9. Cuándo se dispara la cuenta
-- ----------------------------------------------------------------------------
-- Un evento solo recalcula el día si la jornada YA está cerrada. Es el caso de la
-- cola del teléfono vaciándose después del cierre: esas entregas tienen que
-- entrar al conteo igual, y el día se reescribe con su misma tarifa.
--
-- Un día sin jornada, o con la jornada abierta, no se toca: se valora cuando se
-- cierre (por el conductor, por la oficina o por el barrido nocturno).
--
-- La condición vive acá y no en encomienda_congelar_dia() a propósito: esa
-- función es la cuenta, y tiene que poder correrse a pedido —"Recalcular con la
-- regla actual"— sin preguntarle a nadie si el día está cerrado.
create or replace function private.encomienda_congelar_si_cerrada(
  p_chofer_id uuid,
  p_fecha date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from encomienda_jornadas
     where chofer_id = p_chofer_id
       and fecha = p_fecha
       and cerrada_en is not null
  ) then
    perform private.encomienda_congelar_dia(p_chofer_id, p_fecha);
  end if;
end;
$$;

revoke all on function private.encomienda_congelar_si_cerrada(uuid, date) from public;

-- Triggers POR SENTENCIA, no por fila: cargar un día a mano desde la oficina
-- inserta hasta 300 filas de una. Por fila serían 300 recálculos del mismo día;
-- por sentencia es uno solo, sobre la lista de días distintos que tocó la
-- operación.
--
-- Va una función por trigger, aunque las tres se parezcan. Se podría escribir una
-- sola compartida —bastaría con llamar igual a la tabla de transición en todos—,
-- pero una tabla de transición es una relación efímera que se registra por
-- consulta, y una función plpgsql cachea los planes de sus sentencias entre
-- llamadas. Compartir la función mete esas dos cosas en la misma frase. No vale
-- la pena averiguar si funciona: acá se paga sueldos.
create or replace function private.encomienda_congelar_insertados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in select distinct chofer_id, fecha from nuevos order by chofer_id, fecha loop
    perform private.encomienda_congelar_si_cerrada(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

create or replace function private.encomienda_congelar_borrados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in select distinct chofer_id, fecha from viejos order by chofer_id, fecha loop
    perform private.encomienda_congelar_si_cerrada(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

-- Un update puede mover un evento de un día a otro o de un conductor a otro, y
-- entonces hay DOS días que recalcular: el que perdió el evento y el que lo ganó.
-- Por eso este lleva las dos tablas de transición.
--
-- Hoy nada actualiza esta tabla —se inserta y se borra, nada más—, pero un update
-- que pasara sin recalcular dejaría cifras que no corresponden a la actividad, y
-- eso no se nota mirando la pantalla.
create or replace function private.encomienda_congelar_actualizados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in
    select distinct chofer_id, fecha from (
      select chofer_id, fecha from viejos
      union
      select chofer_id, fecha from nuevos
    ) t
    order by chofer_id, fecha
  loop
    perform private.encomienda_congelar_si_cerrada(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

revoke all on function private.encomienda_congelar_insertados() from public;
revoke all on function private.encomienda_congelar_borrados() from public;
revoke all on function private.encomienda_congelar_actualizados() from public;

drop trigger if exists trg_encomienda_actividad_congelar_ins on encomienda_actividad;
create trigger trg_encomienda_actividad_congelar_ins
  after insert on encomienda_actividad
  referencing new table as nuevos
  for each statement execute function private.encomienda_congelar_insertados();

drop trigger if exists trg_encomienda_actividad_congelar_del on encomienda_actividad;
create trigger trg_encomienda_actividad_congelar_del
  after delete on encomienda_actividad
  referencing old table as viejos
  for each statement execute function private.encomienda_congelar_borrados();

drop trigger if exists trg_encomienda_actividad_congelar_upd on encomienda_actividad;
create trigger trg_encomienda_actividad_congelar_upd
  after update on encomienda_actividad
  referencing old table as viejos new table as nuevos
  for each statement execute function private.encomienda_congelar_actualizados();

-- Y el disparo principal: cerrar la jornada.
create or replace function private.encomienda_jornada_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo al cerrarse. Abrir una jornada no calcula nada, y reabrirla tampoco
  -- descongela: las cifras que ya están se quedan hasta que se cierre otra vez.
  if new.cerrada_en is not null then
    perform private.encomienda_congelar_dia(new.chofer_id, new.fecha);
  end if;
  return null;
end;
$$;

revoke all on function private.encomienda_jornada_cambio() from public;

drop trigger if exists trg_encomienda_jornada_congelar on encomienda_jornadas;
create trigger trg_encomienda_jornada_congelar
  after insert or update of cerrada_en on encomienda_jornadas
  for each row execute function private.encomienda_jornada_cambio();

-- ----------------------------------------------------------------------------
-- 10. Los días cerrados que todavía no tienen cifras
-- ----------------------------------------------------------------------------
-- Pasa en una instalación nueva: la app del conductor registra actividad sin
-- preguntarle a nadie si hay una regla configurada, así que puede haber días
-- trabajados y cerrados de antes de que la oficina configure nada.
create or replace function private.encomienda_congelar_pendientes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in
    select distinct j.chofer_id, j.fecha
      from encomienda_jornadas j
     where j.chofer_id is not null
       and j.cerrada_en is not null
       and not exists (
         select 1 from encomienda_pagos p
          where p.chofer_id = j.chofer_id and p.fecha = j.fecha
       )
     order by j.chofer_id, j.fecha
  loop
    perform private.encomienda_congelar_dia(d.chofer_id, d.fecha);
  end loop;
end;
$$;

revoke all on function private.encomienda_congelar_pendientes() from public;

-- Se barre al CREAR la regla, no al editarla. Solo on INSERT, y ahí está todo el
-- diseño: editar la regla no puede tocar un día ya congelado.
create or replace function private.encomienda_regla_creada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.encomienda_congelar_pendientes();
  return null;
end;
$$;

revoke all on function private.encomienda_regla_creada() from public;

drop trigger if exists trg_encomienda_regla_congelar_pendientes on encomienda_reglas_pago;
create trigger trg_encomienda_regla_congelar_pendientes
  after insert on encomienda_reglas_pago
  for each statement execute function private.encomienda_regla_creada();

-- ----------------------------------------------------------------------------
-- 11. Cerrar sola la jornada que nadie cerró
-- ----------------------------------------------------------------------------
-- Pasa: la batería se muere, el conductor cierra la app antes de la última
-- parada, o directamente se olvida. Sin esto ese día no se valora nunca y el
-- conductor no cobra.
--
-- Solo toca días YA PASADOS en hora de Chile — nunca el de hoy, que puede estar
-- en curso. cerrada_en se pone en la hora del último evento del día, que es
-- cuando el trabajo terminó de verdad; poner la hora del barrido diría que el
-- conductor estuvo repartiendo hasta la madrugada.
--
-- También levanta los (conductor, día) que tienen actividad pero ninguna
-- jornada: un teléfono que sincronizó entregas y nunca alcanzó a mandar la
-- apertura de la ruta.
create or replace function private.encomienda_cerrar_jornadas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy   date := (now() at time zone 'America/Santiago')::date;
  v_total integer := 0;
begin
  -- Las que existen y quedaron abiertas.
  with cerradas as (
    update encomienda_jornadas j
       set cerrada_en = coalesce(
             (select max(a.hora) from encomienda_actividad a
               where a.chofer_id = j.chofer_id and a.fecha = j.fecha),
             -- Jornada abierta sin un solo evento: el conductor generó la ruta
             -- y no marcó nada. No es un día trabajado, pero la jornada tiene
             -- que cerrarse igual o el barrido la mira todos los días. Se cierra
             -- con su propio inicio; encomienda_congelar_dia no le va a escribir
             -- cifras porque no hay eventos que contar.
             j.inicio,
             now()
           )
     where j.fecha < v_hoy
       and j.cerrada_en is null
    returning 1
  )
  select count(*) into v_total from cerradas;

  -- Y las que nunca se abrieron pero tienen actividad.
  --
  -- inicio solo mira los eventos del TELÉFONO: los que cargó la oficina llevan
  -- una hora de relleno (mediodía UTC) porque nadie anotó la real, y usarla acá
  -- convertiría ese relleno en "el conductor salió a las ocho". En un día
  -- íntegramente manual queda null, que es lo mismo que escribe la oficina al
  -- cargarlo.
  with faltantes as (
    insert into encomienda_jornadas (chofer_id, fecha, inicio, cerrada_en)
    select a.chofer_id, a.fecha, min(a.hora) filter (where a.origen = 'app'), max(a.hora)
      from encomienda_actividad a
     where a.fecha < v_hoy
       and a.chofer_id is not null
       and not exists (
         select 1 from encomienda_jornadas j
          where j.chofer_id = a.chofer_id and j.fecha = a.fecha
       )
     group by a.chofer_id, a.fecha
    returning 1
  )
  select v_total + count(*) into v_total from faltantes;

  return v_total;
end;
$$;

revoke all on function private.encomienda_cerrar_jornadas_vencidas() from public;

-- Todos los días a las 04:30 UTC = 00:30 en Chile (01:30 en horario de verano).
-- Después del cierre del día chileno y antes de que nadie mire el panel.
create extension if not exists pg_cron;

-- unschedule primero para que volver a correr el archivo no acumule trabajos ni
-- falle por nombre repetido.
do $$
begin
  perform cron.unschedule('encomienda-cerrar-jornadas');
exception
  when others then null;  -- no estaba programado
end $$;

select cron.schedule(
  'encomienda-cerrar-jornadas',
  '30 4 * * *',
  $cron$ select private.encomienda_cerrar_jornadas_vencidas(); $cron$
);

-- Y una pasada ahora, para lo que ya esté en la base (útil después de importar
-- los datos del sistema anterior: ver scripts/migrar-datos.mjs).
select private.encomienda_cerrar_jornadas_vencidas() as jornadas_cerradas_ahora;
select private.encomienda_congelar_pendientes();

-- ----------------------------------------------------------------------------
-- 12. Verificación: las seis tienen que dar true.
-- ----------------------------------------------------------------------------
select
  to_regclass('public.encomienda_actividad') is not null as "actividad_ok",
  to_regclass('public.encomienda_jornadas')  is not null as "jornadas_ok",
  to_regprocedure('private.encomienda_congelar_dia(uuid, date, boolean, integer, text, numeric, integer, integer, integer)')
    is not null as "la_cuenta_ok",
  to_regprocedure('public.encomienda_valorar_dia(uuid, date, integer, text, numeric, integer, integer, integer)')
    is not null as "valorar_a_mano_ok",
  exists (select 1 from cron.job where jobname = 'encomienda-cerrar-jornadas')
    as "cierre_automatico_ok",
  -- Ningún día cerrado quedó sin cifras (salvo que no haya regla todavía).
  (
    (select count(*) from encomienda_reglas_pago) = 0
    or not exists (
      select 1 from encomienda_jornadas j
       where j.chofer_id is not null
         and j.cerrada_en is not null
         and exists (
           select 1 from encomienda_actividad a
            where a.chofer_id = j.chofer_id and a.fecha = j.fecha
         )
         and not exists (
           select 1 from encomienda_pagos p
            where p.chofer_id = j.chofer_id and p.fecha = j.fecha
         )
    )
  ) as "ningun_dia_cerrado_sin_cifras";
