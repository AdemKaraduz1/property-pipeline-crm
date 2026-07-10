import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { LogoutButton } from "@/components/LogoutButton";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supportEmail =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@propertypipelinecrm.app";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-slate-950">Settings</h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage your account, support links, and launch-ready privacy
            controls.
          </p>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h3 className="text-lg font-semibold text-slate-950">Account</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </p>
                <p className="mt-1 break-words text-sm font-semibold text-slate-950">
                  {user.email || "Not available"}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  User ID
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-950">
                  {user.id}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <LogoutButton />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h3 className="text-lg font-semibold text-slate-950">
              Support & Legal
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <a
                href={`mailto:${supportEmail}`}
                className="rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Contact Support
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  {supportEmail}
                </span>
              </a>
              <Link
                href="/support"
                className="rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Support Page
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Troubleshooting and contact info
                </span>
              </Link>
              <Link
                href="/privacy"
                className="rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Privacy Policy
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Data and AI processing notes
                </span>
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-red-200 bg-white p-4 shadow-sm sm:p-6">
            <h3 className="text-lg font-semibold text-red-800">
              Delete Account
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              This permanently deletes your login and saved property pipeline
              data from the app. Keep any deal summaries you need before
              continuing.
            </p>
            <div className="mt-4">
              <DeleteAccountButton />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
