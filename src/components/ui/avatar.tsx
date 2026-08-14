import { UserRound } from "lucide-react";

function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Paleta estable de colores para los avatares de iniciales (estilo Google).
const PALETA = [
  "#0f766e",
  "#1d4e89",
  "#a8556a",
  "#7c6f3e",
  "#5b3aa8",
  "#1f7a4d",
  "#a8623e",
  "#3a6ea8",
];

function colorDe(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

// Avatar con iniciales sobre color sólido (clientes / empresas).
export function InitialsAvatar({
  name,
  size = 40,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        background: colorDe(name),
        fontSize: Math.round(size * 0.4),
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      aria-hidden
    >
      {iniciales(name)}
    </span>
  );
}

// Avatar de persona (chofer): foto si existe, si no una silueta por defecto.
export function ChoferAvatar({
  src,
  name,
  size = 40,
}: {
  src?: string | null;
  name?: string;
  size?: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Foto del conductor"}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-border/60 text-muted/70"
      aria-hidden
    >
      <UserRound style={{ width: Math.round(size * 0.58), height: Math.round(size * 0.58) }} />
    </span>
  );
}
