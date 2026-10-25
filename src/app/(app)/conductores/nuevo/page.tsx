import { PageHeader } from "@/components/panel/page-header";
import { ConductorForm } from "../conductor-form";

export const metadata = { title: "Nuevo conductor" };

export default function NuevoConductorPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nuevo conductor" />
      <ConductorForm />
    </div>
  );
}
