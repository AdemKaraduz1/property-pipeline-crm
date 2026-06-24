import { AppShell } from "@/components/AppShell";
import { NewPropertyForm } from "@/components/NewPropertyForm";

export default function NewPropertyPage() {
  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-950">Add Property</h2>
        <p className="text-slate-600">
          Add a new acquisition opportunity to your CRM.
        </p>
      </div>

      <NewPropertyForm />
    </AppShell>
  );
}