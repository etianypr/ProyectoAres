"use client";

// Llamar desde la APK y saber solo si el cliente contestó (spec 015, US2).
//
// Al tocar "Llamar" se guarda qué pedido se llamó y cuándo. Cuando la app vuelve a
// primer plano —colgó la llamada— se lee el registro de llamadas del teléfono y se
// marca "contestó" o "no contestó" sin preguntarle nada al conductor. Si no se
// puede saber (sin permiso, o Android todavía no escribió la llamada), la pantalla
// pregunta como siempre.
//
// Fuera de la APK no hace nada distinto: `llamar` abre el marcador.

import { useCallback, useEffect, useRef, useState } from "react";
import { alIrAlFondo, alVolverAPrimerPlano, esApp } from "@/lib/nativo/entorno";
import { llamadasDesde, llamar as llamarNumero } from "@/lib/nativo/telefono";
import { MS_TOLERANCIA, resultadoDeLlamada, type ResultadoDetectado } from "@/lib/nativo/llamada";

// Android escribe la llamada en el registro al colgar, y a veces tarda un poco.
const INTENTOS = 4;
const MS_ENTRE_INTENTOS = 800;
// Una llamada que nunca se resolvió (la app quedó en segundo plano mucho rato) se
// olvida: no puede marcar un resultado media hora después.
const MS_VIGENCIA = 30 * 60_000;
// Dentro de este plazo, otro "Llamar" al mismo pedido es el mismo toque repetido.
const MS_DOBLE_TOQUE = 5_000;

type LlamadaEnCurso = { pedidoId: string; numero: string; desdeMs: number };

export type LlamadaDetectada = { pedidoId: string; resultado: ResultadoDetectado; n: number };

type Opciones = {
  /** Escribe el resultado en el pedido (el mismo `marcarLlamada` de los botones). */
  marcar: (pedidoId: string, resultado: ResultadoDetectado) => Promise<void>;
  /** No se pudo saber: la pantalla tiene que preguntar "¿Contestó?". */
  alNoSaber: (pedidoId: string) => void;
};

export function useLlamadaNativa({ marcar, alNoSaber }: Opciones) {
  const enCurso = useRef<LlamadaEnCurso | null>(null);
  const [detectada, setDetectada] = useState<LlamadaDetectada | null>(null);
  // Las funciones de la pantalla cambian en cada render; el efecto de abajo no
  // tiene que volver a suscribirse por eso.
  const opciones = useRef({ marcar, alNoSaber });
  useEffect(() => {
    opciones.current = { marcar, alNoSaber };
  });

  /** Llama al cliente. "directa" = salió desde la APK y el resultado llega solo;
   *  "marcador" = se abrió el marcador y hay que preguntar como siempre. */
  const llamar = useCallback(async (pedidoId: string, numero: string) => {
    // Un segundo toque mientras la llamada sale (doble toque, o la pantalla que
    // tarda en pasar al marcador) no vuelve a llamar: correría la hora de inicio y
    // la llamada de verdad quedaría fuera de la búsqueda en el registro.
    const previa = enCurso.current;
    if (previa?.pedidoId === pedidoId && Date.now() - previa.desdeMs < MS_DOBLE_TOQUE) return "directa";
    const desdeMs = Date.now();
    const via = await llamarNumero(numero);
    enCurso.current = via === "directa" ? { pedidoId, numero, desdeMs } : null;
    return via;
  }, []);

  // Cada paso a segundo plano abre una "vuelta" nueva. Al lanzar la llamada,
  // Android devuelve la app al frente un instante antes de mostrar la pantalla de
  // llamada (medido en un vivo con Android 15: 0,4 s). Si la app se va de nuevo
  // al fondo mientras busca en el registro, era ese rebote: no se pregunta nada y
  // se espera la vuelta de verdad, al colgar.
  const vuelta = useRef(0);
  useEffect(() => {
    if (!esApp()) return;
    return alIrAlFondo(() => {
      vuelta.current += 1;
    });
  }, []);

  useEffect(() => {
    if (!esApp()) return;
    return alVolverAPrimerPlano(() => {
      const llamada = enCurso.current;
      if (!llamada) return;
      const estaVuelta = vuelta.current;
      if (Date.now() - llamada.desdeMs > MS_VIGENCIA) {
        enCurso.current = null;
        return;
      }
      void (async () => {
        for (let intento = 0; intento < INTENTOS; intento++) {
          if (vuelta.current !== estaVuelta) return;
          const entradas = await llamadasDesde(llamada.numero, llamada.desdeMs - MS_TOLERANCIA);
          const resultado = resultadoDeLlamada(entradas, llamada.desdeMs);
          if (resultado) {
            enCurso.current = null;
            await opciones.current.marcar(llamada.pedidoId, resultado);
            setDetectada((previa) => ({ pedidoId: llamada.pedidoId, resultado, n: (previa?.n ?? 0) + 1 }));
            return;
          }
          // Sin permiso no va a aparecer nada: no vale la pena esperar.
          if (entradas === null) break;
          await new Promise((listo) => setTimeout(listo, MS_ENTRE_INTENTOS));
        }
        if (vuelta.current !== estaVuelta) return;
        enCurso.current = null;
        opciones.current.alNoSaber(llamada.pedidoId);
      })();
    });
  }, []);

  const olvidarDetectada = useCallback(() => setDetectada(null), []);

  return { llamar, detectada, olvidarDetectada };
}
