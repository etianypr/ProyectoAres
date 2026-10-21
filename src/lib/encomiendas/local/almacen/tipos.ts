// Lo que el teléfono guarda: una forma por store (ver ../idb.ts). Es el modelo
// local completo; los datos del receptor viven SOLO acá.

import type {
  Disponibilidad,
  EstadoAviso,
  TipoEvento,
} from "@/lib/encomiendas/catalogos";
import type { ResultadoVisita, ResultadoLlamada } from "@/lib/encomiendas/estados";
import type { Trazado } from "@/lib/geo/coordenada";

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
   *  guarda (el chofer puede corregirla), pero no puede entrar en una ruta. */
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
   *  el inicio del día iría corriéndose cada vez que el chofer agrega algo. */
  inicio: string;
  /** Cuándo se cerró la última parada. null = la ruta sigue en curso.
   *
   *  Es lo que hace que el servidor valore el día (ver 0032): mientras sea null
   *  el día está abierto y no se calcula plata. Se guarda acá y no solo en
   *  el servidor porque el cierre puede ocurrir sin señal, igual que todo lo
   *  demás en esta app. */
  cierre: string | null;
  /** Qué quedó fuera o dudoso al armar esta ruta: pedidos sin ubicar, sin
   *  trazado, con un bloque horario que no se pudo respetar. Se guarda con la
   *  ruta —y no solo se muestra en la previsualización— porque el chofer las
   *  necesita en terreno, horas después de haber confirmado. */
  advertencias: string[];
  /** Cuántas propuestas se compararon para llegar a esta (1 a 3). Es lo que
   *  distingue "no había alternativa útil" de "el chofer eligió entre tres"
   *  cuando después hay que entender por qué salió este orden. */
  propuestasComparadas: number;
};

/** Evento esperando salir a encomienda_actividad. Los nombres son los del
 *  dominio local; la traducción a columnas se hace al enviarlo. */
export type ActividadPorEnviar = {
  /** UUIDv7: el MISMO id que va a la base, para que reenviar no duplique. */
  id: string;
  choferId: string;
  fecha: string;
  tipo: TipoEvento;
  /** ISO. Cuándo ocurrió de verdad, que puede ser mucho antes de poder
   *  enviarlo. */
  hora: string;
  /** ISO. Hasta esa hora el evento NO sale, aunque haya señal: es la ventana en
   *  la que el chofer puede deshacer lo que acaba de marcar (ver
   *  deshacerResultado).
   *
   *  Se retiene en la cola y no en la pantalla porque un evento que solo existe
   *  en memoria se pierde si el teléfono se bloquea o se cierra la app en esos
   *  segundos: la parada quedaría cerrada en el teléfono y el servidor no se
   *  enteraría nunca. Acá, en cambio, la próxima apertura lo encuentra vencido y
   *  lo manda. */
  retenidoHasta?: string;
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
