-- 0007 · Indicadores del negocio (spec 006, data-model.md). Re-ejecutable.
--
-- Dos conteos por día que manda el teléfono al cerrar, sin datos personales:
--   asignados    pedidos del día (lo que traía la guía)
--   contactados  pedidos cuyo receptor contestó la llamada o respondió el aviso
-- null = día anterior a esta migración (el panel dice desde cuándo hay datos).
-- Y la meta del bono, que el conductor puede leer sin ver la regla de pago.

alter table public.encomienda_jornadas
  add column if not exists asignados int check (asignados >= 0),
  add column if not exists contactados int check (contactados >= 0);

create or replace function public.encomienda_meta_entregas_dia()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select meta_entregas_dia from encomienda_reglas_pago limit 1;
$$;

revoke all on function public.encomienda_meta_entregas_dia() from public, anon;
grant execute on function public.encomienda_meta_entregas_dia() to authenticated, service_role;

notify pgrst, 'reload schema';
