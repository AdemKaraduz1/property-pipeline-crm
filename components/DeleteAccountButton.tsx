"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteAccountButton() {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteAccount() {
    const firstConfirm = window.confirm(
      "Permanently delete your account and all saved property data? This cannot be undone.",
    );

    if (!firstConfirm) return;

    const typed = window.prompt(
      'Type "DELETE" to confirm permanent account deletion.',
    );

    if (typed !== "DELETE") {
      setMessage("Account deletion was cancelled.");
      return;
    }

    setIsDeleting(true);
    setMessage("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
      });
      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not delete account.");
      }

      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? error.message : "Could not delete account.",
      );
      setIsDeleting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={deleteAccount}
        disabled={isDeleting}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {isDeleting ? "Deleting account..." : "Delete Account"}
      </button>

      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
