"use client";

/* eslint-disable @next/next/no-img-element */

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ImageIcon,
  LoaderCircle,
  Mic,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  COMMON_REHAB_ITEMS,
  InspectionItem,
  WalkthroughData,
  normalizeInspectionItem,
} from "@/lib/rehab";

type WalkthroughUnit = {
  id: string;
  label: string;
  bedrooms: number;
  fullBaths: number;
  halfBaths: number;
};

type PropertyWalkthroughProps = {
  propertyId: string;
  address: string;
  units: WalkthroughUnit[];
  initialData: WalkthroughData;
};

type WalkthroughStep = {
  key: string;
  scope: "common" | "unit";
  itemId: string;
  label: string;
  description: string;
  unitId?: string;
  unitLabel?: string;
};

type WalkthroughSection = {
  key: string;
  label: string;
  stepIndex: number;
};

type VoiceNoteStatus = "idle" | "recording" | "processing";
type VoiceNoteScope = "step" | "section";
type WalkthroughMode = "fast" | "detailed";

type VoiceNoteSuggestion = {
  transcript: string;
  needsRehab: boolean | null;
  estimatedCost: number | null;
  notes: string;
  warning?: string | null;
};

type SectionVoiceSuggestion = {
  stepKey: string;
  stepLabel: string;
  needsRehab: boolean | null;
  estimatedCost: number | null;
  notes: string;
};

type WalkthroughPhoto = {
  id: string;
  url: string | null;
  fileName: string;
  contentType: string;
  size: number;
  stepKey: string | null;
  stepLabel: string | null;
  sectionKey: string | null;
  sectionLabel: string | null;
  createdAt: string;
};

type PhotoStatus = "idle" | "loading" | "uploading" | "deleting";
type PhotoFilter = "section" | "all";

function buildRoomSteps(unit: WalkthroughUnit): WalkthroughStep[] {
  const rooms: Array<{ id: string; label: string }> = [
    { id: "entry_hall", label: "Entry / Hall" },
    { id: "living_room", label: "Living Room" },
    { id: "dining_room", label: "Dining Room" },
    { id: "kitchen", label: "Kitchen" },
  ];

  for (let index = 1; index <= unit.bedrooms; index += 1) {
    rooms.push({ id: `bedroom_${index}`, label: `Bedroom ${index}` });
  }

  for (let index = 1; index <= unit.fullBaths; index += 1) {
    rooms.push({ id: `bathroom_${index}`, label: `Bathroom ${index}` });
  }

  for (let index = 1; index <= unit.halfBaths; index += 1) {
    rooms.push({ id: `half_bath_${index}`, label: `Half Bath ${index}` });
  }

  rooms.push({ id: "other", label: "Other / Final Unit Notes" });

  return rooms.map((room) => ({
    key: `unit:${unit.id}:${room.id}`,
    scope: "unit",
    itemId: room.id,
    label: room.label,
    description: `Inspect ${room.label.toLowerCase()} condition, finishes, fixtures, and needed work.`,
    unitId: unit.id,
    unitLabel: unit.label,
  }));
}

