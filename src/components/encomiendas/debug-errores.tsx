"use client";

import { useEffect, useState } from "react";

// TEMPORAL — para diagnosticar el bug de la hoja deslizable en iPhone/Safari
// sin acceso al inspector remoto. Muestra cualquier error de JS directo en
// pantalla, en vez de solo en una consola que nadie puede ver ahí. Quitar
// una vez resuelto.
export function DebugErrores() {
  const [errores, setErrores] = useState<string[]>([]);

  useEffect(() => {
    function onError(e: ErrorEvent) {
      setErrores((prev) => [
        ...prev,
        `Error: ${e.message} — ${e.filename?.split("/").pop()}:${e.lineno}`,
      ]);
    }
    function onRejection(e: PromiseRejectionEvent) {
      setErrores((prev) => [...prev, `Promise rechazada: ${String(e.reason)}`]);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (errores.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "black",
        color: "#4ade80",
        fontSize: 11,
        lineHeight: 1.4,
        padding: 8,
        maxHeight: "40vh",
        overflowY: "auto",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
      }}
    >
      {errores.map((e, i) => (
        <div key={i}>{e}</div>
      ))}
    </div>
  );
}
