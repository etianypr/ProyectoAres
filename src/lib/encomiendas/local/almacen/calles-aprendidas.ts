// Las calles aprendidas en el teléfono (store `callesAprendidas`, v8; spec 044). Sin datos de
// nadie: no se borran con el día. Las sube y las trae de Supabase local/calles-aprendidas.ts.

import { STORES, escribir, leerTodos, leerUno } from "../idb";
import type { CalleAprendida } from "./tipos";

export async function leerCallesAprendidas(): Promise<CalleAprendida[]> {
  return leerTodos(STORES.callesAprendidas);
}

/** Guarda lo aprendido en el teléfono, por subir. La misma oficial suma una confirmación; otra la
 *  reemplaza, salvo que la nueva sea de Google y la que había la confirmó una persona (como en
 *  Supabase, `encomienda_aprender_calle`). */
export async function guardarCalleAprendida(escrita: string, oficial: string, fuente: CalleAprendida["fuente"]): Promise<void> {
  const antes = await leerUno(STORES.callesAprendidas, escrita);
  if (antes && antes.oficial !== oficial && fuente === "google" && antes.fuente !== "google") return;
  const misma = antes?.oficial === oficial;
  const fila: CalleAprendida = {
    escrita,
    oficial,
    fuente: misma && antes ? antes.fuente : fuente,
    confirmaciones: misma && antes ? antes.confirmaciones + 1 : 1,
    actualizada: new Date().toISOString(),
    porEnviar: true,
  };
  await escribir([STORES.callesAprendidas], ({ guardar }) => guardar(STORES.callesAprendidas, fila));
}

/** Ya subidas: no se vuelven a mandar (si no cambiaron mientras tanto). */
export async function marcarCallesEnviadas(enviadas: Pick<CalleAprendida, "escrita" | "oficial">[]): Promise<void> {
  if (enviadas.length === 0) return;
  await escribir([STORES.callesAprendidas], ({ actualizar }) => {
    for (const e of enviadas) {
      actualizar(STORES.callesAprendidas, e.escrita, (fila) => (fila.oficial === e.oficial ? { ...fila, porEnviar: false } : fila));
    }
  });
}

/** Lo que trae Supabase (de todos los teléfonos). Lo que este teléfono aprendió y todavía no subió
 *  no se pisa. */
export async function fundirCallesDelServidor(filas: Omit<CalleAprendida, "porEnviar">[]): Promise<void> {
  const locales = new Map((await leerCallesAprendidas()).map((c) => [c.escrita, c]));
  await escribir([STORES.callesAprendidas], ({ guardar }) => {
    for (const f of filas) {
      if (locales.get(f.escrita)?.porEnviar) continue;
      guardar(STORES.callesAprendidas, { ...f, porEnviar: false });
    }
  });
}
