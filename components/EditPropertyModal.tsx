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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="relative max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-5 top-5 rounded-md px-2 text-2xl leading-none text-slate-400 hover:text-slate-700"
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
