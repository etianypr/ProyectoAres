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
   *  puede entrar a /conductor, que es donde registra su jornada. */
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

export const ROLES: Record<RolUsuario, string> = {
  admin: "Administrador",
  operador: "Operador",
  chofer: "Conductor",
};

// ----------------------------------------------------------------------------
// Actividad en terreno. Los datos del destinatario y el orden de la ruta viven
// en el teléfono del conductor: acá solo queda el hecho de que la acción
// ocurrió, que es lo único que la empresa necesita para el ingreso estimado y la
// liquidación.
// ----------------------------------------------------------------------------
export const ENCOMIENDA_ACTIVIDAD_TIPOS = {
  entrega: "Entregado",
  omision: "Omitido",
  llamada: "Llamada",
} as const;
export type EncomiendaActividadTipo = keyof typeof ENCOMIENDA_ACTIVIDAD_TIPOS;

// De dónde salió el evento. 'app' es el default en la base: la app del conductor
// no manda esta columna.
export const ENCOMIENDA_ACTIVIDAD_ORIGENES = {
  app: "App del conductor",
  manual: "Carga manual",
} as const;
export type EncomiendaActividadOrigen = keyof typeof ENCOMIENDA_ACTIVIDAD_ORIGENES;

export interface EncomiendaActividad {
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
  tipo: EncomiendaActividadTipo;
  /** Cuándo ocurrió según el teléfono — puede ser bastante anterior a
   *  created_at si se marcó sin señal. En las filas de origen 'manual' es de
   *  relleno (mediodía UTC del día cargado): nadie sabe la hora real. */
  hora: string;
  /** Cuándo llegó al servidor. */
  created_at: string;
  /** 'app' = lo envió el teléfono del conductor · 'manual' = lo cargó la
   *  oficina. Los dos cuentan igual para el pago. */
  origen: EncomiendaActividadOrigen;
}

export const ENCOMIENDA_TIPO_PAGO = {
  porcentaje: "% por pedido entregado",
  monto_fijo: "Monto fijo por pedido entregado",
} as const;
export type EncomiendaTipoPago = keyof typeof ENCOMIENDA_TIPO_PAGO;

/** La regla de pago del conductor. Hay UNA sola fila y se edita encima: no
 *  tiene historial ni vigencias.
 *
 *  Eso NO significa que cambiarla reescriba el pasado. Cada día guarda sus
 *  propias cifras en EncomiendaPago apenas se registra, así que la regla solo
 *  decide lo que se registre de ahí en adelante. */
export interface EncomiendaReglaPago {
  id: string;
  empresa_id: string;
  tipo_pago: EncomiendaTipoPago;
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
export interface EncomiendaIngresoReal {
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
 *  Es el sobre del día. Mientras `cerrada_en` sea null la jornada está EN CURSO
 *  y el día no se valora: no hay fila en EncomiendaPago y el panel no muestra
 *  plata. Al cerrarse —el conductor llega a la última parada, la oficina carga
 *  el día a mano, o el barrido nocturno la cierra— la base congela las cifras
 *  de una sola vez. */
export interface EncomiendaJornada {
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  fecha: string;
  /** Cuándo se generó la ruta. null en jornadas levantadas desde la oficina. */
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
export interface EncomiendaPago {
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
  regla_tipo_pago: EncomiendaTipoPago | null;
  /** numeric en Postgres: PostgREST lo devuelve como string ("15.00"). */
  regla_valor_pago: number | null;
  regla_monto_dia: number | null;
  regla_meta_entregas_dia: number | null;
  regla_bono_monto: number | null;
}

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
export interface EncomiendaPeriodoFacturacion {
  id: string;
  empresa_id: string;
  /** Inclusive: el día `fecha_inicio` es parte del periodo. */
  fecha_inicio: string;
  /** Inclusive también: el día `fecha_fin` es el último del periodo. */
  fecha_fin: string;
  created_at: string;
  updated_at: string;
}
