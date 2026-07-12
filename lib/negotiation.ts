import { asRecord } from "@/lib/rehab";

export type NegotiationSide = "buyer" | "seller";
export type NegotiationResult = "pending" | "countered" | "rejected" | "accepted";

export type NegotiationRound = {
  id: string;
  date: string;
  side: NegotiationSide;
  price: number;
  result: NegotiationResult;
  notes: string;
};

export const negotiationResultLabel: Record<NegotiationResult, string> = {
  pending: "Pending",
  countered: "Countered",
  rejected: "Rejected",
  accepted: "Accepted",
};

function isNegotiationResult(value: unknown): value is NegotiationResult {
  return (
    value === "pending" ||
    value === "countered" ||
    value === "rejected" ||
    value === "accepted"
  );
}

export function parseNegotiationRounds(value: unknown): NegotiationRound[] {
  const rounds = asRecord(value).rounds;

  if (!Array.isArray(rounds)) return [];

  return rounds
    .map((entry): NegotiationRound | null => {
      const record = asRecord(entry);
      const price = Number(record.price);

      if (typeof record.id !== "string" || !Number.isFinite(price)) {
        return null;
      }

      return {
        id: record.id,
        date: typeof record.date === "string" ? record.date : "",
        side: record.side === "seller" ? "seller" : "buyer",
        price,
        result: isNegotiationResult(record.result) ? record.result : "pending",
        notes: typeof record.notes === "string" ? record.notes : "",
      };
    })
    .filter((round): round is NegotiationRound => round !== null);
}
