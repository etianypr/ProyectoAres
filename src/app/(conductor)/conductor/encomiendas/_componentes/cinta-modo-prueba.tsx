// "MODO PRUEBA" arriba de todo mientras nada se envía (ver
// lib/encomiendas/local/modo-prueba.ts): que no se confunda con un día real.

export function CintaModoPrueba({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-[max(0.25rem,env(safe-area-inset-top))] z-[55] -translate-x-1/2 rounded-full border border-warn bg-warn-bg px-3 py-0.5 text-[11px] font-bold tracking-wide text-warn">
      MODO PRUEBA
    </div>
  );
}
