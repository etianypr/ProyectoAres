"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Alerta } from "@/lib/vencimientos";

// Campana de notificaciones de la barra superior: alertas de vencimientos de
// documentos (flota y licencias), visibles desde cualquier página.
export function Notificaciones({ alertas }: { alertas: Alerta[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const hayVencidos = alertas.some((a) => a.estado === "vencido");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificaciones (${alertas.length})`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
      >
        <Bell className="h-4.5 w-4.5" />
        {alertas.length > 0 ? (
          <span
            className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              hayVencidos ? "bg-danger" : "bg-warn"
            }`}
          >
            {alertas.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Cierre al hacer clic fuera */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-scale-in absolute right-0 top-full z-30 mt-2 w-80 origin-top-right overflow-hidden rounded-[18px] border border-border bg-card shadow-card">
            <p className="border-b border-border px-4 py-3 text-sm font-semibold">
              Alertas de documentos
            </p>
            {alertas.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted">
                <CheckCircle2 className="h-4 w-4 text-ok" />
                Toda la documentación está al día.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {alertas.map((a, i) => (
                  <li key={`${a.refId}-${a.documento}-${i}`} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${a.estado === "vencido" ? "text-danger" : "text-warn"}`}
                      />
                      <span className="font-medium">{a.nombre}</span>
                      <span className="truncate text-muted">· {a.documento}</span>
                    </div>
                    <p
                      className={`mt-0.5 pl-6 text-xs font-medium ${a.estado === "vencido" ? "text-danger" : "text-warn"}`}
                    >
                      {a.estado === "vencido"
                        ? `Vencido hace ${Math.abs(a.dias)} día(s)`
                        : `Vence en ${a.dias} día(s)`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {/* Un solo link: acá el único documento que se vigila es la licencia
                del conductor. El link a la flota se fue con los vehículos, que
                los administraba el sistema del que salió este proyecto. */}
            <div className="flex gap-4 border-t border-border px-4 py-2.5">
              <Link
                href="/choferes"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-brand hover:underline"
              >
                Ver conductores
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
