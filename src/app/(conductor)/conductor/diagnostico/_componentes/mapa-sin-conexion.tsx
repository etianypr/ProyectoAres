"use client";

// El mapa de Arica guardado en el dispositivo (spec 047): cuánto hay y bajarlo a
// mano. La pantalla del día lo baja sola una vez al día con conexión y ruta.

import { useEffect, useState } from "react";
import { descargarMapa, mapaDescargadoEl } from "@/lib/geo/mapa-guardado/descarga";
import { estadoMapa } from "@/lib/geo/mapa-guardado/protocolo";

const mb = (bytes: number) => (bytes / 1_048_576).toLocaleString("es-CL", { maximumFractionDigits: 1 });

export function MapaSinConexion() {
  const [estado, setEstado] = useState<{ archivos: number; bytes: number } | null>(null);
  const [el, setEl] = useState<string | null>(null);
  const [avance, setAvance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leer = async () => {
    setEstado(await estadoMapa());
    setEl(mapaDescargadoEl());
  };
  useEffect(() => {
    void estadoMapa().then((e) => {
      setEstado(e);
      setEl(mapaDescargadoEl());
    });
  }, []);

  async function descargar() {
    setError(null);
    setAvance("Descargando…");
    try {
      const r = await descargarMapa((hechos, total) => setAvance(`${hechos} de ${total}`));
      if (r.fallidas > 0) setError(`${r.fallidas} archivos no se descargaron. Vuelve a intentarlo con conexión.`);
    } catch {
      setError("No se pudo descargar el mapa. Revisa la conexión.");
    } finally {
      setAvance(null);
      await leer();
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted">
        Mapa sin conexión:{" "}
        {estado == null ? (
          "no disponible en este navegador"
        ) : (
          <>
            <span className="font-mono">{estado.archivos}</span> archivos · <span className="font-mono">{mb(estado.bytes)}</span> MB
            {el ? <>, descargado el <span className="font-mono">{el}</span></> : ", sin descargar"}.
          </>
        )}
      </p>
      <button
        type="button"
        disabled={avance != null}
        onClick={() => void descargar()}
        className="h-11 w-full rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-60"
      >
        {avance ?? "Descargar mapa de Arica"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
