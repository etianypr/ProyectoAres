import { PageHeader } from "@/components/page-header";
import { ChoferForm } from "../chofer-form";

export const metadata = { title: "Nuevo conductor" };

export default function NuevoChoferPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nuevo conductor" />
      <ChoferForm />
    </div>
  );
}
