// Tipos del dominio (espejo del esquema en Supabase/Postgres).
//
// Este proyecto salió del sistema de gestión general de Transportes Pucarani, del
// que se quedó SOLO con encomiendas. Lo que quedó fuera —cotizaciones, viajes,
// facturas, taxis, flota, cobranzas, integración SII— no está "pendiente de
// portar": no es parte de este negocio. Si alguna vez hace falta facturar, se
// diseña de nuevo acá, no se copia de allá.
//
// De encomiendas también se fue una parte: encomienda_pedidos/rutas/paradas
// (nombre, teléfono y dirección de cada destinatario) vivían en la base y se
// retiraron a propósito — son datos personales de clientes del mandante que esta
// empresa no necesita custodiar (Ley 21.719). Hoy esos datos viven solo en el
// teléfono del conductor (IndexedDB, ver lib/encomiendas/local) y de la ruta
// llega al servidor únicamente el HECHO de que la entrega ocurrió:
// encomienda_actividad. De ahí sale el ingreso estimado y la liquidación.

import type {
  AccionWhatsApp,
  EstadoAviso,
  OrigenEvento,
  TipoEvento,
  TipoPago,
} from "@/lib/encomiendas/catalogos";

export type RolUsuario = "admin" | "operador" | "chofer";

export interface Perfil {
  id: string; // = auth.users.id
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Empresa {
  id: string;
  nombre: string;
  razon_social: string | null;
  rut: string | null;
  direccion: string | null;
  ciudad: string | null;
  giro: string | null;
  telefono: string | null;
  email: string | null;
  logo_url: string | null;
  representante: string | null;
  /** Ids de los bloques horarios que se le ofrecen al receptor por WhatsApp
   *  (FR-010). null = los seis por defecto, y no "ninguno": una empresa que
   *  nunca abrió esa pantalla tiene que ofrecer los seis del documento
   *  principal. Los tramos son constantes del código; acá se elige cuáles. */
  bloques_horarios_activos: string[] | null;
  created_at: string;
  updated_at: string;
}

/** El conductor. Se llama "chofer" en el código y en la base porque así se llama
 *  en la ley chilena (licencia de conducir clase A) y porque renombrarlo obligaba
 *  a tocar las cuatro tablas que lo referencian; en la interfaz dice "conductor". */
export interface Chofer {
  id: string;
  empresa_id: string;
  /** Cuenta de acceso del conductor (rol 'chofer'), si la tiene. Sin ella no
   *  puede entrar a /conductor, que es donde registra su día. */
  user_id: string | null;
  /** Correo con el que se invitó/vinculó su login (no viene de auth.users). */
  email: string | null;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  foto_url: string | null;
  licencia_numero: string | null;
  licencia_clase: string | null;
  licencia_vencimiento: string | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Actividad en terreno. Los datos del destinatario y el orden de la ruta viven
// en el teléfono del conductor: acá solo queda el hecho de que la acción
// ocurrió, que es lo único que la empresa necesita para el ingreso estimado y la
// liquidación.
// ----------------------------------------------------------------------------
// Tipo y origen son listas cerradas: viven en lib/encomiendas/catalogos.ts.

export interface Actividad {
  /** Generado en el TELÉFONO (UUIDv7), no en la base: es la clave de
   *  idempotencia que hace que reenviar un evento desde la cola offline no
   *  pueda contarlo dos veces. */
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  /** Día de trabajo en fecha local de Chile (hoyChile()), no derivada de la
   *  hora del servidor: una entrega de las 21:30 en Arica ya es del día
   *  siguiente en UTC y el pago se movería de día. */
  fecha: string;
  tipo: TipoEvento;
  /** Heredada (0003): el motivo de una no entrega. Desde la spec 012 nadie la
   *  escribe ni la lee; se borra con la spec 002 (T051). */
  motivo: string | null;
  /** Cuándo ocurrió según el teléfono — puede ser bastante anterior a
   *  created_at si se marcó sin señal. En las filas de origen 'manual' es de
   *  relleno (mediodía UTC del día cargado): nadie sabe la hora real. */
  hora: string;
  /** Cuándo llegó al servidor. */
  created_at: string;
  /** 'app' = lo envió el teléfono del conductor · 'manual' = lo cargó la
   *  oficina. Los dos cuentan igual para el pago. */
  origen: OrigenEvento;
}

// ----------------------------------------------------------------------------
// Coordinación de WhatsApp
// ----------------------------------------------------------------------------

/** Una fila TEMPORAL que existe solo para que la respuesta del receptor pueda
 *  volver al teléfono que la necesita.
 *
 *  Hace falta porque las dos puntas no se pueden hablar: el receptor contesta
 *  tocando un botón, eso llega a un webhook (o sea al servidor), y el pedido vive
 *  en el IndexedDB del teléfono. El servidor no tiene los pedidos, así que sin
 *  esta fila no sabría a cuál corresponde la respuesta ni a quién mandársela.
 *
 *  ES LA ÚNICA EXCEPCIÓN al principio de no custodiar datos de destinatarios, y
 *  está recortada hasta donde se pudo: no guarda nombre, teléfono, hash del
 *  teléfono, dirección, cuerpo de conversación ni orden de paradas. El nombre y
 *  el teléfono los manda el teléfono del conductor en el cuerpo del POST de
 *  envío, se usan para armar la llamada a Meta y no se persisten.
 *
 *  Se borra al cerrar el día, y como máximo 72 horas después de crearse si
 *  el día nunca se cierra. Ver la migración 0003 y la Decisión 7 de
 *  specs/001-asistencia-ruta-entrega/research.md. */
export interface Aviso {
  /** Aleatorio. Es lo único nuestro que Meta llega a ver: viaja dentro del
   *  payload del botón y vuelve con la respuesta. */
  correlation_id: string;
  empresa_id: string;
  chofer_id: string;
  /** El id que el TELÉFONO le puso al pedido (UUIDv7). No hay ninguna fila en
   *  toda la base que lo asocie a una persona. */
  pedido_id_local: string;
  /** Día de trabajo, para que el cierre del día borre las de ese día. */
  fecha: string;
  /** wamid del aviso saliente. Segunda vía para resolver una respuesta cuando
   *  el payload del botón no viene. */
  external_message_id: string | null;
  /** Del MENSAJE, no de la entrega: 'fallido' es que WhatsApp no lo pudo dejar,
   *  nunca que el receptor haya rechazado el pedido. */
  estado: EstadoAviso;
  /** Qué botón tocó. Tres valores fijos; si escribe texto libre no se guarda. */
  respuesta_accion: AccionWhatsApp | null;
  /** Id del bloque horario elegido ('08-10'). Configuración de la empresa. */
  respuesta_bloque_id: string | null;
  /** wamid de la RESPUESTA. Único en la base: es lo que hace idempotente al
   *  webhook cuando Meta reintenta el mismo evento. */
  respuesta_mensaje_id: string | null;
  respuesta_recibida_en: string | null;
  /** Cuándo el teléfono confirmó haberla escrito en IndexedDB. Mientras sea
   *  null, la respuesta vuelve a bajar en cada consulta. */
  aplicada_en: string | null;
  /** Tope duro de retención: created_at + 72 h. */
  expira_en: string;
  created_at: string;
}

/** La regla de pago del conductor. Hay UNA sola fila y se edita encima: no
 *  tiene historial ni vigencias.
 *
 *  Eso NO significa que cambiarla reescriba el pasado. Cada día guarda sus
 *  propias cifras en PagoDelDia apenas se registra, así que la regla solo
 *  decide lo que se registre de ahí en adelante. */
export interface ReglaDePago {
  id: string;
  empresa_id: string;
  tipo_pago: TipoPago;
  /** numeric en Postgres: PostgREST lo devuelve como string ("15.00"). */
  valor_pago: number;
  /** CLP que se estima que entra por cada entrega. Con tipo_pago 'porcentaje'
   *  entra también en la fórmula del sueldo. */
  valor_pedido: number;
  /** Fijo en CLP por día trabajado, aparte de lo que pague por pedido. */
  monto_dia: number;
  meta_entregas_dia: number | null;
  bono_monto: number | null;
  /** Cuándo se configuró por primera vez. */
  created_at: string;
  /** Desde cuándo rige lo que dice ahora. */
  updated_at: string;
}

/** Lo que el mandante (hoy Starken) liquidó DE VERDAD. Se contrasta contra el
 *  ingreso estimado del mismo rango para saber si valor_pedido está bien
 *  calibrado.
 *
 *  Una fila se imputa a un PERIODO de facturación o a un mes, nunca a los dos:
 *  lo que se carga hoy va por periodo —así es como llega la liquidación— y las
 *  filas heredadas del sistema anterior quedaron por (anio, mes) y se conservan
 *  como historial de solo lectura. La base garantiza que sea exactamente una de
 *  las dos cosas. */
export interface IngresoReal {
  id: string;
  empresa_id: string;
  /** El corte al que pertenece esta liquidación. null solo en las filas
   *  heredadas, cargadas por mes antes de que existieran los periodos. */
  periodo_id: string | null;
  /** null cuando la fila va por periodo. */
  anio: number | null;
  /** null cuando la fila va por periodo. */
  mes: number | null;
  monto: number;
  /** De dónde salió el número: nº de liquidación, si es parcial, etc. */
  nota: string | null;
  created_at: string;
  updated_at: string;
}

/** Una ruta de reparto: cuándo empezó y cuándo terminó.
 *
 *  Es el sobre del día. Mientras `cerrada_en` sea null el día está EN CURSO
 *  y el día no se valora: no hay fila en PagoDelDia y el panel no muestra
 *  plata. Al cerrarse —el conductor llega a la última parada, la oficina carga
 *  el día a mano, o el barrido nocturno la cierra— la base congela las cifras
 *  de una sola vez. */
export interface DiaTrabajo {
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  fecha: string;
  /** Cuándo se generó la ruta. null en días levantados desde la oficina. */
  inicio: string | null;
  /** Cuándo se cerró la última parada. null = sigue en curso. */
  cerrada_en: string | null;
  created_at: string;
}

/** Lo que valió un (conductor, día): ingreso estimado y desglose del pago.
 *
 *  Lo escribe la base sola —un trigger sobre encomienda_actividad— cada vez que
 *  cambia la actividad de ese día. Son las cifras DEFINITIVAS del día: nada las
 *  recalcula después, ni siquiera cambiar la regla de pago. Por eso no guarda
 *  regla_id: con una regla mutable apuntaría siempre a la misma fila y sus
 *  valores no serían los que se usaron acá. */
export interface PagoDelDia {
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  fecha: string;
  pedidos_entregados: number;
  pedidos_no_entregados: number;
  ingresos_totales: number;
  /** Por cantidad de pedidos entregados. */
  pago_base: number;
  /** Fijo por el día trabajado. */
  pago_dia: number;
  pago_bono: number;
  /** Columna generada: pago_base + pago_bono + pago_dia. */
  pago_total: number;
  /** Cuándo la base congeló estas cifras. */
  calculado_en: string;

