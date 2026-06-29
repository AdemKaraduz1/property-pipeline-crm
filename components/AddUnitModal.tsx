"use client";

import { ReactNode, useEffect, useState } from "react";

type AddUnitModalProps = {
  children: ReactNode;
};

export function AddUnitModal({ children }: AddUnitModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="min-h-11 w-full rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
      >
        + Add Unit
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-4 sm:items-center sm:px-4 sm:py-6">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Add Unit
                </h2>
                <p className="text-sm text-slate-500">
                  Track rent, rehab, and condition by unit.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md px-2 text-2xl leading-none text-slate-400 hover:text-slate-700"
                aria-label="Close add unit form"
              >
                ×
              </button>
            </div>

            <div className="p-5">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
