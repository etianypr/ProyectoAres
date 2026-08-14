// Esqueleto de carga para TODO el panel. Cada página del panel es dinámica y
// hace varias consultas a Supabase antes de poder renderizar; sin esto, al
// cambiar de sección la pantalla se quedaba congelada en la página anterior
// durante casi un segundo y daba la sensación de que el clic no había pasado
// nada (la gente termina apretando dos veces).
//
// Next.js muestra este archivo automáticamente mientras la página de al lado
// se resuelve en el servidor, así que cubre las 15 rutas del panel de una vez.
function Bloque({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-border/50 ${className ?? ""}`} />;
}

export default function CargandoPanel() {
  return (
    // aria-hidden: es puro relleno visual. El lector de pantalla no debería
    // anunciar cajas vacías, así que se le avisa con el aria-busy de al lado.
    <div aria-busy="true">
      <div aria-hidden className="animate-fade-in">
        {/* Encabezado (título + acciones), como PageHeader */}
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Bloque className="h-7 w-44" />
            <Bloque className="h-3.5 w-64" />
          </div>
          <Bloque className="h-[42px] w-36 rounded-full" />
        </div>

        {/* Fila de indicadores */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[18px] bg-card p-6 shadow-soft">
              <Bloque className="h-3 w-24" />
              <Bloque className="mt-3 h-7 w-32" />
            </div>
          ))}
        </div>

        {/* Listado */}
        <div className="overflow-hidden rounded-[18px] bg-card shadow-soft">
          <div className="border-b border-border bg-background px-4 py-3">
            <Bloque className="h-3 w-28" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-4">
              <Bloque className="h-3.5 w-1/5" />
              <Bloque className="h-3.5 w-1/4" />
              <Bloque className="ml-auto h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
