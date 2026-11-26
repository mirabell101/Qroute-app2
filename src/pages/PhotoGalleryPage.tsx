import { useEffect, useState } from "react";
import { ArrowLeft, Images, MapPin } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { getPointImages } from "@/lib/mapImages";
import type { PointImage } from "@/lib/mapImages";
import { supabase } from "@/lib/supabase";

// ============================================================
// TYPES
// ============================================================

type PlaceKind = "terminal" | "stop";

type GalleryPlace = {
  kind: PlaceKind;
  id: number;
  name: string;
  typeLabel: string;
  description: string | null;
  latitude: number;
  longitude: number;
};

type PhotoGalleryLocationState = {
  placeName?: string;
};

// ============================================================
// DATA
// ============================================================

/**
 * Public gallery pages only resolve active, approved locations.
 * Photo visibility remains controlled by getPointImages(), which
 * calls the anonymous-safe public map-image RPC.
 */
async function getGalleryPlace(
  kind: PlaceKind,
  id: number,
): Promise<GalleryPlace> {
  if (kind === "terminal") {
    const { data, error } = await supabase
      .from("terminals")
      .select("id, name, latitude, longitude")
      .eq("id", id)
      .eq("is_active", true)
      .eq("is_approved", true)
      .eq("moderation_status", "approved")
      .eq("is_banned", false)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("This terminal is not available.");

    return {
      kind,
      id: data.id,
      name: data.name,
      typeLabel: "Terminal",
      description: null,
      latitude: data.latitude,
      longitude: data.longitude,
    };
  }

  const { data, error } = await supabase
    .from("stops")
    .select("id, name, description, stop_type, latitude, longitude")
    .eq("id", id)
    .eq("is_active", true)
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_banned", false)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("This stop is not available.");

  return {
    kind,
    id: data.id,
    name: data.name,
    typeLabel: data.stop_type === "train_station"
      ? "Train station"
      : "Bus / jeepney stop",
    description: data.description,
    latitude: data.latitude,
    longitude: data.longitude,
  };
}

// ============================================================
// COMPONENT
// ============================================================

export default function PhotoGalleryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { kind: rawKind, id: rawId } = useParams<{
    kind: string;
    id: string;
  }>();

  const [place, setPlace] = useState<GalleryPlace | null>(null);
  const [photos, setPhotos] = useState<PointImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fallbackPlaceName =
    (location.state as PhotoGalleryLocationState | null)?.placeName?.trim() ||
    null;

  useEffect(() => {
    let active = true;

    async function loadGallery() {
      setLoading(true);
      setError(null);
      setPlace(null);
      setPhotos([]);

      const id = Number(rawId);
      if (
        (rawKind !== "terminal" && rawKind !== "stop") ||
        !Number.isSafeInteger(id) ||
        id < 1
      ) {
        setError("The photo gallery address is invalid.");
        setLoading(false);
        return;
      }

      const kind: PlaceKind = rawKind;

      try {
        const [placeResult, imageResult] = await Promise.allSettled([
          getGalleryPlace(kind, id),
          getPointImages(
            kind === "terminal" ? [id] : [],
            kind === "stop" ? [id] : [],
          ),
        ]);

        if (!active) return;

        if (placeResult.status === "fulfilled") {
          setPlace(placeResult.value);
        } else if (!fallbackPlaceName) {
          throw placeResult.reason;
        }

        if (imageResult.status === "fulfilled") {
          setPhotos(imageResult.value[`${kind}-${id}`] ?? []);
        } else {
          throw imageResult.reason;
        }
      } catch (cause: unknown) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load this photo gallery.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadGallery();

    return () => {
      active = false;
    };
  }, [rawKind, rawId, fallbackPlaceName]);

  const pageTitle = place?.name ?? fallbackPlaceName ?? "Community photos";
  const placeType = place?.typeLabel ??
    (rawKind === "terminal" ? "Terminal" : "Stop");

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/home", { replace: true });
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F6F8] text-gray-900">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back to map"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12395A]"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#58718A]">
              QRoute community photos
            </p>
            <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
              {pageTitle}
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center rounded-full bg-[#EAF1F8] px-3 py-1 text-xs font-semibold text-[#12395A]">
                {placeType}
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {pageTitle}
              </h2>
              {place?.description && (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                  {place.description}
                </p>
              )}
              {place && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <MapPin size={14} />
                  {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                </p>
              )}
            </div>

            {!loading && !error && (
              <div className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                <Images size={17} />
                <span>
                  {photos.length} approved {photos.length === 1 ? "photo" : "photos"}
                </span>
              </div>
            )}
          </div>
        </section>

        {loading && (
          <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="aspect-[4/3] animate-pulse rounded-xl bg-gray-200"
              />
            ))}
            <span className="sr-only">Loading community photos...</span>
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="rounded-xl border border-red-200 bg-white px-5 py-8 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-[#12395A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0D2B46]"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && photos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <Images size={22} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-800">
              No approved photos yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-500">
              Community photos for this location will appear here after they are approved.
            </p>
          </div>
        )}

        {!loading && !error && photos.length > 0 && (
          <section aria-label={`All approved photos of ${pageTitle}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-800">
                All community photos
              </h3>
              <p className="text-xs text-gray-500">
                {photos.length} {photos.length === 1 ? "photo" : "photos"}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo, index) => (
                <figure
                  key={photo.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <img
                    src={photo.url}
                    alt={
                      photo.caption?.trim()
                        ? `${pageTitle}: ${photo.caption.trim()}`
                        : `Photo ${index + 1} of ${pageTitle}`
                    }
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <figcaption className="px-3 py-2.5 text-sm text-gray-700">
                    {photo.caption?.trim() || `Community photo ${index + 1}`}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
