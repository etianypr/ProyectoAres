import { LoginForm } from "./login-form";
import { LogoDashund } from "@/components/marca/logo-dashund";

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
    // El crema y el logo de Dashund, la empresa que desarrolla ARES (2026-10-28).
    // No dice de qué empresa es el sistema: eso sigue sin leerse antes de entrar.
    <div className="flex min-h-screen items-center justify-center bg-[#f4f0ec] p-4 text-[#221a15]">
      <div className="w-full max-w-sm">
        <div className="animate-slide-up mb-6 flex flex-col items-center text-center">
          <LogoDashund className="mb-3 h-20 w-20" titulo="" />
          <h1 className="text-2xl font-extrabold tracking-tight">ARES</h1>
          <p className="text-sm text-[#6b5f57]">Gestión de encomiendas · por Dashund</p>
        </div>

        <div className="animate-scale-in rounded-2xl bg-card p-6 shadow-xl [animation-delay:80ms]">
          <h2 className="mb-4 text-lg font-semibold">Iniciar sesión</h2>
          <LoginForm redirectTo={redirectTo} />
        </div>

        <p className="animate-fade-in mt-4 text-center text-xs text-[#6b5f57] [animation-delay:200ms]">
          Acceso exclusivo para personal autorizado.
        </p>
      </div>
    </div>
  );
}
