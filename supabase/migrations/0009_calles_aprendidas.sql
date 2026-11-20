-- 0009 · Calles aprendidas (spec 044; dueño, 2026-11-20: «que cada corrección quede guardada para un
-- aprendizaje de la aplicación», compartido en Supabase). Re-ejecutable.
--
-- Cómo viene escrita una calle → cómo se llama: «ORIZOMBO BARBOZA» → «Orozimbo Barbosa». La aprende
-- el teléfono cuando el conductor confirma una corrección (de la IA o a mano) y cuando Google
-- confirma la puerta con ese número en esa calle; la próxima vez se busca directo con el nombre
-- bueno, sin IA. SIN número de casa, OF ni nombre: un nombre de calle no identifica a nadie, y por
-- eso queda después de cerrar el día (los pedidos se siguen borrando, spec 007). La base rechaza
-- un número de 3 dígitos o más en la calle, que sería el de una casa.
--
-- La 0008 la reserva la rama 004-menos-visitas-fallidas (sin correr).

create table if not exists public.encomienda_calles_aprendidas (
  /** La calle escrita como la busca la app, sin el número: minúsculas, sin tildes. */
  escrita text primary key
    check (char_length(escrita) between 3 and 120 and escrita !~ '\d{3,}' and escrita = lower(escrita)),
  oficial text not null check (char_length(oficial) between 3 and 120 and oficial !~ '\d{3,}'),
  fuente text not null check (fuente in ('conductor', 'ia', 'google')),
  confirmaciones int not null default 1 check (confirmaciones >= 1),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

alter table public.encomienda_calles_aprendidas enable row level security;

-- Leer: cualquiera con sesión (el conductor la usa al ubicar; el jefe la revisa en el panel).
drop policy if exists encomienda_calles_aprendidas_leer on public.encomienda_calles_aprendidas;
create policy encomienda_calles_aprendidas_leer on public.encomienda_calles_aprendidas for select to authenticated
  using ((select private.get_rol()) in ('admin', 'operador', 'conductor'));

-- Borrar una mal aprendida: el jefe (admin/operador). El conductor no borra ni escribe directo:
-- aprende por la función de abajo.
drop policy if exists encomienda_calles_aprendidas_borrar on public.encomienda_calles_aprendidas;
create policy encomienda_calles_aprendidas_borrar on public.encomienda_calles_aprendidas for delete to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'));

-- Aprender una calle. La misma oficial suma una confirmación. Otra oficial la reemplaza solo si la
-- confirmó una persona (conductor o IA confirmada) o si la que había la dio Google: Google no pisa
-- lo que eligió el conductor.
create or replace function public.encomienda_aprender_calle(p_escrita text, p_oficial text, p_fuente text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select private.get_rol()) not in ('admin', 'operador', 'conductor') then
    raise exception 'Sin permiso para aprender calles.';
  end if;
  insert into encomienda_calles_aprendidas as c (escrita, oficial, fuente)
  values (p_escrita, p_oficial, p_fuente)
  on conflict (escrita) do update
    set oficial = case
          when c.oficial = excluded.oficial or excluded.fuente <> 'google' or c.fuente = 'google' then excluded.oficial
          else c.oficial
        end,
        -- La misma calle confirmada otra vez conserva quién la confirmó primero si fue una persona.
        fuente = case
          when c.oficial = excluded.oficial then (case when c.fuente <> 'google' then c.fuente else excluded.fuente end)
          when excluded.fuente <> 'google' or c.fuente = 'google' then excluded.fuente
          else c.fuente
        end,
        confirmaciones = case
          when c.oficial = excluded.oficial then c.confirmaciones + 1
          when excluded.fuente <> 'google' or c.fuente = 'google' then 1
          else c.confirmaciones
        end,
        actualizada_en = now();
end;
$$;

revoke all on function public.encomienda_aprender_calle(text, text, text) from public, anon;
grant execute on function public.encomienda_aprender_calle(text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificación: todo true.
select
  to_regclass('public.encomienda_calles_aprendidas') is not null as tabla,
  (select relrowsecurity from pg_class where oid = 'public.encomienda_calles_aprendidas'::regclass) as rls,
  (select count(*) = 2 from pg_policies where tablename = 'encomienda_calles_aprendidas') as policies,
  to_regprocedure('public.encomienda_aprender_calle(text, text, text)') is not null as funcion;
