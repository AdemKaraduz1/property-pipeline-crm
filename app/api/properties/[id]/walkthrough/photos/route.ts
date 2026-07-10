import { randomUUID } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { asRecord } from "@/lib/rehab";

export const runtime = "nodejs";

const WALKTHROUGH_PHOTO_BUCKET =
  process.env.SUPABASE_WALKTHROUGH_PHOTOS_BUCKET || "walkthrough-photos";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type PhotosRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type WalkthroughPhotoRecord = {
  id: string;
  path: string;
  fileName: string;
  contentType: string;
  size: number;
  stepKey: string | null;
  stepLabel: string | null;
  sectionKey: string | null;
  sectionLabel: string | null;
  createdAt: string;
};

type WalkthroughPhotoResponse = WalkthroughPhotoRecord & {
  url: string | null;
};

function textValue(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function normalizePhotoRecord(value: unknown): WalkthroughPhotoRecord | null {
  const photo = asRecord(value);
  const id = typeof photo.id === "string" ? photo.id : "";
  const path = typeof photo.path === "string" ? photo.path : "";
  const fileName =
    typeof photo.fileName === "string" ? photo.fileName : "Walkthrough photo";
  const contentType =
    typeof photo.contentType === "string" ? photo.contentType : "image/jpeg";
  const size = Number(photo.size);
  const createdAt =
    typeof photo.createdAt === "string"
      ? photo.createdAt
      : new Date().toISOString();

  if (!id || !path) return null;

  return {
    id,
    path,
    fileName,
    contentType,
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    stepKey: typeof photo.stepKey === "string" ? photo.stepKey : null,
    stepLabel: typeof photo.stepLabel === "string" ? photo.stepLabel : null,
    sectionKey: typeof photo.sectionKey === "string" ? photo.sectionKey : null,
    sectionLabel:
      typeof photo.sectionLabel === "string" ? photo.sectionLabel : null,
    createdAt,
  };
}

function normalizePhotoRecords(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const photo = normalizePhotoRecord(item);
        return photo ? [photo] : [];
      })
    : [];
}

function getPhotoExtension(file: File) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();

  if (nameExtension && /^[a-z0-9]{2,5}$/.test(nameExtension)) {
    return nameExtension === "jpeg" ? "jpg" : nameExtension;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";

  return "jpg";
}

function createStorageClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadOwnedProperty(propertyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 },
      ),
    };
  }

  const { data: property, error } = await supabase
    .from("properties")
    .select("id, all_extracted_fields")
    .eq("id", propertyId)
    .eq("user_id", user.id)
    .single();

  if (!property) {
    if (error) console.error("Walkthrough photo property load failed:", error);

    return {
      response: NextResponse.json(
        { success: false, message: "Property not found." },
        { status: 404 },
      ),
    };
  }

  return {
    supabase,
    user,
    property,
    metadata: asRecord(property.all_extracted_fields),
  };
}

async function signPhotos(
  storageClient: NonNullable<ReturnType<typeof createStorageClient>>,
  photos: WalkthroughPhotoRecord[],
): Promise<WalkthroughPhotoResponse[]> {
  return Promise.all(
    photos.map(async (photo) => {
      const { data, error } = await storageClient.storage
        .from(WALKTHROUGH_PHOTO_BUCKET)
        .createSignedUrl(photo.path, 60 * 60);

      if (error) {
        console.error("Walkthrough photo sign failed:", error);
      }

      return {
        ...photo,
        url: data?.signedUrl || null,
      };
    }),
  );
}

export async function GET(
  _request: Request,
  context: PhotosRouteContext,
) {
  const { id } = await context.params;
  const loaded = await loadOwnedProperty(id);

  if (loaded.response) return loaded.response;

  const photos = normalizePhotoRecords(loaded.metadata.walkthrough_photos);

  if (photos.length === 0) {
    return NextResponse.json({ success: true, photos: [] });
  }

  const storageClient = createStorageClient() || loaded.supabase;
  const signedPhotos = await signPhotos(storageClient, photos);

  return NextResponse.json({ success: true, photos: signedPhotos });
}

