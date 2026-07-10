"use client";

import { useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";

type PropertySummaryActionsProps = {
  fileName: string;
  summary: string;
};

export function PropertySummaryActions({
  fileName,
  summary,
}: PropertySummaryActionsProps) {
  const [message, setMessage] = useState("");

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setMessage("Summary copied.");
    } catch {
      setMessage("Could not copy summary.");
    }
  }

  async function shareSummary() {
    if (!navigator.share) {
      await copySummary();
      return;
    }

    try {
      await navigator.share({
        title: "Property deal summary",
        text: summary,
      });
      setMessage("Summary shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Could not share summary.");
    }
  }

  function downloadSummary() {
    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName.endsWith(".txt") ? fileName : `${fileName}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Summary downloaded.");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={copySummary}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy
        </button>
        <button
          type="button"
          onClick={shareSummary}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share
        </button>
        <button
          type="button"
          onClick={downloadSummary}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Save
        </button>
      </div>

      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
