-- HISTÓRICA: los nombres "chofer"/"choferes" de este archivo se renombraron a
-- "conductor"/"conductores" en 0006_conductor.sql (spec 002 US2). No se edita.
-- ============================================================================
-- 0001 — Base: empresa, perfiles/roles, conductores, storage.
--        Ejecutar en Supabase > SQL Editor del proyecto de ARES. Re-ejecutable.
--
-- ⚠️ COMPROBÁ EN QUÉ PROYECTO ESTÁS ANTES DE CORRER ESTO. Este archivo es para
--    la base nueva, la de esta empresa. Corrido en la base del sistema del que
--    nos separamos, chocaría contra tablas que ya existen ahí.
--
-- ----------------------------------------------------------------------------
-- DE DÓNDE SALE
--
-- Este esquema es la consolidación de las migraciones 0004–0035 del sistema de
-- gestión general de Transportes Pucarani, quedándose SOLO con lo que necesita
-- el reparto de encomiendas. Los cuerpos de las funciones se copiaron TEXTUALES:
-- de ellos sale el sueldo del conductor, así que no se reescribieron ni se
-- "mejoraron" al mudarlos. Lo que cambió es qué tablas existen.
--
-- Lo que quedó fuera, y no está pendiente de portar: clientes, cotizaciones,
-- viajes, facturas, cobranzas, taxis, flota (vehículos y sus gastos) e
-- integración SII. Eso es de la otra empresa.
--
-- Dos desvíos deliberados respecto del original, los dos anotados donde ocurren:
--   1. NO existe el rol 'contador'. No hay facturación que leer, y las
--      liquidaciones son justo lo que no conviene dejar navegable de más.
--   2. NO existe chofer_categorias. Allá un chofer se marcaba con sus líneas de
--      trabajo (operación / taxis / encomiendas) y esa marca decidía si aparecía
--      en la liquidación y si podía abrir la app. Acá el reparto es el único
--      negocio: quien está en `choferes`, reparte.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Función UUIDv7
-- ----------------------------------------------------------------------------
-- Postgres < 18 no la trae. Se usa como default de las tablas que crecen por
-- fecha (actividad, jornadas, pagos): v7 lleva la hora adelante, así que los
-- inserts caen al final del índice en vez de dispersarse como haría v4.
create or replace function uuid_generate_v7()
returns uuid
language sql
volatile
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

grant execute on function uuid_generate_v7() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Tipos
-- ----------------------------------------------------------------------------
-- Sin 'contador' (ver la cabecera). Agregarlo después es un `alter type ... add
-- value` y las policies que lo nombren; no hay nada acá que lo impida.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'rol_usuario') then
    create type rol_usuario as enum ('admin', 'operador', 'chofer');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Funciones de infraestructura
-- ----------------------------------------------------------------------------
-- Mantiene updated_at sin depender de la app.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rellena empresa_id con la empresa única si el insert no lo trae.
--
-- De esto depende TODO insert de la app: el cliente nunca manda empresa_id. Por
-- eso la sección 8 siembra una fila de empresa — sin ninguna, este trigger deja
-- empresa_id en null y el insert muere contra el not null.
create or replace function set_empresa_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa_id is null then
    select id into new.empresa_id from empresa order by created_at limit 1;
  end if;
  return new;
end;
$$;

-- Schema privado (no expuesto por la API) para helpers de RLS y para la cuenta
-- del pago, que no tiene por qué ser invocable desde /rest/v1/rpc.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Perfiles de usuario y roles
-- ----------------------------------------------------------------------------
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'operador',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rol del usuario actual. SECURITY DEFINER: lee perfiles sin recursión de RLS.
create or replace function private.get_rol()
returns rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from perfiles where id = auth.uid() and activo;
$$;

revoke all on function private.get_rol() from public;
grant execute on function private.get_rol() to authenticated;

-- Alta automática de perfil al registrarse un usuario.
-- El primer usuario del sistema queda como admin; los siguientes, operador.
--
-- Los conductores pasan por acá también: al invitarlos se les crea la cuenta de
-- Auth (esto les hace el perfil como 'operador') y enseguida la app les pone
-- rol 'chofer' con la llave service_role. Ver invitarChofer en
-- src/app/(app)/choferes/actions.ts.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1), 'Usuario'),
    case
      when exists (select 1 from perfiles where rol = 'admin') then 'operador'::rol_usuario
      else 'admin'::rol_usuario
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Usuarios creados en el dashboard ANTES de correr esto: quedan admin. En un
-- proyecto nuevo no hay ninguno; está por si el primer usuario se creó a mano.
insert into perfiles (id, nombre, rol)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'nombre', split_part(u.email, '@', 1), 'Usuario'),
       'admin'
from auth.users u
on conflict (id) do nothing;

