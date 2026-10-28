"use client";

// Cargar a mano un día que el teléfono del conductor nunca registró: se quedó
// sin batería, se reinstaló la app, o el día es anterior a que la app existiera.
// Sin esto ese día no existe para el sistema y no se le puede pagar al
// conductor, aunque haya trabajado (ver la cabecera de la migración 0028).
//
// El formulario muestra la plata ANTES de guardar —ingresos estimados y lo que
// se le va a pagar con la tarifa elegida— porque es lo que la persona que carga
// el día está tratando de decidir. Se calcula con las mismas funciones puras
// que usa el panel y que la confirmación del pago (lib/encomiendas/pago.ts):
// una sola cuenta, sin una versión "de vista previa" que pueda desviarse de la
// de verdad.
//
// Y con qué tarifa se calcula SE ELIGE acá (0033). La regla de pago es una sola
// y rige hacia adelante, así que para un día de hace tres meses que se pagaba
// distinto no hay ninguna tabla de donde sacar su tarifa: los números los
// escribe quien liquida, y valen solo para ese día.

import { useState } from "react";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

import { type Tarifa } from "@/lib/encomiendas/pago";
import type { ReglaDePago } from "@/types/db";
import { valoresDeTarifa, type ValoresTarifa } from "./campos-tarifa";

import { DialogoAgregarDia } from "./dialogo-agregar-dia";

export type ConductorOpcion = { id: string; nombre: string };

/** Con qué tarifa se valora el día que se está cargando. Lo lee el servidor del
 *  campo modo_tarifa (ver agregarDiaManual). */
export type ModoTarifa = "dia" | "actual" | "editada";

/** Lo que ya hay cargado en el periodo que se está mirando, para poder avisar
 *  que lo nuevo se SUMA en vez de reemplazar. Solo cubre el periodo en pantalla:
 *  si se elige una fecha de otro mes no hay con qué comparar, y el aviso
 *  general de abajo del formulario es el que queda. */
export type DiaConocido = {
  fecha: string;
  conductorId: string | null;
  entregados: number;
  omitidos: number;
  /** Cuántos de los eventos de ese día ya eran carga manual. */
  manuales: number;
  /** Total de eventos del día, para saber si la carga manual es todo o parte. */
  total: number;
  /** La tarifa con la que ese día YA está calculado (0031). Agregarle actividad
   *  lo recalcula con esta, no con la regla de ahora, así que la vista previa
   *  tiene que usarla o mostraría una cifra que la base no va a escribir. */
  tarifa: Tarifa | null;
};

export function AgregarDia({
  conductores,
  errorConductores,
  regla,
  diasConocidos,
  hoy,
}: {
  conductores: ConductorOpcion[];
  /** Mensaje si la lista de conductores no se pudo leer. Una lista vacía por
   *  un error y una lista vacía porque nadie tiene la categoría se veían igual,
   *  y el aviso afirmaba lo segundo sin saberlo. */
  errorConductores?: string | null;
  /** La regla de pago, o null si todavía no se configuró (0031). Sin ella no se
   *  puede cargar un día: la base no le escribiría cifras y quedaría un día
   *  trabajado que no suma ni se puede pagar. */
  regla: ReglaDePago | null;
  diasConocidos: DiaConocido[];
  /** Fecha de hoy en Chile, calculada en el servidor: el reloj del navegador
   *  puede estar en otra zona y el tope del campo quedaría corrido un día. */
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);

  // La tarifa elegida vive acá y no en el diálogo, para que sobreviva a cerrar
  // y volver a abrir. Cargar un mes viejo son veinte días seguidos con la misma
  // tarifa: volver a teclearla en cada uno es donde aparecen los errores.
  const [modo, setModo] = useState<ModoTarifa>("dia");
  const [tarifaEditada, setTarifaEditada] = useState<ValoresTarifa>(() =>
    valoresDeTarifa(regla),
  );

  // El servidor vuelve a comprobar las dos cosas: esto es para no dejar
  // escribir un formulario entero antes de decir que no se puede.
  const bloqueo = regla == null
    ? "Configura primero la regla de pago: sin ella no se puede calcular el día."
    : errorConductores
      ? `No se pudo leer la lista de conductores: ${errorConductores}`
      : conductores.length === 0
        ? "Ningún conductor tiene la categoría 'Encomiendas' asignada."
        : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={() => {
          setListo(false);
          setAbierto(true);
        }}
        size="sm"
        variant="secondary"
        disabled={bloqueo != null}
        title={bloqueo ?? undefined}
      >
        <CalendarPlus className="h-4 w-4" />
        Agregar día
      </Button>
      {listo ? <p className="text-xs text-ok">Día cargado.</p> : null}

      {abierto && regla ? (
        <DialogoAgregarDia
          conductores={conductores}
          regla={regla}
          diasConocidos={diasConocidos}
          hoy={hoy}
          modo={modo}
          onModo={setModo}
          tarifaEditada={tarifaEditada}
          onTarifaEditada={setTarifaEditada}
          onCerrar={() => setAbierto(false)}
          onGuardado={() => {
            setAbierto(false);
            setListo(true);
          }}
        />
      ) : null}
    </div>
  );
}

