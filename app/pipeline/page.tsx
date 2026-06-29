import Link from "next/link";
import { Archive } from "lucide-react";
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
      archived_at,
      property_tags (
        id,
        tag
      )
    `
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const { count: archivedPropertyCount } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("archived_at", "is", null);

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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Pipeline</h2>
          <p className="text-slate-600">
            Drag and drop properties to move them through your deal flow.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500 lg:hidden">
            Swipe sideways to move through pipeline stages.
          </p>
        </div>

        <Link
          href="/properties/new"
          className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add Property
        </Link>
      </div>

      <PipelineBoard properties={properties || []} />

      <Link
        href="/properties/archived"
        className="mt-6 flex max-w-sm items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 hover:shadow"
      >
        <span className="rounded-md bg-slate-100 p-2 text-slate-600">
          <Archive className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950">
            Archived properties
          </span>
          <span className="block text-xs text-slate-500">
            View properties removed from your pipeline
          </span>
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {archivedPropertyCount ?? 0}
        </span>
      </Link>
    </AppShell>
  );
}
