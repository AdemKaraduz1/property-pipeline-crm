import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PipelineBoard } from "@/components/PipelineBoard";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PipelinePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: properties, error } = await supabase
    .from("properties")
    .select(
      `
      id,
      address,
      city,
      state,
      zip,
      property_type,
      status,
      asking_price,
      list_price,
      condition,
      created_at,
      property_tags (
        id,
        tag
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <AppShell>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-700">Could not load pipeline.</p>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Pipeline</h2>
          <p className="text-slate-600">
            Drag and drop properties to move them through your deal flow.
          </p>
        </div>

        <Link
          href="/properties/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add Property
        </Link>
      </div>

      <PipelineBoard properties={properties || []} />
    </AppShell>
  );
}