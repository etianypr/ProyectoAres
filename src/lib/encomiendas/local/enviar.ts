"use client";

// El único puente entre el teléfono y el servidor en el módulo del conductor. Todo
// lo demás (pedidos, direcciones, orden de la ruta, trazado) se queda en el
// teléfono y no sale nunca; por acá salen solo los eventos de actividad, que no
// llevan un dato personal: quién, qué día, qué pasó y a qué hora (y, si el
// conductor corrige un resultado, el borrado de ese evento por su id: spec 033,
// G5, almacen/correccion.ts). Sin motivo:
// se entregó o no (spec 012). La base cuenta por `tipo`: 'entrega' suma y
// 'omision' no.
//
// Trabajar sin señal no es un caso especial acá, es lo normal: marcar una
// entrega SIEMPRE escribe primero en el teléfono (ver almacen.marcarResultado) y
// el envío es un intento aparte que puede fallar y reintentarse cuantas veces
// haga falta. Reenviar no puede duplicar el conteo porque el id del evento se
// decidió en el teléfono y la base lo inserta con "no hacer nada si ya existe"
// (ver migración 0026).

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  apartarRechazado,
  leerCola,
  leerDiaGuardado,
  leerRechazados,
  leerResumenDia,
  leerRuta,
  MOTIVO_PLAZO,
  quitarCorreccion,
  quitarDeCola,
  type ActividadPorEnviar,
} from "./almacen";
import { enModoPrueba } from "./modo-prueba";

// Un tope por consulta para no armar un cuerpo enorme con una conexión mala:
// un día completo sin señal son ~60 eventos, así que en la práctica va
// todo junto y esto es solo un techo.
const MAX_POR_ENVIO = 100;

// Reintento periódico. "online" no alcanza: el caso común en la periferia de
// Arica no es quedarse sin red, es tener red que no llega a ningún lado — ahí
// el navegador se sigue creyendo conectado y el evento nunca dispara.
const MS_REINTENTO = 60_000;

function aFila(e: ActividadPorEnviar) {
  return {
    id: e.id,
    conductor_id: e.conductorId,
    fecha: e.fecha,
    tipo: e.tipo,
    hora: e.hora,
  };
}

export type ResultadoEnvioCola = {
  enviados: number;
  /** Lo que sigue en la cola después de este lote. */
  pendientes: number;
};

/** Manda el estado del día de trabajo: cuándo empezó la ruta y, si terminó,
 *  cuándo (0032). Es lo que decide si el servidor valora el día o lo deja en
 *  curso, así que va en cada intento de sincronización y no una sola vez.
 *
 *  No usa cola: es un upsert sobre (conductor, día), o sea que reenviar el
 *  mismo estado no hace nada. Con la cola de eventos hace falta porque cada
 *  evento es una fila distinta que hay que poder tachar de a una; acá hay un
 *  solo dato que siempre se puede volver a escribir entero. */
export async function sincronizarDiaTrabajo(conductorId: string, fecha: string): Promise<void> {
  // En modo prueba no sale nada (ver modo-prueba.ts).
  if (enModoPrueba()) return;
  // Si el día ya se borró (spec 007), el inicio y el cierre siguen en su resumen.
  const ruta = (await leerRuta(fecha)) ?? (await leerDiaGuardado(fecha));
  // Sin ruta generada no hay día que abrir. Un día que solo tiene llamadas
  // sueltas lo levanta el barrido nocturno del servidor.
  if (!ruta?.inicio) return;

  // Dos conteos sin datos personales para los indicadores del panel (spec 006).
  const resumen = await leerResumenDia(fecha);

  const supabase = createClient();
  const { error } = await supabase.from("encomienda_jornadas").upsert(
    {
      conductor_id: conductorId,
      fecha,
      inicio: ruta.inicio,
      cerrada_en: ruta.cierre,
      asignados: resumen?.asignados ?? null,
      contactados: resumen?.contactados ?? null,
    },
    { onConflict: "conductor_id,fecha" },
  );

  if (error) throw new Error(error.message);
}

