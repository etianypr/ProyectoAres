// Lo que el teléfono guarda: una forma por store (ver ../idb.ts). Es el modelo
// local completo; los datos del receptor viven SOLO acá.

import type {
  Disponibilidad,
  EstadoAviso,
  TipoEvento,
} from "@/lib/encomiendas/catalogos";
import type { ReferenciaPaquete } from "@/lib/encomiendas/paquete";
import type { ProblemaGuardado } from "@/lib/encomiendas/problemas";
import type { ResultadoVisita, ResultadoLlamada } from "@/lib/encomiendas/estados";
import type { Coordenada, Trazado } from "@/lib/geo/coordenada";

/** Un paquete de UN día de trabajo, con su visita. Lo no entregado no pasa al
 *  día siguiente: se vuelve a cargar o escanear (spec 009). Por eso no hace
 *  falta una "parada" aparte: un pedido tiene a lo sumo una visita. */
export type Pedido = {
  /** UUIDv7 generado en el teléfono. */
  id: string;
  /** Día de trabajo, "YYYY-MM-DD" en hora de Chile. */
  fecha: string;
  nombre: string;
  telefono: string;
  direccion: string;
  /** null cuando la dirección no se pudo ubicar en el mapa: el pedido igual se
   *  guarda (el conductor puede corregirla), pero no puede entrar en una ruta. */
  lat: number | null;
  lng: number | null;
  notas: string | null;
  /** Qué contestó el receptor al aviso de WhatsApp. Es una dimensión APARTE del
   *  resultado del reparto: confirmar por WhatsApp y después no estar en la casa
   *  son dos hechos distintos, y mezclarlos es justo lo que el principio II de
   *  la constitución prohibe. */
  disponibilidad: Disponibilidad;
  /** El bloque que eligió el receptor, si eligió uno. Solo tiene valor cuando
   *  `disponibilidad` es "horario_indicado". */
  bloqueHorarioId: string | null;
  /** El aviso de WhatsApp de este pedido (ver Aviso). */
  aviso: Aviso;
  /** Resultado de llamar al receptor. */
  llamada: ResultadoLlamada;
  /** Cómo terminó la visita; "pendiente" mientras no se marca. Entregado o no
   *  entregado cierra el pedido del día. */
  resultado: ResultadoVisita;
  horaLlamada: string | null;
  horaResultado: string | null;
  /** ISO. Sirve para ordenar la lista. */
  cargadoEn: string;
  /** Orden de flete de Starken: dígitos sin separadores ni ceros a la
   *  izquierda, casi siempre 9 (sin regla de largo: spec 003, ofValida). Es lo que
   *  va impreso en la etiqueta: con ella se reconoce el paquete sin escribir nada
   *  en él. null = no se cargó (a mano es opcional; la 005 la lee del código). */
  of: string | null;
  /** Cómo es el paquete, para encontrarlo rápido en la camioneta. */
  referencia: ReferenciaPaquete | null;
  /** La foto del paquete en el store `fotos`, o null. */
  fotoId: string | null;
  /** Cuántos bultos tiene el envío (etiqueta "Bulto N° 001/002"); null = no se sabe. */
  bultos: number | null;
  /** Qué bultos ya se escanearon (sus números): el mismo escaneado dos veces no
   *  cuenta dos (spec 005). */
  bultosEscaneados: number[];
  /** true solo si la etiqueta dice POR PAGAR; null = no se leyó (por revisar). */
  porPagar: boolean | null;
  /** Lo que hay que cobrar; nunca se supone 0 (spec 005, FR-015). */
  montoPorPagar: number | null;
  /** Folio de la guía de la que salió. */
  folioGuia: string | null;
  /** De dónde salió el pedido: se cuenta en el resumen del día (sin datos). */
  origenCarga: OrigenCarga;
  /** Los ⚠ guardados (spec 022): la calle en varios lugares con sus opciones, la
   *  parada lejana, el horario que no alcanza, la etiqueta con otra dirección y el
   *  paquete que no estaba en la guía. Lo que se deduce del pedido (sin punto, sin
   *  OF) no se guarda: ver problemasDelPedido. Los pedidos de antes no lo tienen
   *  (alDia). */
  problemas: ProblemaGuardado[];
};

/** guia_foto: la foto de la guía leída en el teléfono, sin IA (spec 005). */
export type OrigenCarga = "guia_ia" | "guia_foto" | "guia_pegada" | "etiqueta" | "manual";

