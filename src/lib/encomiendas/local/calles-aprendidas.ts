"use client";

// Las calles aprendidas entre el teléfono y Supabase (spec 044; dueño, 2026-11-20: «que cada
// corrección quede guardada para un aprendizaje de la aplicación», compartido). Cómo viene escrita
// una calle → cómo se llama, sin número de casa ni nada de una persona (aprendidas.ts dice qué no
// se aprende). Se aprende al confirmar una corrección (de la IA o a mano) y cuando Google confirma
// la puerta; se usa al ubicar, también sin conexión.
//
// En modo prueba se aprende y se usa en el teléfono, pero no se sube (nada va a la base: ver
// modo-prueba.ts). Lo que quede por subir sale cuando el modo prueba se apague.

import { createClient } from "@/lib/supabase/client";
import { aprenderCalle, calleEscritaDe, fijarAprendizaje, fijarCallesAprendidas } from "@/lib/geo/geocoding";
import { fundirCallesDelServidor, guardarCalleAprendida, leerCallesAprendidas, marcarCallesEnviadas } from "./almacen";
import { enModoPrueba } from "./modo-prueba";

/** Cada cuánto se trae la lista de Supabase (subir lo nuevo va en cada intento). */
const MS_ENTRE_DESCARGAS = 10 * 60 * 1000;
let ultimaDescarga = 0;
let enganchado = false;

async function refrescarMemoria(): Promise<void> {
  fijarCallesAprendidas(await leerCallesAprendidas());
}

/** Al abrir la app: lo aprendido a la memoria de ubicar, y quién guarda lo nuevo. Una vez. */
export async function prepararCallesAprendidas(): Promise<void> {
  if (enganchado) return;
  enganchado = true;
  fijarAprendizaje(async (escrita, oficial, fuente) => {
    await guardarCalleAprendida(escrita, oficial, fuente);
    void sincronizarCallesAprendidas();
  });
  await refrescarMemoria().catch(() => undefined);
}

/** Sube lo aprendido en este teléfono y trae lo de todos. Nunca lanza: sin conexión queda para el
 *  próximo intento (la cola de actividad lo llama cada minuto). */
export async function sincronizarCallesAprendidas(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const supabase = createClient();
    if (!enModoPrueba()) {
      const porEnviar = (await leerCallesAprendidas()).filter((c) => c.porEnviar);
      const enviadas: typeof porEnviar = [];
      for (const c of porEnviar) {
        const { error } = await supabase.rpc("encomienda_aprender_calle", { p_escrita: c.escrita, p_oficial: c.oficial, p_fuente: c.fuente });
        if (error) break;
        enviadas.push(c);
      }
      await marcarCallesEnviadas(enviadas);
    }
    if (Date.now() - ultimaDescarga >= MS_ENTRE_DESCARGAS) {
      const { data, error } = await supabase
        .from("encomienda_calles_aprendidas")
        .select("escrita, oficial, fuente, confirmaciones, actualizada_en");
      if (!error && data) {
        ultimaDescarga = Date.now();
        await fundirCallesDelServidor(
          data.map((f) => ({ escrita: f.escrita, oficial: f.oficial, fuente: f.fuente, confirmaciones: f.confirmaciones, actualizada: f.actualizada_en })),
        );
      }
    }
    await refrescarMemoria();
  } catch {
    // Sin conexión, sin sesión o sin la tabla (migración sin correr): no traba nada.
  }
}

/** El conductor confirmó una corrección: lo que decía → lo que quedó. Se aprende la calle (sin el
 *  número) si vale la pena (aprendidas.ts). Nunca lanza. */
export async function aprenderDeCorreccion(decia: string, quedo: string, fuente: "ia" | "conductor"): Promise<void> {
  try {
    const [escrita, oficial] = await Promise.all([calleEscritaDe(decia), calleEscritaDe(quedo)]);
    if (escrita && oficial) await aprenderCalle(escrita, oficial, fuente);
  } catch {
    // Aprender es un extra.
  }
}