/** Manda un lote de la cola. Si el servidor no responde, LANZA y la cola queda
 *  intacta: no se borra nada que no esté confirmado. */
export async function enviarActividadPendiente(): Promise<ResultadoEnvioCola> {
  const cola = await leerCola();
  if (cola.length === 0) return { enviados: 0, pendientes: 0 };
  // En modo prueba la cola se llena pero no se manda: al salir se borra.
  if (enModoPrueba()) return { enviados: 0, pendientes: cola.length };

  const lote = cola.slice(0, MAX_POR_ENVIO);
  const supabase = createClient();
  // Primero las altas y después las correcciones (spec 033, G5): una corrección
  // nunca comparte id con un alta de la cola (la reemplaza), así que el orden solo
  // cuida que un día sin señal llegue entero antes de restar.
  const altas = lote.filter((e) => !e.borrar);
  const enviados = (await subirAltas(supabase, altas)) + (await borrarCorregidos(supabase, lote.filter((e) => e.borrar)));
  return { enviados, pendientes: cola.length - lote.length };
}

type Cliente = ReturnType<typeof createClient>;

async function subirAltas(supabase: Cliente, lote: ActividadPorEnviar[]): Promise<number> {
  if (lote.length === 0) return 0;
  // ignoreDuplicates hace que PostgREST use "on conflict do nothing": si un
  // evento de este lote ya había llegado en un intento anterior que se cortó
  // antes de poder vaciar la cola, se ignora en silencio en vez de fallar.
  const subir = (eventos: ActividadPorEnviar[]) =>
    supabase.from("encomienda_actividad").upsert(eventos.map(aFila), { onConflict: "id", ignoreDuplicates: true });
  const { error } = await subir(lote);

  if (error) {
    // Sin código es la red: se reintenta todo más tarde. Con código, el servidor
    // rechazó algo y, como el lote es todo o nada, UN evento malo trababa a
    // todos para siempre (spec 017, E8). Se prueba de a uno: si algunos pasan,
    // los que no se apartan; si no pasa ninguno, el problema es de todos
    // (sesión, permisos) y se informa sin apartar nada.
    if (!error.code || lote.length === 1) throw new Error(error.message);
    const malos: ActividadPorEnviar[] = [];
    for (const evento of lote) {
      const r = await subir([evento]);
      if (r.error) malos.push(evento);
      else await quitarDeCola([evento.id]);
    }
    if (malos.length === lote.length) throw new Error(error.message);
    for (const evento of malos) await apartarRechazado(evento.id, error.message);
    return lote.length - malos.length;
  }

  // Recién ahora, con la confirmación del servidor en mano.
  await quitarDeCola(lote.map((e) => e.id));
  return lote.length;
}

/** Las correcciones (spec 033, G5): borra cada evento del servidor por su id. El
 *  delete de PostgREST no falla cuando la policy no deja borrar: devuelve 0 filas.
 *  Por eso se pide la fila borrada y, si no vuelve ninguna, se mira si el evento
 *  sigue allá: si sigue, pasó el plazo de 12 h (rechazo visible en «Tu día»); si
 *  no, ya estaba borrado o nunca llegó, y reenviar la corrección no hace nada. */
async function borrarCorregidos(supabase: Cliente, lote: ActividadPorEnviar[]): Promise<number> {
  let hechos = 0;
  for (const c of lote) {
    const borrado = await supabase.from("encomienda_actividad").delete().eq("id", c.id).select("id");
    if (borrado.error) {
      // Sin código es la red: queda en la cola para el próximo intento.
      if (!borrado.error.code) throw new Error(borrado.error.message);
      await apartarRechazado(c.id, borrado.error.message, true);
      continue;
    }
    if ((borrado.data ?? []).length === 0) {
      const sigue = await supabase.from("encomienda_actividad").select("id").eq("id", c.id).maybeSingle();
      if (sigue.error && !sigue.error.code) throw new Error(sigue.error.message);
      if (sigue.error || sigue.data) {
        await apartarRechazado(c.id, sigue.error?.message ?? MOTIVO_PLAZO, true);
        continue;
      }
    }
    await quitarCorreccion(c.id);
    hechos++;
  }
  return hechos;
}