export type { ReferenciaPaquete };

/** Foto del paquete (store `fotos`). Solo en el teléfono: puede mostrar la
 *  etiqueta, que es dato personal. Se borra al cerrarse el pedido y con el día. */
export type Foto = {
  id: string;
  pedidoId: string;
  /** Día de trabajo: el cierre del día borra las suyas (spec 007). */
  fecha: string;
  /** JPEG reducido en el teléfono (lado mayor 1280 px). */
  blob: Blob;
};

/** La propuesta de ruta a la vista y todavía sin aceptar (store `propuestas`): si
 *  la app se cierra, al abrir vuelve sola sin armarla otra vez (dueño, 2026-11-09).
 *  La arma y la lee generar-ruta/propuesta-guardada.ts: las paradas van como id y
 *  punto, y el resto del pedido se completa con `pedidos` al leer. */
export type PropuestaGuardada = {
  /** "YYYY-MM-DD". Es la clave del store: una por día. */
  fecha: string;
  /** Los pendientes del día al guardarla (id, punto, bultos, horario): si
   *  cambió algo, la propuesta ya no vale. */
  firma: string;
  /** La propuesta sin los pedidos adentro (forma en propuesta-guardada.ts). */
  datos: unknown;
  guardadaEn: string;
};

export type Ruta = {
  /** "YYYY-MM-DD" en hora de Chile. Es la clave del store. */
  fecha: string;
  /** Ids de pedido en orden de visita: lo cerrado primero, después lo que falta.
   *  El resultado de cada visita vive en el pedido. */
  orden: string[];
  /** Trazado por calles, [lng, lat] por punto (formato GeoJSON). null si el
   *  servicio de rutas no respondió: el mapa queda con los puntos y sin línea. */
  trazado: Trazado | null;
  distanciaM: number | null;
  duracionS: number | null;
  /** Cuándo se generó la ruta por PRIMERA vez ese día: el comienzo de la
   *  día. Rehacer la ruta —porque entraron pedidos nuevos— no lo mueve, o
   *  el inicio del día iría corriéndose cada vez que el conductor agrega algo. */
  inicio: string;
  /** Cuándo se cerró la última parada. null = la ruta sigue en curso.
   *
   *  Es lo que hace que el servidor valore el día (ver 0032): mientras sea null
   *  el día está abierto y no se calcula plata. Se guarda acá y no solo en
   *  el servidor porque el cierre puede ocurrir sin señal, igual que todo lo
   *  demás en esta app. */
  cierre: string | null;
  /** Cuándo salió a repartir: tocó «Salir a repartir» o escaneó el último paquete
   *  de la guía (spec 027). Hasta entonces la cabecera de la hoja es «Cargar el
   *  auto» y no la parada 1. Se guarda —y no queda en la pantalla— porque Android
   *  recarga ARES al ir a Google Maps, y la cabecera no puede volver a «Cargar el
   *  auto» a mitad de camino. Opcional: las rutas guardadas antes no lo tienen.
   *  No sale del teléfono. */
  inicioReparto?: string | null;
  /** Qué quedó fuera o dudoso al armar esta ruta: pedidos sin ubicar, sin
   *  trazado, con un bloque horario que no se pudo respetar. Se guarda con la
   *  ruta —y no solo se muestra en la previsualización— porque el conductor las
   *  necesita en terreno, horas después de haber confirmado. */
  advertencias: string[];
  /** Cuántas propuestas se compararon para llegar a esta (1 a 3). Es lo que
   *  distingue "no había alternativa útil" de "el conductor eligió entre tres"
   *  cuando después hay que entender por qué salió este orden. */
  propuestasComparadas: number;
  /** De dónde salió la ruta, y adonde vuelve: la ruta es cerrada (terreno
   *  2026-10-28). Sumar un pedido tarde la usa para no dejarlo en la otra
   *  punta. Opcional: las rutas guardadas antes no la tienen. */
  partida?: Coordenada | null;
  /** Los tramos de `trazado`, uno por punto después del primero (spec 020): con
   *  ellos la app mide cuánto falta hasta la parada activa sin pedir otra ruta.
   *  Opcional: las rutas guardadas antes no los tienen (se mide en línea recta). */
  tramos?: TramoDelDia[] | null;
};

/** Un tramo de la línea del día: hasta qué pedido llega y dónde está en el
 *  trazado. `pedidoId` null = la vuelta a la central. */
