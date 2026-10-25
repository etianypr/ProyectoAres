import { Modal } from "@/components/ui/modal";
import { ConductorForm } from "@/app/(app)/conductores/conductor-form";

export default function NuevoConductorModal() {
  return (
    <Modal titulo="Nuevo conductor">
      <ConductorForm />
    </Modal>
  );
}
