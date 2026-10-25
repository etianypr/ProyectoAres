"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VencimientoBadge } from "./_componentes/vencimiento-badge";
import { ConductorAvatar } from "@/components/ui/avatar";
import { ConductorPanel } from "./conductor-panel";
import type { Conductor } from "@/types/db";

export function ConductorAccordion({ conductores }: { conductores: Conductor[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Nombre</th>
          <th className="px-4 py-3 font-medium">RUT</th>
          <th className="px-4 py-3 font-medium">Teléfono</th>
          <th className="px-4 py-3 font-medium">Licencia</th>
          <th className="px-4 py-3 font-medium">Vencimiento</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {conductores.map((c) => {
          const open = openId === c.id;
          return (
            <Fragment key={c.id}>
              <tr
                onClick={() => setOpenId(open ? null : c.id)}
                className="cursor-pointer transition-colors hover:bg-brand-soft/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ConductorAvatar src={c.foto_url} name={c.nombre} size={32} />
                    <span className="font-semibold text-foreground">{c.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{c.rut ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{c.telefono ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {c.licencia_clase ? `${c.licencia_clase} ` : ""}
                  {c.licencia_numero ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <VencimientoBadge fecha={c.licencia_vencimiento} />
                </td>
                <td className="px-4 py-3">
                  {c.activo ? (
                    <Badge tone="green">Activo</Badge>
                  ) : (
                    <Badge tone="gray">Inactivo</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={7} className="bg-background px-4 py-5">
                    <div className="animate-expand">
                      <ConductorPanel conductor={c} />
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
