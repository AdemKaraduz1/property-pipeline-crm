"use client";

import { ReactNode, useEffect, useState } from "react";

type EditPropertyModalProps = {
  children: ReactNode;
};

export function EditPropertyModal({ children }: EditPropertyModalProps) {
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
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium leading-none text-slate-700 hover:bg-slate-50"
      >
        Edit Property
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-3 py-4 sm:items-center sm:px-4 sm:py-6">
          <div className="relative max-h-[92dvh] w-full max-w-6xl overscroll-contain overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:max-h-[90vh] sm:p-6">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:right-5 sm:top-5"
              aria-label="Close edit property form"
            >
              ×
            </button>

            {children}
          </div>
        </div>
      )}
    </>
  );
}
