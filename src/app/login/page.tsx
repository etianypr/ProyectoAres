import { LoginForm } from "./login-form";
import { Package } from "lucide-react";

// El nombre de la empresa NO se lee de la base acá: esta página es pública y
// consultarla antes de autenticar filtraría de quién es el sistema a cualquiera
// que abra la URL. Por eso el encabezado es genérico.
export const metadata = {
  title: "Iniciar sesión — Gestión de encomiendas",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-dark p-4">
      <div className="w-full max-w-sm">
        <div className="animate-slide-up mb-6 flex flex-col items-center text-center text-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Package className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">Gestión de encomiendas</h1>
          <p className="text-sm text-white/70">Reparto, jornadas y liquidación</p>
        </div>

        <div className="animate-scale-in rounded-2xl bg-card p-6 shadow-xl [animation-delay:80ms]">
          <h2 className="mb-4 text-lg font-semibold">Iniciar sesión</h2>
          <LoginForm redirectTo={redirectTo} />
        </div>

        <p className="animate-fade-in mt-4 text-center text-xs text-white/60 [animation-delay:200ms]">
          Acceso exclusivo para personal autorizado.
        </p>
      </div>
    </div>
  );
}
