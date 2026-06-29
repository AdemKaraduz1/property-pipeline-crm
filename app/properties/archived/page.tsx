import Link from "next/link";
import { Archive } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "No price";

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "No price";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numberValue);
}

function formatArchivedDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function ArchivedPropertiesPage() {
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
      asking_price,
      list_price,
      archived_at
    `,
    )
    .eq("user_id", user.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href="/pipeline"
          className="text-sm text-slate-600 hover:text-slate-950"
        >
          ← Back to Pipeline
        </Link>
      </div>

      <div className="mb-8 flex items-start gap-3">
        <span className="rounded-lg bg-slate-200 p-2.5 text-slate-700">
          <Archive className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-3xl font-bold text-slate-950">
            Archived Properties
          </h2>
          <p className="text-slate-600">
            Properties you have removed from the active pipeline.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-700">
            Could not load archived properties.
          </p>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
        </div>
      ) : properties && properties.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => {
            const price = property.asking_price ?? property.list_price;
            const location = [property.city, property.state, property.zip]
              .filter(Boolean)
              .join(", ");

            return (
              <Link
                key={property.id}
                href={`/properties/${property.id}`}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-950">
                      {property.address || "Untitled Property"}
                    </h3>
                    {location && (
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {location}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    Archived
                  </span>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">
                      {property.property_type || "No property type"}
                    </p>
                    <p className="mt-0.5 font-semibold text-slate-950">
                      {formatCurrency(price)}
                    </p>
                  </div>
                  <p className="text-right text-xs text-slate-500">
                    {formatArchivedDate(property.archived_at)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Archive
            className="mx-auto h-8 w-8 text-slate-400"
            aria-hidden="true"
          />
          <h3 className="mt-3 font-semibold text-slate-950">
            No archived properties
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Properties removed from your pipeline will appear here.
          </p>
        </div>
      )}
    </AppShell>
  );
}
