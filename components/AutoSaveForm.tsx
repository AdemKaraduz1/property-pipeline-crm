"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export type AutoSaveResult = {
  success: boolean;
  message?: string;
};

type AutoSaveAction = (formData: FormData) => Promise<AutoSaveResult>;

type AutoSaveFormProps = {
  action: AutoSaveAction;
  children?: ReactNode;
  className?: string;
  debounceMs?: number;
  draftKey: string;
  id?: string;
  statusClassName?: string;
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type DraftControl = {
  checked?: boolean;
  name: string;
  type: string;
  value: string;
};

function storeDraft(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Database autosave still works when local storage is unavailable.
  }
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The confirmed database save is still authoritative.
  }
}

function getDraftControls(form: HTMLFormElement): DraftControl[] {
  return Array.from(form.elements).flatMap((element) => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !element.name ||
      element instanceof HTMLInputElement && element.type === "hidden"
    ) {
      return [];
    }

    return [
      {
        checked:
          element instanceof HTMLInputElement &&
          (element.type === "checkbox" || element.type === "radio")
            ? element.checked
            : undefined,
        name: element.name,
        type:
          element instanceof HTMLInputElement ? element.type : element.tagName,
        value: element.value,
      },
    ];
  });
}

function restoreDraftControls(
  form: HTMLFormElement,
  controls: DraftControl[],
) {
  const availableElements = Array.from(form.elements).filter(
    (
      element,
    ): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      Boolean(element.name) &&
      !(element instanceof HTMLInputElement && element.type === "hidden"),
  );
  const usedIndexes = new Set<number>();

  for (const control of controls) {
    const matchingIndex = availableElements.findIndex(
      (element, index) =>
        !usedIndexes.has(index) &&
        element.name === control.name &&
        (element instanceof HTMLInputElement ? element.type : element.tagName) ===
          control.type,
    );

    if (matchingIndex < 0) continue;

    const element = availableElements[matchingIndex];
    usedIndexes.add(matchingIndex);
    element.value = control.value;

    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio")
    ) {
      element.checked = control.checked === true;
    }
  }
}

export function AutoSaveForm({
  action,
  children,
  className,
  debounceMs = 700,
  draftKey,
  id,
  statusClassName = "mt-3 text-right text-xs text-slate-500",
}: AutoSaveFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const lastSavedRef = useRef("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const formElement = formRef.current;
    if (!(formElement instanceof HTMLFormElement)) return;
    const activeForm: HTMLFormElement = formElement;

    async function save() {
      if (isSavingRef.current) {
        queuedSaveRef.current = true;
        return;
      }

      const formData = new FormData(activeForm);
      const serializedDraft = JSON.stringify(getDraftControls(activeForm));

      if (serializedDraft === lastSavedRef.current) {
        setStatus("saved");
        return;
      }

      isSavingRef.current = true;
      setStatus("saving");
      setErrorMessage("");

      try {
        const result = await action(formData);

        if (!result.success) {
          throw new Error(result.message || "Could not save changes.");
        }

        lastSavedRef.current = serializedDraft;
        const currentDraft = JSON.stringify(getDraftControls(activeForm));

        if (currentDraft === serializedDraft) {
          clearDraft(draftKey);
          setStatus("saved");
        } else {
          storeDraft(draftKey, currentDraft);
          setStatus("dirty");
        }
      } catch (error) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not save changes.",
        );
      } finally {
        isSavingRef.current = false;

        if (queuedSaveRef.current) {
          queuedSaveRef.current = false;
          void save();
        }
      }
    }

    function scheduleSave(delay = debounceMs) {
      setStatus("dirty");

      storeDraft(draftKey, JSON.stringify(getDraftControls(activeForm)));

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        void save();
      }, delay);
    }

    try {
      const storedDraft = window.localStorage.getItem(draftKey);

      if (storedDraft) {
        const controls = JSON.parse(storedDraft) as DraftControl[];
        restoreDraftControls(activeForm, controls);
        scheduleSave(100);
      } else {
        lastSavedRef.current = JSON.stringify(getDraftControls(activeForm));
      }
    } catch {
      lastSavedRef.current = JSON.stringify(getDraftControls(activeForm));
    }

    function handleFieldUpdate(event: Event) {
      const target = event.target;

      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement) &&
        target.form === activeForm
      ) {
        scheduleSave();
      }
    }

    function handleFocusOut(event: FocusEvent) {
      const target = event.target;

      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement) &&
        target.form === activeForm
      ) {
        scheduleSave(150);
      }
    }

    function handleSubmit(event: SubmitEvent) {
      event.preventDefault();

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      void save();
    }

    document.addEventListener("input", handleFieldUpdate);
    document.addEventListener("change", handleFieldUpdate);
    document.addEventListener("focusout", handleFocusOut);
    activeForm.addEventListener("submit", handleSubmit);

    return () => {
      document.removeEventListener("input", handleFieldUpdate);
      document.removeEventListener("change", handleFieldUpdate);
      document.removeEventListener("focusout", handleFocusOut);
      activeForm.removeEventListener("submit", handleSubmit);

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [action, debounceMs, draftKey]);

  const statusText =
    status === "dirty"
      ? "Unsaved changes"
      : status === "saving"
        ? "Saving..."
        : status === "saved"
          ? "Saved"
          : status === "error"
            ? errorMessage
            : "Autosave on";

  return (
    <form ref={formRef} id={id} className={className}>
      {children}
      <p
        className={`${statusClassName} ${
          status === "error" ? "text-red-600" : ""
        }`}
        role="status"
        aria-live="polite"
      >
        {statusText}
      </p>
    </form>
  );
}
