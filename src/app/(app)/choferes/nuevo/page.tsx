import { PageHeader } from "@/components/page-header";
import { ChoferForm } from "../chofer-form";

export const metadata = { title: "Nuevo chofer" };

export default function NuevoChoferPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nuevo chofer" />
      <ChoferForm />
    </div>
  );
}
