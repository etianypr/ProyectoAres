// Leer y convertir lo guardado por versiones anteriores. Dos mecanismos:
//
//  · Campos que faltan en un objeto (un pedido de la v1 sin `disponibilidad`,
//    una ruta sin `advertencias`): se completan EN LA LECTURA. Es barato y no
//    puede fallar.
//  · Datos que cambian de store o de nombre (v2 → v3: lo que guardaban la
//    parada de la ruta y el store "whatsapp" pasa al pedido, y los campos toman
//    los nombres del glosario; specs 009 y 011): no se pueden completar objeto
//    por objeto, porque
//    la mitad vive en otro store. Se convierten UNA vez al abrir la base, dentro
//    de la transacción de versión: o se convierte todo, o la base queda como
//    estaba (ver idb.ts).

import { DISPONIBILIDADES, esClave, type Disponibilidad } from "@/lib/encomiendas/catalogos";
import type { EstadoAviso } from "@/lib/encomiendas/catalogos";
import type { ResultadoVisita, ResultadoLlamada } from "@/lib/encomiendas/estados";
import { fechaChile } from "@/lib/comun/fechas";
import type { Trazado } from "@/lib/geo/coordenada";
import type { Aviso, Pedido, ResumenDia, Ruta } from "./tipos";

export function alDia(pedido: Pedido): Pedido {
  return {
    ...pedido,
    fecha: pedido.fecha ?? fechaChile(pedido.cargadoEn),
    disponibilidad: disponibilidadAlDia(pedido.disponibilidad),
    bloqueHorarioId: pedido.bloqueHorarioId ?? null,
    aviso: { ...avisoVacio(), ...pedido.aviso },
    llamada: pedido.llamada ?? "pendiente",
    resultado: resultadoAlDia(pedido.resultado),
    horaLlamada: pedido.horaLlamada ?? null,
    horaResultado: pedido.horaResultado ?? null,
    // Spec 003: los pedidos de antes no tienen paquete.
    of: pedido.of ?? null,
    referencia: pedido.referencia ?? null,
    fotoId: pedido.fotoId ?? null,
    // Spec 005: los pedidos de antes se cargaron a mano.
    bultos: pedido.bultos ?? null,
    bultosEscaneados: pedido.bultosEscaneados ?? [],
    porPagar: pedido.porPagar ?? null,
    montoPorPagar: pedido.montoPorPagar ?? null,
    folioGuia: pedido.folioGuia ?? null,
    origenCarga: pedido.origenCarga ?? "manual",
  };
}

/** Disponibilidades que la spec 010 retiró: "rechazado" pasa a ser "mañana" (no
 *  se entrega hoy) y "no respondió" vuelve a "sin responder". */
function disponibilidadAlDia(valor: string | undefined): Disponibilidad {
  if (valor === "rechazado") return "manana";
  return esClave(DISPONIBILIDADES, valor) ? valor : "pendiente_respuesta";
}

/** Desde la spec 012 el resultado es entregado o no: todo lo cerrado sin
 *  entregar de antes (No morador, sin respuesta, rechazo, omitido) es "no_entregado". */
function resultadoAlDia(valor: string | undefined): ResultadoVisita {
  if (valor === undefined || valor === "pendiente") return "pendiente";
  return valor === "entregado" ? "entregado" : "no_entregado";
}

/** Un resumen guardado antes de la spec 005 no trae cobros ni origen. */
export function diaAlDia(dia: ResumenDia): ResumenDia {
  return {
    ...dia,
    contactados: dia.contactados ?? null,
    porPagar: dia.porPagar ?? 0,
    aCobrar: dia.aCobrar ?? 0,
    cobrado: dia.cobrado ?? 0,
    porOrigen: dia.porOrigen ?? {},
  };
}

export function rutaAlDia(ruta: Ruta): Ruta {
  return {
    ...ruta,
    orden: ruta.orden ?? [],
    advertencias: ruta.advertencias ?? [],
    propuestasComparadas: ruta.propuestasComparadas ?? 1,
  };
}

/** El aviso de un pedido al que todavía no se le mandó nada. */
export function avisoVacio(): Aviso {
  return {
    estado: "pendiente",
    codigo: null,
    mensajeId: null,
    enviadoEn: null,
    ultimoError: null,
    intentos: 0,
    horariosEnviados: false,
    respuestasAplicadas: [],
  };
}

