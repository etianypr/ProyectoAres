-- 0006 · "chofer" → "conductor" en la base (spec 002 US2, data-model.md).
--
-- Solo cambian NOMBRES: ningún dato se toca. Re-ejecutable: cada paso busca el
-- nombre viejo y, si ya no está, no hace nada. Se aplica en una transacción
-- (apply_migration lo hace): o queda todo renombrado, o nada.
--
-- Las policies, defaults y FKs guardan referencias, no texto: Postgres las
-- actualiza solo al renombrar. Los cuerpos de las funciones plpgsql son texto y
-- se recrean (paso 5).

-- 1. Tabla
do $$
begin
  if to_regclass('public.choferes') is not null then
    alter table public.choferes rename to conductores;
  end if;
end $$;

-- 2. Columnas chofer_id → conductor_id
do $$
declare
  t text;
begin
  foreach t in array array['encomienda_actividad', 'encomienda_jornadas', 'encomienda_pagos', 'encomienda_whatsapp_correlaciones'] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'chofer_id'
    ) then
      execute format('alter table public.%I rename column chofer_id to conductor_id', t);
    end if;
  end loop;
end $$;

-- 3. Rol (las filas de perfiles conservan su valor: el enum cambia de etiqueta)
do $$
begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'rol_usuario' and e.enumlabel = 'chofer'
  ) then
    alter type public.rol_usuario rename value 'chofer' to 'conductor';
  end if;
end $$;

-- 4. Restricciones (con su índice), índices, triggers y policies
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabla, c.conname
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
     where n.nspname = 'public' and c.conname like '%chofer%'
  loop
    execute format('alter table %s rename constraint %I to %I', r.tabla, r.conname, replace(r.conname, 'chofer', 'conductor'));
  end loop;

  for r in select indexname from pg_indexes where schemaname = 'public' and indexname like '%chofer%' loop
    execute format('alter index public.%I rename to %I', r.indexname, replace(r.indexname, 'chofer', 'conductor'));
  end loop;

  for r in
    select tgrelid::regclass as tabla, tgname from pg_trigger
     where not tgisinternal and tgname like '%chofer%'
  loop
    execute format('alter trigger %I on %s rename to %I', r.tgname, r.tabla, replace(r.tgname, 'chofer', 'conductor'));
  end loop;

  for r in select schemaname, tablename, policyname from pg_policies where policyname like '%chofer%' loop
    execute format('alter policy %I on %I.%I rename to %I', r.policyname, r.schemaname, r.tablename, replace(r.policyname, 'chofer', 'conductor'));
  end loop;
end $$;

-- 5. Funciones: el cuerpo es texto. Las que cambian el nombre de un parámetro
-- (p_chofer_id) se borran y se crean de nuevo con los mismos permisos.
do $$
declare
  r record;
  v_rol text;
begin
  for r in
    select p.oid::regprocedure::text as firma,
           pg_get_functiondef(p.oid) as def,
           p.proacl,
           pg_get_function_identity_arguments(p.oid) like '%chofer%' as cambia_firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and (p.prosrc like '%chofer%' or pg_get_function_identity_arguments(p.oid) like '%chofer%')
  loop
    if r.cambia_firma then
      execute 'drop function ' || r.firma;
    end if;
    execute replace(r.def, 'chofer', 'conductor');
    if r.cambia_firma and r.proacl is not null then
      execute format('revoke all on function %s from public, anon, authenticated, service_role', r.firma);
      for v_rol in
        select g.rolname from aclexplode(r.proacl) a join pg_roles g on g.oid = a.grantee
         where a.privilege_type = 'EXECUTE' and g.rolname <> 'postgres'
      loop
        execute format('grant execute on function %s to %I', r.firma, v_rol);
      end loop;
    end if;
  end loop;
end $$;

-- 6. Verificación: si quedó algo con el nombre viejo, la transacción se cae.
do $$
begin
  if to_regclass('public.choferes') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and column_name like '%chofer%')
     or exists (select 1 from pg_enum where enumlabel = 'chofer')
     or exists (select 1 from pg_constraint where conname like '%chofer%')
     or exists (select 1 from pg_indexes where schemaname = 'public' and indexname like '%chofer%')
     or exists (select 1 from pg_trigger where tgname like '%chofer%')
     or exists (select 1 from pg_policies where policyname like '%chofer%')
     or exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.prosrc like '%chofer%'
     )
  then
    raise exception 'Quedó algo con el nombre "chofer".';
  end if;
end $$;

-- PostgREST (la API de Supabase) vuelve a leer el esquema con los nombres nuevos.
notify pgrst, 'reload schema';
