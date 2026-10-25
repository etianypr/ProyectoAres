// Cuánto falta para el bono del día (spec 006, US4). La meta viene de la regla
// de pago (el conductor solo puede leer ese número, ver la migración 0007) y el
// avance son las entregas marcadas en el teléfono: anda sin señal.

export function MetaBono({ meta, entregadas }: { meta: number | null; entregadas: number }) {
  if (!meta) return null;
  const faltan = Math.max(0, meta - entregadas);
  return (
    <p className="mb-2.5 text-xs font-medium tabular-nums text-muted">
      {faltan === 0 ? (
        <span className="text-ok">Bono logrado · {entregadas} de {meta} entregas</span>
      ) : (
        <>
          Bono: {entregadas} de {meta} entregas · faltan <span className="font-semibold text-foreground">{faltan}</span>
        </>
      )}
    </p>
  );
}
