import Link from "next/link";

export default function PrivacyPage() {
  const supportEmail =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@propertypipelinecrm.app";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Property Pipeline CRM
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Last updated July 7, 2026
        </p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-950">
              Information You Add
            </h2>
            <p className="mt-1">
              Property Pipeline CRM stores the property, rent, expense, rehab,
              walkthrough, and deal-analysis information you enter or import so
              you can manage acquisition opportunities.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-950">
              Voice Walkthroughs
            </h2>
            <p className="mt-1">
              If you use voice narration, your browser asks for microphone
              access. Audio is sent for transcription and extraction so the app
              can organize your walkthrough notes. Avoid recording private
              conversations or personal information that is not needed for a
              property inspection.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-950">
              AI Processing
            </h2>
            <p className="mt-1">
              AI features may process deal notes, listing details, and
              walkthrough transcripts to summarize or organize property data.
              Outputs are planning aids and should be reviewed before relying
              on them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-950">
              Account Deletion
            </h2>
            <p className="mt-1">
              You can initiate account deletion from Settings. Deletion removes
              your account record and saved property data unless retention is
              legally required.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-950">
              Contact
            </h2>
            <p className="mt-1">
              For privacy or support questions, email{" "}
              <a
                href={`mailto:${supportEmail}`}
                className="font-semibold text-blue-700 underline underline-offset-2"
              >
                {supportEmail}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/support"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Support
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
