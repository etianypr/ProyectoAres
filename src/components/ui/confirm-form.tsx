"use client";

import { useActionState } from "react";

export type EliminarState = { error?: string };

// Formulario que pide confirmación nativa antes de ejecutar la server action.
// Úsalo para acciones destructivas (eliminar registros). La action debe
// devolver { error } en vez de fallar en silencio (p.ej. si la BD la bloquea
// por una FK "on delete restrict"), para que el usuario sepa por qué no pasó.
export function ConfirmForm({
  action,
  mensaje,
  className,
  children,
}: {
  action: (prevState: EliminarState, formData: FormData) => Promise<EliminarState>;
  mensaje: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(mensaje)) e.preventDefault();
      }}
    >
      {children}
      {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
