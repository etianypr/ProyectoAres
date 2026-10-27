"use client";

// El único puente entre el teléfono y el servidor en el módulo del conductor. Todo
// lo demás (pedidos, direcciones, orden de la ruta, trazado) se queda en el
// teléfono y no sale nunca; por acá salen solo los eventos de actividad, que no
// llevan un dato personal: quién, qué día, qué pasó y a qué hora. Sin motivo:
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
  quitarDeCola,
  type ActividadPorEnviar,
} from "./almacen";

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

  const lote = cola.slice(0, MAX_POR_ENVIO);
  const supabase = createClient();

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
    return { enviados: lote.length - malos.length, pendientes: cola.length - lote.length };
  }

  // Recién ahora, con la confirmación del servidor en mano.
  await quitarDeCola(lote.map((e) => e.id));
  return { enviados: lote.length, pendientes: cola.length - lote.length };
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
        void leerRechazados().then((r) => setRechazados(r.length), () => {});
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

  return { pendientes, enviando, error, rechazados, intentar };
}