export type EstadoEnvio = {
  /** Eventos todavía sin confirmar en el servidor. 0 = todo al día. La pantalla
   *  lo muestra: para el conductor es la diferencia entre "mi trabajo está
   *  registrado" y "lo tengo anotado pero nadie más lo sabe". */
  pendientes: number;
  enviando: boolean;
  /** Último fallo. No es una alarma: la cola reintenta sola. */
  error: string | null;
  /** Eventos que el servidor rechazó y quedaron aparte: hay que avisar. */
  rechazados: number;
  /** Correcciones que el servidor no dejó hacer (pasó el plazo de 12 h, spec 033
   *  G5): la entrega sigue contada allá. Se avisa aparte. */
  correccionesRechazadas: number;
  /** Fuerza un intento ahora. Hay que llamarlo después de cada marcarResultado /
   *  marcarLlamada para que el evento salga en el momento y no espere al
   *  siguiente reintento. */
  intentar: () => void;
};

// Mantiene la cola vaciándose sola: al montar, cuando vuelve la conexión,
// cuando el conductor regresa a la app y cada minuto mientras quede algo.
//
// `activo` es "esta pantalla es la de HOY". Importa más que antes: el día
// se manda con el estado que tiene el teléfono, así que sincronizar mirando un
// día viejo podría reabrir un día que el servidor ya cerró.
export function useEnvioActividad(
  activo: boolean,
  conductorId: string,
  fecha: string,
): EstadoEnvio {
  const [pendientes, setPendientes] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazados, setRechazados] = useState(0);
  const [correccionesRechazadas, setCorreccionesRechazadas] = useState(0);
  // Sin este candado, volver a la app con el reintento periódico ya corriendo
  // mandaría el mismo lote dos veces en paralelo.
  const enVueloRef = useRef(false);

  const intentar = useCallback(() => {
    if (enVueloRef.current) return;
    enVueloRef.current = true;
    setEnviando(true);

    void (async () => {
      try {
        // Se vacía por lotes hasta que no quede nada.
        let quedaron = 0;
        for (;;) {
          const { enviados, pendientes: restantes } = await enviarActividadPendiente();
          setPendientes(restantes);
          setError(null);
          quedaron = restantes;
          if (enviados === 0 || restantes === 0) break;
        }

        // DESPUÉS de los eventos, y SOLO si no quedó ninguno. Cerrar el día es
        // lo que hace que el servidor cuente el día, así que tiene que contar con
        // todo lo que el teléfono tenía guardado.
        //
        // Antes esto se mandaba siempre, aunque la cola hubiera quedado a medias
        // —el bucle corta también cuando un lote no entra entero—. El trigger
        // recalcula un día ya cerrado, así que el número terminaba bien; pero
        // mientras tanto el panel del jefe mostraba una liquidación corta, y eso
        // es lo que un conductor ve como plata que le faltan.
        //
        // Si quedó algo, el reintento del minuto siguiente vuelve a pasar por acá
        // y cierra entonces.
        if (quedaron === 0) await sincronizarDiaTrabajo(conductorId, fecha);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar la actividad.");
        // El contador tiene que seguir a la vista aunque el envío falle: es la
        // señal de que hay trabajo hecho que el servidor todavía no registró.
        try {
          setPendientes((await leerCola()).length);
        } catch {
          // Si tampoco se puede leer el teléfono, el error de arriba ya lo dice.
        }
      } finally {
        enVueloRef.current = false;
        setEnviando(false);
        void leerRechazados().then((r) => {
          setRechazados(r.filter((e) => !e.borrar).length);
          setCorreccionesRechazadas(r.filter((e) => e.borrar).length);
        }, () => {});
      }
    })();
  }, [conductorId, fecha]);

  useEffect(() => {
    if (!activo) return;
    intentar();

    const alVolver = () => intentar();
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    const reintento = setInterval(alVolver, MS_REINTENTO);

    return () => {
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(reintento);
    };
  }, [activo, intentar]);

  return { pendientes, enviando, error, rechazados, correccionesRechazadas, intentar };
}