export async function POST(
  request: Request,
  context: PhotosRouteContext,
) {
  const { id } = await context.params;
  const loaded = await loadOwnedProperty(id);

  if (loaded.response) return loaded.response;

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: "The photo upload was not valid." },
      { status: 400 },
    );
  }

  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, message: "Choose a walkthrough photo to upload." },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { success: false, message: "Photos must be smaller than 8 MB." },
      { status: 400 },
    );
  }

  if (!IMAGE_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        success: false,
        message: "Upload a JPG, PNG, WebP, HEIC, or HEIF photo.",
      },
      { status: 400 },
    );
  }

  const storageClient = createStorageClient() || loaded.supabase;
  const photoId = randomUUID();
  const extension = getPhotoExtension(file);
  const path = `${loaded.user.id}/${id}/${photoId}.${extension}`;
  const { error: uploadError } = await storageClient.storage
    .from(WALKTHROUGH_PHOTO_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Walkthrough photo upload failed:", uploadError);

    return NextResponse.json(
      {
        success: false,
        message:
          "Could not upload the photo. Make sure the walkthrough photo storage bucket is configured.",
      },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  const photo: WalkthroughPhotoRecord = {
    id: photoId,
    path,
    fileName: file.name || "Walkthrough photo",
    contentType: file.type,
    size: file.size,
    stepKey: textValue(formData.get("stepKey"), 180),
    stepLabel: textValue(formData.get("stepLabel"), 120),
    sectionKey: textValue(formData.get("sectionKey"), 180),
    sectionLabel: textValue(formData.get("sectionLabel"), 120),
    createdAt: now,
  };
  const existingPhotos = normalizePhotoRecords(
    loaded.metadata.walkthrough_photos,
  );
  const nextPhotos = [photo, ...existingPhotos].slice(0, 300);
  const { error: updateError } = await loaded.supabase
    .from("properties")
    .update({
      all_extracted_fields: {
        ...loaded.metadata,
        walkthrough_photos: nextPhotos,
      },
    })
    .eq("id", id)
    .eq("user_id", loaded.user.id);

  if (updateError) {
    console.error("Walkthrough photo metadata save failed:", updateError);
    await storageClient.storage.from(WALKTHROUGH_PHOTO_BUCKET).remove([path]);

    return NextResponse.json(
      { success: false, message: "Could not save the photo to this property." },
      { status: 500 },
    );
  }

  const [signedPhoto] = await signPhotos(storageClient, [photo]);

  return NextResponse.json({
    success: true,
    photo: signedPhoto,
  });
}

export async function DELETE(
  request: Request,
  context: PhotosRouteContext,
) {
  const { id } = await context.params;
  const loaded = await loadOwnedProperty(id);

  if (loaded.response) return loaded.response;

  const { searchParams } = new URL(request.url);
  const photoId = searchParams.get("photoId");

  if (!photoId) {
    return NextResponse.json(
      { success: false, message: "Choose a photo to delete." },
      { status: 400 },
    );
  }

  const existingPhotos = normalizePhotoRecords(
    loaded.metadata.walkthrough_photos,
  );
  const photo = existingPhotos.find((item) => item.id === photoId);

  if (!photo) {
    return NextResponse.json(
      { success: false, message: "Photo not found." },
      { status: 404 },
    );
  }

  const nextPhotos = existingPhotos.filter((item) => item.id !== photoId);
  const { error: updateError } = await loaded.supabase
    .from("properties")
    .update({
      all_extracted_fields: {
        ...loaded.metadata,
        walkthrough_photos: nextPhotos,
      },
    })
    .eq("id", id)
    .eq("user_id", loaded.user.id);

  if (updateError) {
    console.error("Walkthrough photo delete metadata failed:", updateError);

    return NextResponse.json(
      { success: false, message: "Could not remove the photo." },
      { status: 500 },
    );
  }

  const storageClient = createStorageClient() || loaded.supabase;
  const { error: storageError } = await storageClient.storage
    .from(WALKTHROUGH_PHOTO_BUCKET)
    .remove([photo.path]);

  if (storageError) {
    console.error("Walkthrough photo storage delete failed:", storageError);
  }

  return NextResponse.json({ success: true, photoId });
}
