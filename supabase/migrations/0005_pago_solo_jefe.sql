-- ============================================================================
-- 0005 — Recalcular o valorar un día queda solo para admin y operador.
--        Ejecutar DESPUÉS de la 0004, en Supabase > SQL Editor. Re-ejecutable.
--
-- El hueco: encomienda_repreciar_dia y encomienda_valorar_dia comprobaban el
-- rol con `get_rol() not in ('admin', 'operador')`. Sin sesión (o con un perfil
-- inactivo) get_rol() devuelve null, `null not in (...)` da null, y el `if` no
-- lanza: la función seguía y reescribía el pago del día. Y el rol anon podía
-- llamarlas, porque Supabase le da EXECUTE a las funciones nuevas de `public`
-- además de lo que diga el `revoke ... from public`.
--
-- Arreglo: el rol vacío cuenta como "sin permiso" y anon pierde EXECUTE. El
-- resto de cada función queda igual, letra por letra (de ahí sale el sueldo).
-- ============================================================================

create or replace function encomienda_repreciar_dia(p_chofer_id uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select private.get_rol())::text, '') not in ('admin', 'operador') then
    raise exception 'No tienes permiso para recalcular pagos.';
  end if;
  perform private.encomienda_congelar_dia(p_chofer_id, p_fecha, true);
end;
$$;

revoke all on function encomienda_repreciar_dia(uuid, date) from public, anon;
grant execute on function encomienda_repreciar_dia(uuid, date) to authenticated;

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

-- ----------------------------------------------------------------------------
-- Verificación: las cuatro tienen que dar true.
-- ----------------------------------------------------------------------------
select
  not has_function_privilege('anon', 'public.encomienda_repreciar_dia(uuid, date)', 'execute')
    as "anon_no_reprecia",
  not has_function_privilege('anon',
    'public.encomienda_valorar_dia(uuid, date, integer, text, numeric, integer, integer, integer)', 'execute')
    as "anon_no_valora",
  pg_get_functiondef('public.encomienda_repreciar_dia(uuid, date)'::regprocedure) like '%coalesce((select private.get_rol())::text%'
    as "reprecia_sin_rol_rechaza",
  pg_get_functiondef('public.encomienda_valorar_dia(uuid, date, integer, text, numeric, integer, integer, integer)'::regprocedure)
    like '%coalesce((select private.get_rol())::text%'
    as "valora_sin_rol_rechaza";