// --- v2 → v3 ------------------------------------------------------------------

// Las formas de la v2 usan los nombres de ESE momento (entrega, geometria,
// generadaEn, cerradaEn): son los datos guardados en los teléfonos.

/** La visita de un pedido en un día, tal como la guardaba la v2 dentro de la ruta. */
export type ParadaV2 = {
  pedidoId: string;
  llamada: ResultadoLlamada;
  /** Valores de la v2: entregado, persona_no_encontrada, rechazo, omitido… */
  entrega: string;
  horaLlamada: string | null;
  horaEntrega: string | null;
};

type CamposV3 = "fecha" | "llamada" | "resultado" | "horaLlamada" | "horaResultado" | "aviso";
export type PedidoV2 = Omit<Pedido, CamposV3> & {
  estado?: "pendiente" | "entregado" | "rechazado";
};
export type RutaV2 = Omit<Ruta, "orden" | "trazado" | "inicio" | "cierre"> & {
  paradas?: ParadaV2[];
  versionDisponibilidad?: string | null;
  geometria: Trazado | null;
  generadaEn: string;
  cerradaEn: string | null;
};

/** La fila del store "whatsapp" de la v2: el aviso de un pedido, aparte. */
export type AvisoV2 = {
  pedidoId: string;
  correlationId: string | null;
  mensajeId: string | null;
  estado: EstadoAviso;
  enviadoEn: string | null;
  ultimoError: string | null;
  intentos: number;
  horariosEnviados: boolean;
  respuestasAplicadas: string[];
};

/** Funde en cada pedido su parada y su aviso. Pura: recibe todo lo guardado y
 *  devuelve qué escribir; idb.ts la corre dentro de la transacción de versión.
 *
 *  Con el arrastre de la v2 un pedido podía tener paradas en varios días: manda
 *  la del día más reciente. `estado` cerrado (entregado, rechazado) gana sobre
 *  la parada, porque el rechazo por WhatsApp cerraba el pedido sin parada. Un
 *  pedido pendiente que nunca entró en una ruta queda con la fecha de hoy: es
 *  trabajo del día en curso. */
export function migrarV2(
  pedidos: PedidoV2[],
  rutas: RutaV2[],
  avisosV2: AvisoV2[],
  hoy: string,
): { pedidos: Pedido[]; rutas: Ruta[] } {
  const avisoDe = new Map(
    avisosV2.map(({ pedidoId, correlationId, ...resto }): [string, Aviso] => [
      pedidoId,
      { ...avisoVacio(), ...resto, codigo: correlationId },
    ]),
  );
  const ultima = new Map<string, { fecha: string; parada: ParadaV2 }>();
  for (const ruta of [...rutas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    for (const parada of ruta.paradas ?? []) {
      ultima.set(parada.pedidoId, { fecha: ruta.fecha, parada });
    }
  }

  return {
    pedidos: pedidos.map(({ estado, ...pedido }) => {
      const visita = ultima.get(pedido.id);
      const resultado: ResultadoVisita =
        estado === "entregado"
          ? "entregado"
          : estado === "rechazado"
            ? "no_entregado"
            : resultadoAlDia(visita?.parada.entrega);
      return {
        ...pedido,
        fecha: visita?.fecha ?? (resultado === "pendiente" ? hoy : fechaChile(pedido.cargadoEn)),
        llamada: visita?.parada.llamada ?? "pendiente",
        resultado,
        horaLlamada: visita?.parada.horaLlamada ?? null,
        horaResultado: visita?.parada.horaEntrega ?? null,
        aviso: avisoDe.get(pedido.id) ?? avisoVacio(),
      };
    }),
    rutas: rutas.map((vieja) => {
      const { paradas, geometria, generadaEn, cerradaEn, ...ruta } = vieja;
      delete ruta.versionDisponibilidad;
      return {
        ...ruta,
        orden: (paradas ?? []).map((p) => p.pedidoId),
        trazado: geometria ?? null,
        inicio: generadaEn,
        cierre: cerradaEn ?? null,
      };
    }),
  };
}
