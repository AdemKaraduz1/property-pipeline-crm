import Link from "next/link";

export default function SupportPage() {
  const supportEmail =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@propertypipelinecrm.app";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Property Pipeline CRM
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Support</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Get help with imports, deal analysis, walkthroughs, account access,
          or account deletion.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-base font-semibold text-slate-950">
              Contact
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Email support and include the property address or MLS number if
              your issue is property-specific.
            </p>
            <a
              href={`mailto:${supportEmail}`}
              className="mt-3 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {supportEmail}
            </a>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-base font-semibold text-slate-950">
              Deal Numbers
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Deal outputs are estimates for acquisition planning. Confirm
              taxes, financing, rents, insurance, code issues, and rehab costs
              with qualified professionals before making offers.
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
            <h2 className="text-base font-semibold text-slate-950">
              Account Deletion
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Sign in, open Settings, and choose Delete Account. If you cannot
              access your account, email support from the address tied to the
              account.
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/privacy"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Privacy Policy
          </Link>
          <Link
            href="/pipeline"
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Open App
          </Link>
        </div>
      </div>
    </main>
  );
}
