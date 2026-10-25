import { UserRound } from "lucide-react";

// Avatar de persona (conductor): foto si existe, si no una silueta por defecto.
export function ConductorAvatar({
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