  // La tarifa con la que se calculó ESTE día. Se copia de la regla la primera
  // vez que el día se congela y no cambia después, aunque la regla sí: es lo que
  // hace que sumarle una entrega a un día en curso no lo arrastre a una regla
  // que cambió hace diez minutos.
  regla_valor_pedido: number | null;
  regla_tipo_pago: TipoPago | null;
  /** numeric en Postgres: PostgREST lo devuelve como string ("15.00"). */
  regla_valor_pago: number | null;
  regla_monto_dia: number | null;
  regla_meta_entregas_dia: number | null;
  regla_bono_monto: number | null;
}

/** La tarifa congelada de un día (las columnas regla_* de PagoDelDia). */
export type TarifaDelDia = Pick<
  PagoDelDia,
  | "regla_valor_pedido"
  | "regla_tipo_pago"
  | "regla_valor_pago"
  | "regla_monto_dia"
  | "regla_meta_entregas_dia"
  | "regla_bono_monto"
>;

/** Un corte de facturación: de qué fecha a qué fecha.
 *
 *  Es distinto del periodo global de la app (lib/periodo.ts), que es un mes del
 *  calendario y vive en una cookie. Este lo dicta quien factura y puede empezar
 *  y terminar cualquier día.
 *
 *  No tiene nombre —se llama por sus fechas— ni color guardado: el color con el
 *  que se pinta sale de su posición en la lista, ver lib/encomiendas/periodos.ts.
 *  Dentro de una misma empresa dos periodos no pueden solaparse, y eso lo
 *  garantiza una restricción de exclusión en la base. */
export interface PeriodoFacturacion {
  id: string;
  empresa_id: string;
  /** Inclusive: el día `fecha_inicio` es parte del periodo. */
  fecha_inicio: string;
  /** Inclusive también: el día `fecha_fin` es el último del periodo. */
  fecha_fin: string;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Database: el esquema que lee supabase-js. Con esto cada .from() y .rpc() sabe
// sus columnas y sus argumentos, y las consultas no necesitan casts.
// ----------------------------------------------------------------------------

/** Las interfaces no tienen firma de índice y supabase-js la exige: el tipo
 *  mapeado es la misma forma, aceptada como Record. */
type Fila<T> = { [K in keyof T]: T[K] };

/** Clave foránea hacia choferes(id). El nombre es el que Postgres pone solo. */
type HaciaChofer<T extends string> = {
  foreignKeyName: `${T}_chofer_id_fkey`;
  columns: ["chofer_id"];
  isOneToOne: false;
  referencedRelation: "choferes";
  referencedColumns: ["id"];
};

type Tabla<T, Relaciones extends unknown[] = []> = {
  Row: Fila<T>;
  Insert: Partial<Fila<T>>;
  Update: Partial<Fila<T>>;
  Relationships: Relaciones;
};

export type Database = {
  public: {
    Tables: {
      perfiles: Tabla<Perfil>;
      empresa: Tabla<Empresa>;
      choferes: Tabla<Chofer>;
      encomienda_actividad: Tabla<Actividad, [HaciaChofer<"encomienda_actividad">]>;
      encomienda_jornadas: Tabla<DiaTrabajo, [HaciaChofer<"encomienda_jornadas">]>;
      encomienda_pagos: Tabla<PagoDelDia, [HaciaChofer<"encomienda_pagos">]>;
      encomienda_whatsapp_correlaciones: Tabla<
        Aviso,
        [HaciaChofer<"encomienda_whatsapp_correlaciones">]
      >;
      encomienda_reglas_pago: Tabla<ReglaDePago>;
      encomienda_ingresos_reales: Tabla<IngresoReal>;
      encomienda_periodos_facturacion: Tabla<PeriodoFacturacion>;
    };
    Views: { [_ in never]: never };
    Functions: {
      encomienda_repreciar_dia: {
        Args: { p_chofer_id: string; p_fecha: string };
        Returns: undefined;
      };
      encomienda_valorar_dia: {
        Args: {
          p_chofer_id: string;
          p_fecha: string;
          p_valor_pedido: number;
          p_tipo_pago: TipoPago;
          p_valor_pago: number;
          p_monto_dia?: number;
          p_meta_entregas_dia?: number | null;
          p_bono_monto?: number | null;
        };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
