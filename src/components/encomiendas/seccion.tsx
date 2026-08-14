// Título de sección para la vista del chofer. Existe para que todos los
// bloques de la hoja deslizable (ruta del día, pendientes, otro día) se lean
// con el mismo peso y separación, en vez de que cada uno traiga su propio
// tamaño de texto y su propio margen.
export function Seccion({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  /** Control opcional alineado a la derecha del título. */
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}