drop trigger if exists trg_perfiles_updated on perfiles;
create trigger trg_perfiles_updated before update on perfiles
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Empresa
-- ----------------------------------------------------------------------------
-- Una fila. Sigue teniendo empresa_id por todas partes —y esta tabla sigue
-- siendo una tabla y no constantes— porque la idea de vender esto a otras
-- empresas de reparto está sobre la mesa: el día que pase, lo que falta es
-- filtrar por empresa_id en las policies, no rediseñar el esquema.
--
-- Sin proximo_numero_cotizacion: acá no se emiten cotizaciones.
create table if not exists empresa (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Encomiendas',
  razon_social text,
  rut text,
  direccion text,
  ciudad text,
  giro text,
  telefono text,
  email text,
  logo_url text,
  representante text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_empresa_updated on empresa;
create trigger trg_empresa_updated before update on empresa
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Conductores
-- ----------------------------------------------------------------------------
-- Se llama `choferes` y no `conductores` porque así se llama en las cuatro
-- tablas de encomiendas que la referencian y en las policies que las protegen;
-- renombrarla era una refactorización con riesgo y sin relación con separar el
-- proyecto. En la interfaz dice "conductor".
create table if not exists choferes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  -- Su cuenta de acceso. NO es opcional en la práctica: sin cuenta no puede
  -- abrir /conductor, y sin eso no hay ruta, no hay entregas registradas y no
  -- hay liquidación. Es nullable solo porque la ficha se crea antes de invitar.
  user_id uuid references auth.users(id) on delete set null,
  -- Con qué correo se lo invitó. No se lee de auth.users porque ese schema no
  -- está expuesto por la API REST: esta columna es la fuente de verdad para
  -- mostrarlo en la app.
  email text,
  nombre text not null,
  rut text,
  telefono text,
  foto_url text,
  licencia_numero text,
  licencia_clase text,
  licencia_vencimiento date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists choferes_rut_unico on choferes (empresa_id, rut) where rut is not null;
create unique index if not exists choferes_email_unico on choferes (email) where email is not null;
create index if not exists idx_choferes_user on choferes (user_id) where user_id is not null;

drop trigger if exists trg_choferes_empresa on choferes;
create trigger trg_choferes_empresa before insert on choferes
  for each row execute function set_empresa_id();
drop trigger if exists trg_choferes_updated on choferes;
create trigger trg_choferes_updated before update on choferes
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Row Level Security
--    admin/operador: todo · chofer: lectura de los catálogos
-- ----------------------------------------------------------------------------
alter table perfiles enable row level security;
alter table empresa  enable row level security;
alter table choferes enable row level security;

-- perfiles: cada uno ve el suyo; admin administra todos.
--
-- El self_read no es un detalle: de él depende private.get_rol(), o sea toda la
-- autorización de la app.
drop policy if exists perfiles_self_read on perfiles;
create policy perfiles_self_read on perfiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists perfiles_admin_all on perfiles;
create policy perfiles_admin_all on perfiles for all to authenticated
  using ((select private.get_rol()) = 'admin')
  with check ((select private.get_rol()) = 'admin');

drop policy if exists empresa_read_auth on empresa;
create policy empresa_read_auth on empresa for select to authenticated using (true);
drop policy if exists empresa_write_admin_op on empresa;
create policy empresa_write_admin_op on empresa for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

-- El conductor necesita leer choferes: la app busca SU ficha por user_id para
-- saber quién es (ver accesoEncomiendas). Escribir, no.
drop policy if exists choferes_read_auth on choferes;
create policy choferes_read_auth on choferes for select to authenticated using (true);
drop policy if exists choferes_write_admin_op on choferes;
create policy choferes_write_admin_op on choferes for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

-- ----------------------------------------------------------------------------
-- 8. La fila de empresa
-- ----------------------------------------------------------------------------
-- OBLIGATORIA, no cosmética: set_empresa_id() la busca en cada insert (ver la
-- sección 3). Sin ella la app no puede guardar nada.
--
-- Los datos reales se completan en Configuración; acá va un nombre neutro a
-- propósito, para no dejar escrito en la base el de la empresa de la que nos
-- separamos.
insert into empresa (nombre)
select 'Encomiendas'
where not exists (select 1 from empresa);

-- ----------------------------------------------------------------------------
-- 9. Storage: logo de la empresa y foto del conductor
-- ----------------------------------------------------------------------------
-- Los dos públicos: son un logo y una foto de perfil que la app muestra por URL
-- directa. Los buckets privados del sistema original (adjuntos de facturas,
-- certificados digitales del SII) no existen acá.
insert into storage.buckets (id, name, public) values
  ('logos', 'logos', true),
  ('fotos', 'fotos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists storage_publicos_read on storage.objects;
create policy storage_publicos_read on storage.objects for select
  using (bucket_id in ('logos', 'fotos'));

drop policy if exists storage_publicos_rw_admin_op on storage.objects;
create policy storage_publicos_rw_admin_op on storage.objects for all to authenticated
  using (bucket_id in ('logos', 'fotos') and (select private.get_rol()) in ('admin', 'operador'))
  with check (bucket_id in ('logos', 'fotos') and (select private.get_rol()) in ('admin', 'operador'));

-- ----------------------------------------------------------------------------
-- 10. Endurecimiento (los avisos del Security Advisor de Supabase)
-- ----------------------------------------------------------------------------
-- search_path fijo: una función sin él puede ser engañada por objetos homónimos
-- en otro esquema. El cuerpo de estas dos es 100 % pg_catalog, así que aguantan
-- el search_path vacío.
alter function set_updated_at() set search_path = '';
alter function uuid_generate_v7() set search_path = '';

-- Las funciones de trigger no son API: nadie debe poder llamarlas por
-- /rest/v1/rpc. Los triggers siguen funcionando — el privilegio se exige al
-- CREAR el trigger, no al dispararse.
revoke execute on function set_empresa_id() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;
revoke execute on function uuid_generate_v7() from public, anon;

-- ----------------------------------------------------------------------------
-- 11. Verificación: las cuatro tienen que dar true.
-- ----------------------------------------------------------------------------
select
  to_regclass('public.choferes') is not null                    as "conductores_ok",
  (select count(*) from empresa) = 1                            as "una_empresa_ok",
  exists (select 1 from pg_type where typname = 'rol_usuario')   as "roles_ok",
  (select count(*) from storage.buckets where id in ('logos','fotos')) = 2
                                                                as "buckets_ok";
