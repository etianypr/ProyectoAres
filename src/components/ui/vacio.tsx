import { cn } from "@/lib/utils";

// Estado vacío. Las páginas de listado ya tenían uno bueno (tarjeta centrada
// con ícono y acción), pero dentro de las tarjetas del panel los "no hay
// datos" eran párrafos grises sueltos: un mes flojo dejaba el inicio con tres
// frases perdidas en el aire. Esto les da la misma forma a todos.
export function Vacio({
  titulo,
  icono,
  accion,
  className,
}: {
  titulo: string;
  icono?: React.ReactNode;
  accion?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center gap-2 px-4 py-8 text-center", className)}
      // El ícono es decorativo: el texto ya dice lo mismo.
      aria-live="polite"
    >
      {icono ? <span className="text-muted/45">{icono}</span> : null}
      <p className="text-sm text-muted">{titulo}</p>
      {accion}
    </div>
  );
}