export type TramoDelDia = {
  pedidoId: string | null;
  /** Índices en `Ruta.trazado`. */
  desde: number;
  hasta: number;
  metros: number;
  segundos: number;
};

/** Un día de trabajo en cifras. Es lo único que queda en el teléfono cuando el
 *  día se borra (spec 007): sin nombres, teléfonos, direcciones ni OF. Store
 *  `dias`, clave `fecha`. Mientras el día sigue en el teléfono se calcula de sus
 *  pedidos (ver resumirDia). */
export type ResumenDia = {
  fecha: string;
  /** Pedidos cargados ese día, en la ruta o fuera de ella. */
  asignados: number;
  /** Los que entraron en la ruta. */
  paradas: number;
  entregadas: number;
  /** Con el día abierto, los marcados "no entregado". Con el día cerrado, todo
   *  lo que no se entregó (vuelve a Starken): asignados − entregadas. */
  noEntregadas: number;
  /** Pedidos cuyo receptor contestó la llamada o respondió el aviso (spec 006).
   *  null en días guardados antes de contarlo. */
  contactados: number | null;
  /** Pedidos POR PAGAR del día (spec 005). */
  porPagar: number;
  /** Lo que hay que cobrar: la suma de los montos POR PAGAR, en pesos. */
  aCobrar: number;
  /** La parte de aCobrar de los pedidos ya entregados. */
  cobrado: number;
  /** Cuántos pedidos entraron de cada forma (guía con foto, pegada, a mano…). */
  porOrigen: Partial<Record<OrigenCarga, number>>;
  /** Cuándo empezó la ruta. Lo usa la sincronización del día con el servidor
   *  cuando la ruta ya se borró. */
  inicio: string | null;
  /** null = ese día quedó abierto. */
  cierre: string | null;
};

/** Evento esperando salir a encomienda_actividad. Los nombres son los del
 *  dominio local; la traducción a columnas se hace al enviarlo. */
export type ActividadPorEnviar = {
  /** UUIDv7: el MISMO id que va a la base, para que reenviar no duplique. */
  id: string;
  conductorId: string;
  fecha: string;
  tipo: TipoEvento;
  /** ISO. Cuándo ocurrió de verdad, que puede ser mucho antes de poder
   *  enviarlo. */
  hora: string;
  /** ISO. Hasta esa hora el evento NO sale, aunque haya señal: es la ventana en
   *  la que el conductor puede deshacer lo que acaba de marcar (ver
   *  deshacerResultado).
   *
   *  Se retiene en la cola y no en la pantalla porque un evento que solo existe
   *  en memoria se pierde si el teléfono se bloquea o se cierra la app en esos
   *  segundos: la parada quedaría cerrada en el teléfono y el servidor no se
   *  enteraría nunca. Acá, en cambio, la próxima apertura lo encuentra vencido y
   *  lo manda. */
  retenidoHasta?: string;
  /** El servidor lo rechazó mientras los demás pasaban (spec 017, E8): queda
   *  aparte para no trabar la cola y se muestra para avisarle a la oficina. */
  rechazado?: string;
};

/** El aviso de WhatsApp de un pedido: uno por pedido, y su estado dice en qué
 *  va (spec 011). El servidor guarda una copia temporal solo mientras espera la
 *  respuesta, porque la respuesta de Meta llega al servidor y el pedido vive acá
 *  (ver docs/WHATSAPP.md). */
export type Aviso = {
  /** Del MENSAJE, no de la resultado: "fallido" quiere decir que WhatsApp no lo
   *  pudo dejar, no que el receptor haya rechazado nada. */
  estado: EstadoAviso;
  /** Código opaco que viaja a Meta y vuelve con la respuesta. null hasta el
   *  primer envío. */
  codigo: string | null;
  /** wamid del aviso saliente. */
  mensajeId: string | null;
  /** ISO del último envío. */
  enviadoEn: string | null;
  /** Mostrable al conductor. */
  ultimoError: string | null;
  /** Cuántas veces se intentó mandar. Frena el reintento eterno de un número
   *  que no tiene WhatsApp. */
  intentos: number;
  /** Si ya se le mandó la lista de bloques horarios (segundo mensaje). */
  horariosEnviados: boolean;
  /** Ids de mensaje de respuesta ya aplicados: no se aplican dos veces. */
  respuestasAplicadas: string[];
};
