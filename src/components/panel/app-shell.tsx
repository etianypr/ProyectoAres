"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  UserRound,
  LogOut,
  Menu,
  X,
  CalendarDays,
  Package,
} from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { LogoDashund } from "@/components/marca/logo-dashund";
import { logout } from "@/lib/auth/acciones";
import { PeriodoSelector } from "@/components/panel/periodo-selector";
import { Notificaciones } from "@/components/panel/notificaciones";
import type { Alerta } from "@/lib/conductores/vencimientos";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Package;
  exact?: boolean;
};

// Dos secciones y nada más: el reparto (donde se trabaja todos los días) y los
// conductores (que se tocan cuando entra o sale alguien). No hay grupo
// "Dashboard" porque "/" redirige acá: el panel de encomiendas ES el inicio.
//
// Sin encabezados de grupo a propósito: con dos items, un título encima de cada
// uno pesaría más que los items mismos.
const grupos: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/encomiendas", label: "Encomiendas", icon: Package },
      { href: "/conductores", label: "Conductores", icon: UserRound },
    ],
  },
];

export function AppShell({
  children,
  userEmail,
  empresaNombre,
  periodoAnio,
  periodoMes,
  alertas,
}: {
  children: React.ReactNode;
  userEmail: string;
  empresaNombre: string;
  periodoAnio: number;
  periodoMes: number | null;
  alertas: Alerta[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* La marca de ARES, la misma del login (spec 042): antes, un ícono de caja y
          «Gestión interna». El nombre de la empresa sigue saliendo de Configuración. */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <LogoDashund className="h-7 w-16 shrink-0" />
        <div className="leading-tight">
          <div className="text-sm font-extrabold tracking-tight">ARES</div>
          <div className="text-xs text-white/60">{empresaNombre}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {grupos.map((grupo, gi) => (
          <div key={gi} className="space-y-1">
            {grupo.label ? (
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                {grupo.label}
              </p>
            ) : null}
            {grupo.items.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/10 font-semibold text-white"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/10 px-3 py-3">
        <Link
          href="/configuracion"
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            isActive("/configuracion")
              ? "bg-white/10 font-semibold text-white"
              : "text-white/60 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          <Settings className="h-4 w-4" />
          Configuración
        </Link>
        <div className="px-2 py-1 text-xs text-white/60 truncate" title={userEmail}>
          {userEmail}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar de escritorio: fijo; solo scrollea el contenido */}
      <aside className="hidden bg-foreground text-white lg:sticky lg:top-0 lg:block lg:h-screen">
        {SidebarContent}
      </aside>

      {/* Barra superior móvil */}
      <header className="flex items-center justify-between bg-foreground px-4 py-3 text-white lg:hidden">
        <div className="flex items-center gap-2">
          <LogoDashund className="h-5 w-12" />
          <span className="text-sm font-extrabold tracking-tight">ARES</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Drawer móvil */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-foreground text-white shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 text-white/70"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </div>
        </div>
      ) : null}

      <main className="min-w-0">
        {/* Barra de periodo global (siempre visible) */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2 text-xs text-muted">
            <CalendarDays className="h-4 w-4 text-brand" />
            <span className="hidden sm:inline">Periodo</span>
          </div>
          <div className="flex items-center gap-2">
            <Notificaciones alertas={alertas} />
            <PeriodoSelector anio={periodoAnio} mes={periodoMes} />
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
