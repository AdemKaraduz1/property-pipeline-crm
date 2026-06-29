import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

type VoiceSuggestion = {
  needsRehab: boolean | null;
  estimatedCost: number | null;
  notes: string;
};

type OpenAIErrorBody = {
  error?: {
    code?: string | null;
    message?: string;
    type?: string;
  };
};

type OpenAIErrorDetails = {
  code: string | null;
  message: string;
  status: number;
  type: string | null;
};

function getResponseOutputText(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const response = value as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        type?: unknown;
        text?: unknown;
      }>;
    }>;
  };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function cleanWalkthroughNote(notes: string) {
  const cleaned = notes
    .trim()
    .replace(
      /\b(?:the\s+)?speaker\s+(?:stated|states|said|says|mentioned|mentions|noted|notes|reported|reports|indicated|indicates)\s+(?:that\s+)?/gi,
      "",
    )
    .replace(
      /\b(?:the\s+)?(?:transcript|voice note|recording)\s+(?:stated|states|said|says|mentioned|mentions|noted|notes|reported|reports|indicated|indicates)\s+(?:that\s+)?/gi,
      "",
    )
    .replace(
      /\.\s+(?:a\s+)?(\$[\d,]+(?:\.\d{2})?(?:\s+[A-Za-z][\w-]*){0,3}\.)$/i,
      " - $1",
    )
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();

  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "";
}

function normalizeSuggestion(value: unknown): VoiceSuggestion {
  const suggestion =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const rawCost = suggestion.estimatedCost;
  const cost =
    rawCost === null || rawCost === undefined ? null : Number(rawCost);

  return {
    needsRehab:
      suggestion.needsRehab === true
        ? true
        : suggestion.needsRehab === false
          ? false
          : null,
    estimatedCost:
      cost !== null && Number.isFinite(cost) && cost >= 0 ? cost : null,
    notes:
      typeof suggestion.notes === "string"
        ? cleanWalkthroughNote(suggestion.notes)
        : "",
  };
}

function transcriptOnlyResponse(transcript: string, warning: string) {
  return NextResponse.json({
    success: true,
    transcript,
    suggestion: {
      needsRehab: null,
      estimatedCost: null,
      notes: transcript,
    } satisfies VoiceSuggestion,
    warning,
  });
}

async function openAIErrorDetails(
  response: Response,
): Promise<OpenAIErrorDetails> {
  try {
    const body = (await response.json()) as OpenAIErrorBody;
    return {
      code: body.error?.code || null,
      message: body.error?.message || `OpenAI returned ${response.status}.`,
      status: response.status,
      type: body.error?.type || null,
    };
  } catch {
    return {
      code: null,
      message: `OpenAI returned ${response.status}.`,
      status: response.status,
      type: null,
    };
  }
}