export function PropertyWalkthrough({
  propertyId,
  address,
  units,
  initialData,
}: PropertyWalkthroughProps) {
  const router = useRouter();
  const [walkthrough, setWalkthrough] = useState<WalkthroughData>(initialData);
  const [currentStepIndex, setCurrentStepIndex] = useState(
    initialData.currentStep || 0,
  );
  const [walkthroughMode, setWalkthroughMode] =
    useState<WalkthroughMode>("fast");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceNoteStatus>("idle");
  const [voiceScope, setVoiceScope] = useState<VoiceNoteScope>("step");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const [hasAcknowledgedVoiceUse, setHasAcknowledgedVoiceUse] =
    useState(false);
  const [voiceSuggestion, setVoiceSuggestion] =
    useState<VoiceNoteSuggestion | null>(null);
  const [sectionVoiceSuggestions, setSectionVoiceSuggestions] = useState<
    SectionVoiceSuggestion[]
  >([]);
  const [sectionVoiceTranscript, setSectionVoiceTranscript] = useState("");
  const [sectionVoiceWarning, setSectionVoiceWarning] = useState<string | null>(
    null,
  );
  const [photos, setPhotos] = useState<WalkthroughPhoto[]>([]);
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>("idle");
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>("section");
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoPreview, setPhotoPreview] = useState<WalkthroughPhoto | null>(
    null,
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const steps = useMemo<WalkthroughStep[]>(
    () => [
      ...COMMON_REHAB_ITEMS.map((item) => ({
        key: `common:${item.id}`,
        scope: "common" as const,
        itemId: item.id,
        label: item.label,
        description: item.description,
      })),
      ...units.flatMap(buildRoomSteps),
    ],
    [units],
  );

  const sections = useMemo<WalkthroughSection[]>(
    () => [
      {
        key: "common",
        label: "Outside & Common Areas",
        stepIndex: 0,
      },
      ...units.map((unit, unitIndex) => ({
        key: `unit:${unit.id}`,
        label: `Unit ${unit.label}`,
        stepIndex: COMMON_REHAB_ITEMS.length
          + units
              .slice(0, unitIndex)
              .reduce(
                (stepCount, previousUnit) =>
                  stepCount + buildRoomSteps(previousUnit).length,
                0,
              ),
      })),
    ],
    [units],
  );

  const currentStep = steps[currentStepIndex];
  const currentSectionKey =
    currentStep?.scope === "unit" && currentStep.unitId
      ? `unit:${currentStep.unitId}`
      : "common";

  function getSectionSteps(sectionKey: string) {
    return sectionKey === "common"
      ? steps.filter((step) => step.scope === "common")
      : steps.filter(
          (step) =>
            step.scope === "unit" && `unit:${step.unitId}` === sectionKey,
        );
  }

  useEffect(() => {
    if (voiceStatus !== "recording") return;

    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [voiceStatus]);

  useEffect(
    () => () => {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadPhotos() {
      setPhotoStatus("loading");
      setPhotoError("");

      try {
        const response = await fetch(
          `/api/properties/${propertyId}/walkthrough/photos`,
        );
        const result = (await response.json()) as {
          success?: boolean;
          message?: string;
          photos?: WalkthroughPhoto[];
        };

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Could not load walkthrough photos.");
        }

        if (isMounted) {
          setPhotos(result.photos || []);
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setPhotoError(
            error instanceof Error
              ? error.message
              : "Could not load walkthrough photos.",
          );
        }
      } finally {
        if (isMounted) {
          setPhotoStatus("idle");
        }
      }
    }

    loadPhotos();

    return () => {
      isMounted = false;
    };
  }, [propertyId]);

  function getItem(step: WalkthroughStep) {
    if (step.scope === "common") {
      return normalizeInspectionItem(walkthrough.common[step.itemId]);
    }

    return normalizeInspectionItem(
      walkthrough.units[step.unitId || ""]?.rooms[step.itemId],
    );
  }

  function updateItem(
    step: WalkthroughStep,
    update: Partial<InspectionItem>,
  ) {
    setWalkthrough((current) => {
      const existing =
        step.scope === "common"
          ? normalizeInspectionItem(current.common[step.itemId])
          : normalizeInspectionItem(
              current.units[step.unitId || ""]?.rooms[step.itemId],
            );
      const nextItem = { ...existing, ...update };

      if (step.scope === "common") {
        return {
          ...current,
          common: {
            ...current.common,
            [step.itemId]: nextItem,
          },
        };
      }

      const unitId = step.unitId || "";

      return {
        ...current,
        units: {
          ...current.units,
          [unitId]: {
            rooms: {
              ...current.units[unitId]?.rooms,
              [step.itemId]: nextItem,
            },
          },
        },
      };
    });
  }

  function selectStep(stepIndex: number) {
    setCurrentStepIndex(stepIndex);
    setSaveMessage("");
    setVoiceSuggestion(null);
    setSectionVoiceSuggestions([]);
    setSectionVoiceTranscript("");
    setSectionVoiceWarning(null);
    setVoiceError("");
  }

  async function startVoiceNote(scope: VoiceNoteScope = "step") {
    setVoiceError("");
    setVoiceSuggestion(null);
    setSectionVoiceSuggestions([]);
    setSectionVoiceTranscript("");
    setSectionVoiceWarning(null);
    setVoiceScope(scope);

    const storedAcknowledgement =
      typeof window !== "undefined"
        ? window.localStorage.getItem("property-pipeline:voice-consent")
        : null;

    if (!hasAcknowledgedVoiceUse && storedAcknowledgement !== "accepted") {
      const accepted = window.confirm(
        "Property Pipeline will use your microphone to record this walkthrough note, transcribe it, and organize the property observations. Avoid recording private conversations or personal information.",
      );

      if (!accepted) return;

      window.localStorage.setItem("property-pipeline:voice-consent", "accepted");
      setHasAcknowledgedVoiceUse(true);
    }

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setVoiceError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const preferredMimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.start(1000);
      setRecordingSeconds(0);
      setVoiceStatus("recording");
    } catch (error) {
      console.error(error);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setVoiceError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access and try again."
          : "Could not start the microphone. Please try again.",
      );
    }
  }

  async function stopAndProcessVoiceNote() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") return;

    setVoiceStatus("processing");
    setVoiceError("");

    try {
      const audioBlob = await new Promise<Blob>((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            resolve(
              new Blob(audioChunksRef.current, {
                type: recorder.mimeType || "audio/webm",
              }),
            );
          },
          { once: true },
        );
        recorder.stop();
      });

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;

      if (audioBlob.size === 0) {
        throw new Error("No audio was captured. Please record the note again.");
      }

      const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      const activeSectionSteps = getSectionSteps(currentSectionKey);
      const sectionLabel =
        currentSectionKey === "common"
          ? "Outside & Common Areas"
          : `Unit ${currentStep.unitLabel}`;

      formData.append("audio", audioBlob, `voice-note.${extension}`);
      formData.append(
        "stepLabel",
        voiceScope === "section" ? sectionLabel : currentStep.label,
      );
      formData.append(
        "stepDescription",
        voiceScope === "section"
          ? "Fast walkthrough section narration across multiple checkpoints."
          : currentStep.description,
      );

      if (voiceScope === "section") {
        formData.append("mode", "section");
        formData.append(
          "steps",
          JSON.stringify(
            activeSectionSteps.map((step) => ({
              key: step.key,
              label: step.label,
              description: step.description,
            })),
          ),
        );
      }

      const response = await fetch(
        `/api/properties/${propertyId}/walkthrough/voice-note`,
        {
          method: "POST",
          body: formData,
        },
      );
      const responseText = await response.text();
      const result = responseText
        ? (JSON.parse(responseText) as {
            success?: boolean;
            message?: string;
            transcript?: string;
            warning?: string | null;
            suggestion?: {
              needsRehab?: boolean | null;
              estimatedCost?: number | null;
              notes?: string;
            };
            sectionSuggestions?: Array<{
              stepKey?: string;
              needsRehab?: boolean | null;
              estimatedCost?: number | null;
              notes?: string;
            }>;
          })
        : null;

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "The voice note could not be processed.",
        );
      }

      if (voiceScope === "section") {
        const suggestions = (result.sectionSuggestions || []).flatMap(
          (suggestion) => {
            const matchedStep = activeSectionSteps.find(
              (step) => step.key === suggestion.stepKey,
            );

            if (!matchedStep) return [];

            return [
              {
                stepKey: matchedStep.key,
                stepLabel: matchedStep.label,
                needsRehab:
                  suggestion.needsRehab === true
                    ? true
                    : suggestion.needsRehab === false
                      ? false
                      : null,
                estimatedCost:
                  typeof suggestion.estimatedCost === "number"
                    ? suggestion.estimatedCost
                    : null,
                notes: suggestion.notes || "",
              },
            ];
          },
        );

        setSectionVoiceSuggestions(suggestions);
        setSectionVoiceTranscript(result.transcript || "");
        setSectionVoiceWarning(result.warning || null);
        setSaveMessage(
          suggestions.length > 0
            ? "Narration matched to checkpoints. Review and apply the updates."
            : result.warning ||
                "Narration transcribed, but no checkpoint updates were matched.",
        );
        return;
      }

      if (!result.suggestion) {
        throw new Error("The voice note could not be processed.");
      }

      setVoiceSuggestion({
        transcript: result.transcript || "",
        needsRehab:
          result.suggestion.needsRehab === true
            ? true
            : result.suggestion.needsRehab === false
              ? false
              : null,
        estimatedCost:
          typeof result.suggestion.estimatedCost === "number"
            ? result.suggestion.estimatedCost
            : null,
        notes: result.suggestion.notes || result.transcript || "",
        warning: result.warning,
      });
    } catch (error) {
      console.error(error);
      setVoiceError(
        error instanceof Error
          ? error.message
          : "The voice note could not be processed.",
      );
    } finally {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      setVoiceStatus("idle");
    }
  }

  function applyVoiceSuggestion() {
    if (!voiceSuggestion) return;

    const update: Partial<InspectionItem> = {};

    if (voiceSuggestion.needsRehab !== null) {
      update.needsRehab = voiceSuggestion.needsRehab;

      if (voiceSuggestion.needsRehab === false) {
        update.estimatedCost = 0;
      }
    }

    if (voiceSuggestion.estimatedCost !== null) {
      update.estimatedCost = voiceSuggestion.estimatedCost;
    }

    if (voiceSuggestion.notes) {
      update.notes = currentItem.notes.trim()
        ? `${currentItem.notes.trim()}\n${voiceSuggestion.notes}`
        : voiceSuggestion.notes;
    }

    updateItem(currentStep, update);
    setVoiceSuggestion(null);
    setSaveMessage("Voice note applied. Save this step to keep it.");
  }

  function applySectionVoiceSuggestions() {
    if (sectionVoiceSuggestions.length === 0) return;

    for (const suggestion of sectionVoiceSuggestions) {
      const matchedStep = steps.find((step) => step.key === suggestion.stepKey);

      if (!matchedStep) continue;

      const existingItem = getItem(matchedStep);
      const update: Partial<InspectionItem> = {};

      if (suggestion.needsRehab !== null) {
        update.needsRehab = suggestion.needsRehab;

        if (suggestion.needsRehab === false) {
          update.estimatedCost = 0;
        }
      }

      if (suggestion.estimatedCost !== null) {
        update.estimatedCost = suggestion.estimatedCost;
      }

      if (suggestion.notes) {
        update.notes = existingItem.notes.trim()
          ? `${existingItem.notes.trim()}\n${suggestion.notes}`
          : suggestion.notes;
      }

      updateItem(matchedStep, update);
    }

    setSectionVoiceSuggestions([]);
    setSectionVoiceTranscript("");
    setSectionVoiceWarning(null);
    setSaveMessage("Narration applied. Save the fast walkthrough to keep it.");
  }

  async function saveWalkthrough({
    exit = false,
    finished = false,
    nextStep = currentStepIndex,
  }: {
    exit?: boolean;
    finished?: boolean;
    nextStep?: number;
  } = {}) {
    setIsSaving(true);
    setSaveMessage("Saving walkthrough...");

    try {
      const response = await fetch(`/api/properties/${propertyId}/walkthrough`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...walkthrough,
          completed: finished,
          currentStep: nextStep,
        }),
      });
      const responseText = await response.text();
      let result: {
        success?: boolean;
        message?: string;
        warning?: string | null;
      } | null = null;

      if (responseText) {
        try {
          result = JSON.parse(responseText) as {
            success?: boolean;
            message?: string;
            warning?: string | null;
          };
        } catch {
          // A proxy or framework error page is not useful to show in full.
        }
      }

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message ||
            `Could not save walkthrough (server returned ${response.status}).`,
        );
      }

      setSaveMessage(result.warning || "Progress saved.");

      if (exit || finished) {
        router.push(`/properties/${propertyId}`);
        router.refresh();
      }
      return true;
    } catch (error) {
      console.error(error);
      setSaveMessage(
        error instanceof Error ? error.message : "Could not save walkthrough.",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function moveNext() {
    if (currentStepIndex >= steps.length - 1) {
      await saveWalkthrough({ finished: true });
      return;
    }

    const nextStep = Math.min(currentStepIndex + 1, steps.length - 1);
    const saved = await saveWalkthrough({ nextStep });

    if (saved) {
      setCurrentStepIndex(nextStep);
      setVoiceSuggestion(null);
      setVoiceError("");
    }
  }

  async function uploadWalkthroughPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !currentStep) return;

    const sectionLabel =
      currentSectionKey === "common"
        ? "Outside & Common Areas"
        : `Unit ${currentStep.unitLabel}`;
    const formData = new FormData();

    formData.append("photo", file);
    formData.append("stepKey", currentStep.key);
    formData.append("stepLabel", currentStep.label);
    formData.append("sectionKey", currentSectionKey);
    formData.append("sectionLabel", sectionLabel);

    setPhotoStatus("uploading");
    setPhotoError("");
    setPhotoMessage("");

    try {
      const response = await fetch(
        `/api/properties/${propertyId}/walkthrough/photos`,
        {
          method: "POST",
          body: formData,
        },
      );
      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        photo?: WalkthroughPhoto;
      };

      if (!response.ok || !result.success || !result.photo) {
        throw new Error(result.message || "Could not save the photo.");
      }

      setPhotos((current) => [
        result.photo as WalkthroughPhoto,
        ...current.filter((photo) => photo.id !== result.photo?.id),
      ]);
      setPhotoMessage(`Photo saved to ${currentStep.label}.`);
      setPhotoFilter("section");
    } catch (error) {
      console.error(error);
      setPhotoError(
        error instanceof Error ? error.message : "Could not save the photo.",
      );
    } finally {
      setPhotoStatus("idle");
    }
  }

  async function deleteWalkthroughPhoto(photoId: string) {
    const photo = photos.find((item) => item.id === photoId);

    if (!photo) return;

    const confirmed = window.confirm("Remove this walkthrough photo?");
    if (!confirmed) return;

    setPhotoStatus("deleting");
    setPhotoError("");
    setPhotoMessage("");

    try {
      const response = await fetch(
        `/api/properties/${propertyId}/walkthrough/photos?photoId=${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not remove the photo.");
      }

      setPhotos((current) => current.filter((item) => item.id !== photoId));
      setPhotoPreview((current) => (current?.id === photoId ? null : current));
      setPhotoMessage("Photo removed.");
    } catch (error) {
      console.error(error);
      setPhotoError(
        error instanceof Error ? error.message : "Could not remove the photo.",
      );
    } finally {
      setPhotoStatus("idle");
    }
  }

  if (!currentStep) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center">
        <ClipboardCheck className="mx-auto h-8 w-8 text-slate-500" />
        <h2 className="mt-3 text-xl font-bold text-slate-950">
          No walkthrough checkpoints available
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Add a unit or return to the property page.
        </p>
      </div>
    );
  }

  const currentItem = getItem(currentStep);
  const sectionSteps = getSectionSteps(currentSectionKey);
  const sectionAnsweredCount = sectionSteps.filter(
    (step) => getItem(step).needsRehab !== null,
  ).length;
  const answeredCount = steps.filter(
    (step) => getItem(step).needsRehab !== null,
  ).length;
  const progress = ((currentStepIndex + 1) / steps.length) * 100;
  const currentSectionLabel =
    currentSectionKey === "common"
      ? "Outside & Common Areas"
      : `Unit ${currentStep.unitLabel}`;
  const sectionPhotos = photos.filter(
    (photo) =>
      photo.sectionKey === currentSectionKey ||
      photo.stepKey === currentStep.key,
  );
  const visiblePhotos = photoFilter === "section" ? sectionPhotos : photos;
  const photoPanelTitle =
    photoFilter === "section"
      ? `${sectionPhotos.length} in this section`
      : `${photos.length} total`;
  const photoPanel = (
    <details
      className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      open
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <ImageIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-950">
              Walkthrough Photos
            </p>
            <p className="text-xs text-slate-500">
              Take photos now, then pull them up later by section or across the
              property.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {photoPanelTitle}
        </span>
      </summary>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
            {(["section", "all"] as PhotoFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPhotoFilter(filter)}
                className={`h-9 rounded-md px-3 text-xs font-semibold ${
                  photoFilter === filter
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {filter === "section" ? "This section" : "All photos"}
              </button>
            ))}
          </div>

          <div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={uploadWalkthroughPhoto}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoStatus === "uploading"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
            >
              {photoStatus === "uploading" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {photoStatus === "uploading"
                ? "Saving Photo..."
                : "Take / Upload Photo"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          New photos save to {currentStep.label} in {currentSectionLabel}.
        </p>

        {photoError && (
          <p className="mt-3 text-sm font-medium text-red-700">{photoError}</p>
        )}
        {photoMessage && !photoError && (
          <p className="mt-3 text-sm font-medium text-slate-600">
            {photoMessage}
          </p>
        )}

        {photoStatus === "loading" ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading photos...
          </div>
        ) : visiblePhotos.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visiblePhotos.map((photo) => {
              const createdDate = new Date(photo.createdAt);
              const dateLabel = Number.isNaN(createdDate.getTime())
                ? "Saved photo"
                : createdDate.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  });

              return (
                <div
                  key={photo.id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                >
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(photo)}
                    className="block aspect-[4/3] w-full bg-slate-100"
                    disabled={!photo.url}
                  >
                    {photo.url ? (
                      <img
                        src={photo.url}
                        alt={photo.stepLabel || photo.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs font-medium text-slate-500">
                        Photo unavailable
                      </span>
                    )}
                  </button>
                  <div className="p-2">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {photo.stepLabel || photo.sectionLabel || "Walkthrough"}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] text-slate-500">
                        {dateLabel}
                      </p>
                      <button
                        type="button"
                        onClick={() => deleteWalkthroughPhoto(photo.id)}
                        disabled={photoStatus === "deleting"}
                        aria-label="Delete walkthrough photo"
                        className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            {photoFilter === "section"
              ? "No photos saved for this section yet."
              : "No walkthrough photos saved yet."}
          </div>
        )}
      </div>
    </details>
  );
  const voiceNotePanel = (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {walkthroughMode === "fast"
              ? `Narrate ${currentSectionKey === "common" ? "common areas" : `Unit ${currentStep.unitLabel}`}`
              : `Voice note for ${currentStep.label}`}
          </p>
          <p className="text-xs text-slate-500">
            {walkthroughMode === "fast"
              ? "Say each checkpoint out loud, like “living room ok, kitchen needs work, $500.”"
              : "Describe the condition, needed work, and any cost you want recorded."}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Microphone audio is used to transcribe and organize this walkthrough
            note.
          </p>
        </div>

        {voiceStatus === "recording" ? (
          <button
            type="button"
            onClick={stopAndProcessVoiceNote}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop · {Math.floor(recordingSeconds / 60)}:
            {String(recordingSeconds % 60).padStart(2, "0")}
          </button>
        ) : voiceStatus === "processing" ? (
          <button
            type="button"
            disabled
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Transcribing...
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              startVoiceNote(walkthroughMode === "fast" ? "section" : "step")
            }
            disabled={isSaving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
          >
            <Mic className="h-4 w-4" />
            {walkthroughMode === "fast"
              ? "Record Section Narration"
              : "Record Note"}
          </button>
        )}
      </div>

      {voiceError && (
        <p className="mt-3 text-sm font-medium text-red-700">
          {voiceError}
        </p>
      )}

      {voiceSuggestion && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">
            Suggested walkthrough update
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {voiceSuggestion.needsRehab !== null && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                {voiceSuggestion.needsRehab
                  ? "Needs rehab"
                  : "No rehab needed"}
              </span>
            )}
            {voiceSuggestion.estimatedCost !== null && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                ${voiceSuggestion.estimatedCost.toLocaleString()}
              </span>
            )}
          </div>
          {voiceSuggestion.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
              {voiceSuggestion.notes}
            </p>
          )}
          {voiceSuggestion.warning && (
            <p className="mt-2 text-xs text-amber-700">
              {voiceSuggestion.warning}
            </p>
          )}
          <details className="mt-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium">
              View transcript
            </summary>
            <p className="mt-2 whitespace-pre-wrap">
              {voiceSuggestion.transcript}
            </p>
          </details>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={applyVoiceSuggestion}
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Apply to {currentStep.label}
            </button>
            <button
              type="button"
              onClick={() => setVoiceSuggestion(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {(sectionVoiceSuggestions.length > 0 ||
        sectionVoiceTranscript ||
        sectionVoiceWarning) && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">
            Suggested fast walkthrough updates
          </p>

          {sectionVoiceWarning && (
            <p className="mt-2 text-xs text-amber-700">
              {sectionVoiceWarning}
            </p>
          )}

          {sectionVoiceSuggestions.length > 0 ? (
            <div className="mt-3 space-y-2">
              {sectionVoiceSuggestions.map((suggestion) => (
                <div
                  key={`${suggestion.stepKey}-${suggestion.notes}`}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {suggestion.stepLabel}
                    </p>
                    {suggestion.needsRehab !== null && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {suggestion.needsRehab ? "Repair" : "OK"}
                      </span>
                    )}
                    {suggestion.estimatedCost !== null && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        ${suggestion.estimatedCost.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {suggestion.notes && (
                    <p className="mt-1 text-sm text-slate-700">
                      {suggestion.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              No checkpoint updates were matched. You can still view the
              transcript and add notes manually.
            </p>
          )}

          {sectionVoiceTranscript && (
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium">
                View transcript
              </summary>
              <p className="mt-2 whitespace-pre-wrap">
                {sectionVoiceTranscript}
              </p>
            </details>
          )}

          <div className="mt-4 flex gap-2">
            {sectionVoiceSuggestions.length > 0 && (
              <button
                type="button"
                onClick={applySectionVoiceSuggestions}
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Apply All Updates
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSectionVoiceSuggestions([]);
                setSectionVoiceTranscript("");
                setSectionVoiceWarning(null);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={
        walkthroughMode === "fast"
          ? "mx-auto max-w-5xl"
          : "mx-auto max-w-2xl"
      }
    >
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-slate-700">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
          <span className="text-slate-500">{answeredCount} inspected</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label
                htmlFor="walkthrough-section"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Jump to section
              </label>
              <select
                id="walkthrough-section"
                value={currentSectionKey}
                onChange={(event) => {
                  const section = sections.find(
                    (option) => option.key === event.target.value,
                  );

                  if (section) {
                    selectStep(section.stepIndex);
                  }
                }}
                disabled={isSaving || voiceStatus !== "idle"}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
              >
                {sections.map((section) => (
                  <option key={section.key} value={section.key}>
                    {section.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1">
              {(["fast", "detailed"] as WalkthroughMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setWalkthroughMode(mode)}
                  disabled={isSaving || voiceStatus !== "idle"}
                  className={`h-9 rounded-md px-3 text-sm font-semibold capitalize ${
                    walkthroughMode === mode
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  } disabled:opacity-60`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {walkthroughMode === "fast" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Fast walkthrough
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                {currentSectionKey === "common"
                  ? "Outside & Common Areas"
                  : `Unit ${currentStep.unitLabel}`}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Narrate the whole section, or tap the obvious status for each
                checkpoint when you want manual control.
              </p>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              {sectionAnsweredCount} / {sectionSteps.length} checked
            </div>
          </div>

          {voiceNotePanel}
          {photoPanel}

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {sectionSteps.map((step) => {
              const item = getItem(step);
              const stepIndex = steps.findIndex(
                (candidate) => candidate.key === step.key,
              );
              const isActive = step.key === currentStep.key;

              return (
                <div
                  key={step.key}
                  className={`rounded-xl border p-3 ${
                    isActive
                      ? "border-slate-900 bg-slate-50 ring-2 ring-slate-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => selectStep(stepIndex)}
                      className="min-w-0 text-left"
                    >
                      <p className="text-sm font-semibold text-slate-950">
                        {step.label}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {step.description}
                      </p>
                    </button>
                    {isActive && (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Voice
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateItem(step, {
                          needsRehab: false,
                          estimatedCost: 0,
                        })
                      }
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        item.needsRehab === false
                          ? "border-green-500 bg-green-50 text-green-800"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => updateItem(step, { needsRehab: true })}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        item.needsRehab === true
                          ? "border-amber-500 bg-amber-50 text-amber-900"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      Repair
                    </button>
                  </div>

                  {item.needsRehab === true && (
                    <label className="mt-3 block">
                      <span className="text-xs font-medium text-slate-700">
                        Cost
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={item.estimatedCost || ""}
                        onFocus={() => selectStep(stepIndex)}
                        onChange={(event) =>
                          updateItem(step, {
                            estimatedCost: Number(event.target.value) || 0,
                          })
                        }
                        placeholder="$0"
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    </label>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                      Notes {item.notes ? "added" : ""}
                    </summary>
                    <textarea
                      rows={3}
                      value={item.notes}
                      onFocus={() => selectStep(stepIndex)}
                      onChange={(event) =>
                        updateItem(step, { notes: event.target.value })
                      }
                      placeholder="Quick observation, concern, or contractor note..."
                      className="mt-2 w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </details>
                </div>
              );
            })}
          </div>

          {saveMessage && (
            <p className="mt-4 text-sm text-slate-500">{saveMessage}</p>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => saveWalkthrough({ exit: true })}
              disabled={isSaving || voiceStatus !== "idle"}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Save Progress & Exit
            </button>
            <button
              type="button"
              onClick={() => saveWalkthrough()}
              disabled={isSaving || voiceStatus !== "idle"}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Fast Walkthrough"}
            </button>
          </div>
        </div>
      ) : (
        <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {currentStep.scope === "common"
            ? `Outside & Common Areas · ${address}`
            : `Unit ${currentStep.unitLabel}`}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {currentStep.label}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {currentStep.description}
        </p>

        {voiceNotePanel}
        {photoPanel}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              updateItem(currentStep, {
                needsRehab: false,
                estimatedCost: 0,
              })
            }
            className={`rounded-xl border px-4 py-4 text-sm font-semibold transition ${
              currentItem.needsRehab === false
                ? "border-green-500 bg-green-50 text-green-800 ring-2 ring-green-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Check className="mx-auto mb-1 h-5 w-5" />
            No Rehab Needed
          </button>
          <button
            type="button"
            onClick={() => updateItem(currentStep, { needsRehab: true })}
            className={`rounded-xl border px-4 py-4 text-sm font-semibold transition ${
              currentItem.needsRehab === true
                ? "border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Needs Rehab
          </button>
        </div>

        {currentItem.needsRehab === true && (
          <div className="mt-5">
            <label
              htmlFor="walkthrough-cost"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Estimated Rehab Cost
            </label>
            <input
              id="walkthrough-cost"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={currentItem.estimatedCost || ""}
              onChange={(event) =>
                updateItem(currentStep, {
                  estimatedCost: Number(event.target.value) || 0,
                })
              }
              placeholder="$0"
              className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        )}

        <div className="mt-5">
          <label
            htmlFor="walkthrough-notes"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Notes
          </label>
          <textarea
            id="walkthrough-notes"
            rows={5}
            value={currentItem.notes}
            onChange={(event) =>
              updateItem(currentStep, { notes: event.target.value })
            }
            placeholder="What did you see? Missing brick, damaged flooring, old fixtures, moisture, scope ideas..."
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base text-slate-950 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {saveMessage && (
          <p className="mt-3 text-sm text-slate-500">{saveMessage}</p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setCurrentStepIndex((index) => {
                setVoiceSuggestion(null);
                setVoiceError("");
                return Math.max(0, index - 1);
              })
            }
            disabled={
              currentStepIndex === 0 || isSaving || voiceStatus !== "idle"
            }
            className="inline-flex h-11 items-center gap-1 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <button
            type="button"
            onClick={moveNext}
            disabled={isSaving || voiceStatus !== "idle"}
            className="inline-flex h-11 items-center gap-1 rounded-lg bg-slate-950 px-5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : currentStepIndex === steps.length - 1
                ? "Finish Walkthrough"
                : "Save & Next"}
            {!isSaving && currentStepIndex < steps.length - 1 && (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => saveWalkthrough({ exit: true })}
        disabled={isSaving || voiceStatus !== "idle"}
        className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        Save Progress & Exit
      </button>
        </>
      )}
      {photoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="max-h-full w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {photoPreview.stepLabel ||
                    photoPreview.sectionLabel ||
                    "Walkthrough photo"}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {photoPreview.sectionLabel || address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoPreview(null)}
                aria-label="Close photo preview"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {photoPreview.url ? (
              <img
                src={photoPreview.url}
                alt={photoPreview.stepLabel || photoPreview.fileName}
                className="max-h-[75vh] w-full object-contain bg-slate-950"
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                This photo is unavailable right now.
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="truncate text-xs text-slate-500">
                {photoPreview.fileName}
              </p>
              <button
                type="button"
                onClick={() => deleteWalkthroughPhoto(photoPreview.id)}
                disabled={photoStatus === "deleting"}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
