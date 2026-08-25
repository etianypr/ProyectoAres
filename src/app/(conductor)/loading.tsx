// La pantalla de carga de la app del conductor.
//
// Existe porque entrar ya no pasa por un menú: /conductor reenvía solo al
// reparto, y ese reenvío hace dos consultas al servidor —la sesión y la ficha
// del chofer— antes de poder dibujar nada. Sin esto, abrir la app desde el
// ícono deja el teléfono en blanco hasta que el servidor contesta, que es
// exactamente lo que parece una app rota.
//
// Es el mapa con la hoja abajo, en gris: la misma silueta que va a aparecer.
// No dice "Cargando" ni gira nada — lo que tranquiliza no es la palabra, es
// reconocer de antemano la forma de lo que viene.
//
// Cubre todo el grupo (conductor), así que también tapa el salto entre el
// reparto y cualquier pantalla nueva que se agregue bajo /conductor.
export default function CargandoConductor() {
  return (
    // aria-hidden en el relleno y aria-busy afuera: el lector de pantalla no
    // debería anunciar cajas vacías, pero sí que la pantalla está ocupada.
    <div aria-busy="true" className="min-h-dvh bg-background">
      <div aria-hidden className="animate-fade-in relative flex min-h-dvh flex-col">
        {/* El mapa */}
        <div className="flex-1 animate-pulse bg-border/40" />

        {/* El carril de arriba: el botón del menú y el cartel. */}
        <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-card shadow-md" />
          <div className="h-12 flex-1 animate-pulse rounded-2xl bg-card shadow-card" />
        </div>

        {/* La hoja cerrada, con el alto que tiene la cabecera de una parada. */}
        <div className="rounded-t-[22px] bg-card px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-card">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-separator" />
          <div className="mt-4 flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-background" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/5 animate-pulse rounded bg-background" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-background" />
            </div>
          </div>
          <div className="mt-3.5 h-12 animate-pulse rounded-full bg-background" />
        </div>
      </div>
    </div>
  );
}