function openAIErrorMessage(details: OpenAIErrorDetails) {
  return [
    details.message,
    details.type ? `type=${details.type}` : null,
    details.code ? `code=${details.code}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function transcriptionFailureMessage(details: OpenAIErrorDetails) {
  if (
    details.code === "insufficient_quota" ||
    details.type === "insufficient_quota"
  ) {
    return "Voice transcription is unavailable because the OpenAI account has no available quota. Check billing and usage, then retry.";
  }

  if (
    details.code === "invalid_api_key" ||
    details.type === "invalid_api_key"
  ) {
    return "Voice transcription is not configured correctly. The OpenAI API key was rejected.";
  }

  if (details.code === "model_not_found") {
    return "Voice transcription is not configured correctly. The selected OpenAI transcription model is not available for this API key.";
  }

  if (details.status === 429) {
    return "The transcription service is rate-limiting requests right now. Please retry in a moment.";
  }

  return "The voice note could not be transcribed. Please retry.";
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Voice transcription is not configured yet. Add OPENAI_API_KEY to the app environment.",
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Not authenticated." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!property) {
    return NextResponse.json(
      { success: false, message: "Property not found." },
      { status: 404 },
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: "The voice note upload was not valid." },
      { status: 400 },
    );
  }

  const audio = formData.get("audio");
  const stepLabel = String(formData.get("stepLabel") || "Walkthrough item")
    .trim()
    .slice(0, 160);
  const stepDescription = String(formData.get("stepDescription") || "")
    .trim()
    .slice(0, 500);

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      { success: false, message: "No voice recording was received." },
      { status: 400 },
    );
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        success: false,
        message: "That voice note is too large. Keep each note under 15 MB.",
      },
      { status: 413 },
    );
  }

  const transcriptionBody = new FormData();
  transcriptionBody.append("file", audio, audio.name || "voice-note.webm");
  transcriptionBody.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
  );
  transcriptionBody.append(
    "prompt",
    `This is a small multifamily property walkthrough for "${stepLabel}". Preserve dollar amounts, measurements, room names, construction terms, and repair details accurately.`,
  );

  let transcriptionResponse: Response;

  try {
    transcriptionResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: transcriptionBody,
      },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not reach the transcription service. Please retry.",
      },
      { status: 502 },
    );
  }

  if (!transcriptionResponse.ok) {
    const details = await openAIErrorDetails(transcriptionResponse);

    console.error("Voice transcription failed:", openAIErrorMessage(details));

    return NextResponse.json(
      {
        success: false,
        message: transcriptionFailureMessage(details),
      },
      { status: 502 },
    );
  }

  const transcription = (await transcriptionResponse.json()) as {
    text?: unknown;
  };
  const transcript =
    typeof transcription.text === "string" ? transcription.text.trim() : "";

  if (!transcript) {
    return NextResponse.json(
      {
        success: false,
        message: "No speech was detected. Try recording the note again.",
      },
      { status: 422 },
    );
  }

  let extractionResponse: Response;

  try {
    extractionResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EXTRACTION_MODEL || "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "Extract a property walkthrough note. Write notes as direct property observations, not transcript summaries. Do not refer to the speaker, transcript, recording, or voice note. Never write phrases like \"speaker stated\", \"the speaker said\", or \"the transcript mentions\". If a repair cost is stated, include it inline after a dash or semicolon, for example: \"Gutter needs rehab - $5,000.\" Never invent a repair cost. Set estimatedCost to null unless the speaker states a specific amount or clear numeric range; for a range, use its midpoint and mention the range directly in notes. Set needsRehab only when the speaker clearly says work is or is not needed. Keep notes concise but preserve observed defects, materials, measurements, and proposed work.",
          },
          {
            role: "user",
            content: `Checkpoint: ${stepLabel}\nDescription: ${stepDescription}\nTranscript: ${transcript}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "walkthrough_voice_note",
            strict: true,
            schema: {
              type: "object",
              properties: {
                needsRehab: {
                  type: ["boolean", "null"],
                },
                estimatedCost: {
                  type: ["number", "null"],
                  minimum: 0,
                },
                notes: {
                  type: "string",
                },
              },
              required: ["needsRehab", "estimatedCost", "notes"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
  } catch {
    return transcriptOnlyResponse(
      transcript,
      "The note was transcribed, but its rehab details could not be organized automatically.",
    );
  }

  if (!extractionResponse.ok) {
    const details = await openAIErrorDetails(extractionResponse);

    console.error(
      "Voice note extraction failed:",
      openAIErrorMessage(details),
    );

    return transcriptOnlyResponse(
      transcript,
      "The note was transcribed, but its rehab details could not be organized automatically.",
    );
  }

  const extraction = await extractionResponse.json();
  const outputText = getResponseOutputText(extraction);
  let suggestion: VoiceSuggestion;

  try {
    suggestion = normalizeSuggestion(
      outputText ? JSON.parse(outputText) : null,
    );
  } catch {
    suggestion = {
      needsRehab: null,
      estimatedCost: null,
      notes: transcript,
    };
  }

  return NextResponse.json({
    success: true,
    transcript,
    suggestion,
  });
}
