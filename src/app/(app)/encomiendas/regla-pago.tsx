"use client";

// La regla de pago del conductor, en un diálogo sobre el propio panel: es un
// ajuste que se decide MIRANDO los números del mes, y mandar a otra pantalla
// obligaba a memorizar las cifras o a ir y volver.
//
// Es UNA regla y se edita encima (0031). Antes esto guardaba una versión nueva
// cada vez y la pantalla mostraba el historial completo; con dos o tres
// correcciones seguidas la lista se volvía ilegible y no se sabía cuál regía.
//
// Que no haya historial no significa que cambiarla reescriba el pasado: cada
// día guarda sus propias cifras al registrarse, así que lo que se toque acá
// solo afecta a los días que vengan. El texto del diálogo lo dice, porque es
// justo lo que uno duda antes de apretar Guardar.
//
// Y al revés: un día suelto que se pagaba distinto NO se arregla desde acá. Se
// carga con su propia tarifa desde "Agregar día", o se recalcula desde la vista
// del día (0033). Esta regla es la que rige de ahora en adelante.

import { useActionState, useState } from "react";
import { Save, Settings } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { Button } from "@/components/ui/button";
import { formatCLP, formatDate } from "@/lib/format";
import { valorPedido } from "@/lib/encomiendas/pago";
import type { EncomiendaReglaPago } from "@/types/db";
import { CamposTarifa, valoresDeTarifa, type ValoresTarifa } from "./campos-tarifa";
import { guardarReglaPago, type FormState } from "./actions";

export function ReglaPago({ regla }: { regla: EncomiendaReglaPago | null }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* Sin regla el módulo no puede calcular nada, así que el botón deja de
          ser un ajuste más y pasa a ser lo único que hay que hacer. */}
      <Button onClick={() => setAbierto(true)} variant={regla ? "secondary" : "primary"}>
        <Settings className="h-4 w-4" />
        {regla ? "Regla de pago" : "Configurar la regla de pago"}
      </Button>

      {abierto ? (
        <Dialogo
          titulo="Regla de pago"
          descripcion="Cuánto se estima que entra por entrega y cuánto se le paga al conductor."
          ancho="2xl"
          onCerrar={() => setAbierto(false)}
        >
          <Formulario regla={regla} onGuardado={() => setAbierto(false)} />
        </Dialogo>
      ) : null}
    </>
  );
}

function Formulario({
  regla,
  onGuardado,
}: {
  regla: EncomiendaReglaPago | null;
  onGuardado: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev: FormState, datos: FormData) => {
      const res = await guardarReglaPago(prev, datos);
      if (res.ok) onGuardado();
      return res;
    },
    {},
  );

  // Los campos arrancan con lo que rige: casi siempre se cambia UNA cosa (el
  // valor por entrega, el fijo diario) y volver a teclear todo lo demás es la
  // forma más fácil de guardar una regla distinta a la que se quería. Sin regla
  // todavía, el valor por entrega arranca en el aproximado del código, que es
  // mejor punto de partida que un campo vacío.
  const [valores, setValores] = useState<ValoresTarifa>(() => ({
    ...valoresDeTarifa(regla),
    valor_pedido: String(valorPedido(regla)),
  }));

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <p className="rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-xs text-info sm:col-span-2">
        {regla ? (
          <>
            Rige desde el {formatDate(regla.updated_at)}. Al guardar, el cambio se aplica a los
            días que se registren <strong>de acá en adelante</strong>: los que ya están cargados
            conservan las cifras con las que se calcularon. Para un día suelto que se pagaba
            distinto, elige “Otra tarifa para este día” al cargarlo.
          </>
        ) : (
          <>
            Todavía no hay regla configurada, así que no se puede calcular ningún día. Hasta que
            la guardes, los días que registre el conductor van a aparecer sin ingresos ni pago.
          </>
        )}
      </p>

      <CamposTarifa valores={valores} onChange={setValores} />

      {regla ? (
        <p className="text-xs text-muted sm:col-span-2">
          Con la regla de ahora, un día de 40 entregas paga{" "}
          <strong>{formatCLP(ejemplo(regla, 40))}</strong> y estima{" "}
          <strong>{formatCLP(40 * valorPedido(regla))}</strong> de ingreso.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        {state.error ? (
          <p className="mr-auto rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar regla"}
        </Button>
      </div>
    </form>
  );
}

/** Lo que pagaría un día de N entregas con la regla guardada. Es para que el
 *  número deje de ser abstracto: "7 % de $950" no se traduce solo a un sueldo.
 *  Usa la regla YA GUARDADA, no lo que hay tecleado en el formulario — es una
 *  referencia de dónde se está parado, no una vista previa del cambio. */
function ejemplo(regla: EncomiendaReglaPago, entregas: number): number {
  const valor = Number(regla.valor_pago);
  const base =
    regla.tipo_pago === "porcentaje"
      ? Math.round((entregas * valorPedido(regla) * valor) / 100)
      : Math.round(entregas * valor);
  const bono =
    regla.meta_entregas_dia != null && entregas >= regla.meta_entregas_dia
      ? Number(regla.bono_monto ?? 0)
      : 0;
  return base + Number(regla.monto_dia ?? 0) + bono;
}
