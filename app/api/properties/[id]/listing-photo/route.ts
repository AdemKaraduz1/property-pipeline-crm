import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { asRecord } from "@/lib/rehab";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_KEYS = [
  "listing_photo_url",
  "listingPhotoUrl",
  "primary_photo_url",
  "primaryPhotoUrl",
  "main_photo_url",
  "mainPhotoUrl",
  "photo_url",
  "photoUrl",
  "image_url",
  "imageUrl",
  "thumbnail_url",
  "thumbnailUrl",
  "redfin_photo_url",
  "redfinPhotoUrl",
  "og_image",
  "ogImage",
];

type ListingPhotoRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname === "::1" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function resolveUrl(value: string, baseUrl?: string | null) {
  try {
    const resolved = new URL(value, baseUrl || undefined).toString();
    return isPublicHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function collectStoredImageUrls(value: unknown, urls: string[] = [], depth = 0) {
  if (depth > 4 || !value) return urls;

  if (typeof value === "string") {
    const normalized = resolveUrl(value);
    if (normalized) urls.push(normalized);
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStoredImageUrls(item, urls, depth + 1));
    return urls;
  }

  if (typeof value !== "object") return urls;

  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    const likelyImageKey = IMAGE_KEYS.includes(key) || /image|photo|thumbnail/i.test(key);

    if (likelyImageKey) {
      collectStoredImageUrls(item, urls, depth + 1);
    } else if (typeof item === "object" && item !== null) {
      collectStoredImageUrls(item, urls, depth + 1);
    }
  });

  return urls;
}

function findMetaImage(html: string, sourceUrl: string) {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|image)["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|image)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const url = match?.[1] ? resolveUrl(decodeHtmlEntities(match[1]), sourceUrl) : null;
    if (url) return url;
  }

  return null;
}

function collectJsonImageUrls(value: unknown, sourceUrl: string, urls: string[] = []) {
  if (!value) return urls;

  if (typeof value === "string") {
    const url = resolveUrl(value, sourceUrl);
    if (url) urls.push(url);
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonImageUrls(item, sourceUrl, urls));
    return urls;
  }

  if (typeof value !== "object") return urls;

  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (/image|photo|thumbnail/i.test(key)) {
      collectJsonImageUrls(item, sourceUrl, urls);
    } else if (typeof item === "object" && item !== null) {
      collectJsonImageUrls(item, sourceUrl, urls);
    }
  });

  return urls;
}

function findJsonLdImage(html: string, sourceUrl: string) {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(script[1]));
      const urls = collectJsonImageUrls(parsed, sourceUrl);
      const url = urls.find(Boolean);
      if (url) return url;
    } catch {
      // Ignore invalid structured data from listing sites.
    }
  }

  return null;
}

async function findImageFromListingPage(sourceUrl: string | null) {
  if (!sourceUrl || !isPublicHttpUrl(sourceUrl)) return null;

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Mozilla/5.0 (compatible; PropertyPipelineCRM/1.0; +https://property-pipeline-crm.vercel.app)",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const html = (await response.text()).slice(0, 2_000_000);

    return findMetaImage(html, sourceUrl) || findJsonLdImage(html, sourceUrl);
  } catch (error) {
    console.error("Listing photo page lookup failed:", error);
    return null;
  }
}

async function fetchImage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
        "user-agent":
          "Mozilla/5.0 (compatible; PropertyPipelineCRM/1.0; +https://property-pipeline-crm.vercel.app)",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/jpeg";

    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) return null;

    return { arrayBuffer, contentType };
  } catch (error) {
    console.error("Listing photo image fetch failed:", error);
    return null;
  }
}

export async function GET(
  _request: Request,
  context: ListingPhotoRouteContext,
) {
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
  const { data: property, error } = await supabase
    .from("properties")
    .select("id, source_url, all_extracted_fields")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!property) {
    if (error) console.error("Listing photo property load failed:", error);

    return NextResponse.json(
      { success: false, message: "Property not found." },
      { status: 404 },
    );
  }

  const metadata = asRecord(property.all_extracted_fields);
  const storedUrls = collectStoredImageUrls(metadata);
  const sourceUrl =
    typeof property.source_url === "string" ? property.source_url : null;
  const scrapedUrl = await findImageFromListingPage(sourceUrl);
  const candidateUrls = Array.from(
    new Set([...storedUrls, ...(scrapedUrl ? [scrapedUrl] : [])]),
  );

  for (const url of candidateUrls) {
    const image = await fetchImage(url);

    if (!image) continue;

    return new Response(image.arrayBuffer, {
      headers: {
        "content-type": image.contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  }

  return NextResponse.json(
    { success: false, message: "No listing photo found." },
    { status: 404 },
  );
}
