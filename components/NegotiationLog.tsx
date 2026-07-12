"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  parseNegotiationRounds,
  negotiationResultLabel,
  type NegotiationRound,
  type NegotiationResult,
} from "@/lib/negotiation";

type NegotiationLogProps = {
  propertyId: string;
  initialLog: unknown;
  startingOfferPrice: number | null;
  maximumPurchasePrice: number | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

const resultBadgeClass: Record<NegotiationResult, string> = {
  pending: "bg-slate-100 text-slate-700",
  countered: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
  accepted: "bg-green-100 text-green-800",
};

const selectClass =
  "mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm";

export function NegotiationLog({
  propertyId,
  initialLog,
  startingOfferPrice,
  maximumPurchasePrice,
}: NegotiationLogProps) {
  const [rounds, setRounds] = useState<NegotiationRound[]>(() =>
    parseNegotiationRounds(initialLog),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function persistRounds(nextRounds: NegotiationRound[]) {
    try {
      const response = await fetch(
        `/api/properties/${propertyId}/negotiation-log`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rounds: nextRounds }),
        },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not save negotiation log.");
      }

      setRounds(nextRounds);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save negotiation log.",
      );
      return false;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const price = Number(formData.get("price"));

    if (!Number.isFinite(price) || price <= 0) {
      setErrorMessage("Enter a valid price.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const round: NegotiationRound = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`,
      date: String(
        formData.get("date") || new Date().toISOString().slice(0, 10),
      ),
      side: formData.get("side") === "seller" ? "seller" : "buyer",
      price,
      result: (formData.get("result") as NegotiationResult) || "pending",
      notes: String(formData.get("notes") || ""),
    };

    const success = await persistRounds([...rounds, round]);

    if (success) {
      form.reset();
    }

    setIsSaving(false);
  }

  async function handleDelete(roundId: string) {
    const confirmed = window.confirm("Delete this round?");

    if (!confirmed) return;

    await persistRounds(rounds.filter((round) => round.id !== roundId));
  }

  function getPriceComparison(price: number) {
    if (maximumPurchasePrice !== null && price > maximumPurchasePrice) {
      return {
        text: `${formatCurrency(price - maximumPurchasePrice)} over your Maximum Price`,
        className: "text-red-700",
      };
    }

    if (startingOfferPrice !== null && price <= startingOfferPrice) {
      return {
        text: `${formatCurrency(startingOfferPrice - price)} at or below your Starting Offer`,
        className: "text-green-700",
      };
    }

    return {
      text: "Within your Starting Offer - Maximum Price range",
      className: "text-slate-500",
    };
  }

  const sortedRounds = [...rounds].reverse();
  const hasPriceContext =
    startingOfferPrice !== null || maximumPurchasePrice !== null;

  return (
    <details className="group mb-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="text-base font-semibold text-slate-950 sm:text-lg">
            Negotiation Log
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
            Track offers and counters against your Starting Offer and Maximum
            Price.
          </p>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-base leading-none text-slate-500 transition group-open:rotate-45">
          +
        </span>
      </summary>

      <div className="mt-4 border-t border-slate-100 pt-4">
        {errorMessage && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="negotiation-date">Date</Label>
              <Input
                id="negotiation-date"
                name="date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>

            <div>
              <Label htmlFor="negotiation-side">Proposed By</Label>
              <select
                id="negotiation-side"
                name="side"
                defaultValue="buyer"
                className={selectClass}
              >
                <option value="buyer">You (Buyer)</option>
                <option value="seller">Seller</option>
              </select>
            </div>

            <div>
              <Label htmlFor="negotiation-price">Price</Label>
              <Input
                id="negotiation-price"
                name="price"
                type="number"
                min="0"
                step="1000"
                placeholder="565000"
                required
              />
            </div>

            <div>
              <Label htmlFor="negotiation-result">Result</Label>
              <select
                id="negotiation-result"
                name="result"
                defaultValue="pending"
                className={selectClass}
              >
                <option value="pending">Pending</option>
                <option value="countered">Countered</option>
                <option value="rejected">Rejected</option>
                <option value="accepted">Accepted</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="negotiation-notes">Notes</Label>
              <Textarea
                id="negotiation-notes"
                name="notes"
                placeholder="Seller wants a 45-day close, asked to keep the washer/dryer..."
              />
            </div>
          </div>

          <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
            {isSaving ? "Saving Round..." : "Add Round"}
          </Button>
        </form>

        <div className="mt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Rounds
          </h4>

          {sortedRounds.length === 0 ? (
            <p className="text-sm text-slate-500">
              No offers logged yet. Add your opening offer above.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedRounds.map((round, index) => {
                const comparison = hasPriceContext
                  ? getPriceComparison(round.price)
                  : null;
                const roundNumber = sortedRounds.length - index;

                return (
                  <div
                    key={round.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Round {roundNumber} &middot;{" "}
                          {round.side === "buyer" ? "Your Offer" : "Seller Counter"}
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {formatCurrency(round.price)}
                        </p>
                        <p className="text-xs text-slate-500">{round.date}</p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${resultBadgeClass[round.result]}`}
                      >
                        {negotiationResultLabel[round.result]}
                      </span>
                    </div>

                    {comparison && (
                      <p className={`mt-2 text-xs font-medium ${comparison.className}`}>
                        {comparison.text}
                      </p>
                    )}

                    {round.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                        {round.notes}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(round.id)}
                      className="mt-2 text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
