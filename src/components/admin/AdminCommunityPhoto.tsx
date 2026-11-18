import { useEffect, useState, type ImgHTMLAttributes } from "react";
import {
  isAdminCommunityPhotoUrl,
  loadAdminCommunityPhoto,
  releaseAdminCommunityPhoto,
} from "@/lib/adminPhoto";

type AdminCommunityPhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

export function AdminCommunityPhoto({ src, className, ...imgProps }: AdminCommunityPhotoProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminCommunityPhotoUrl(src)) return;

    let cancelled = false;
    let loadedUrl: string | null = null;

    loadAdminCommunityPhoto(src)
      .then((url) => {
        loadedUrl = url;
        if (cancelled) {
          releaseAdminCommunityPhoto(url);
          return;
        }
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setObjectUrl("");
      });

    return () => {
      cancelled = true;
      if (loadedUrl) releaseAdminCommunityPhoto(loadedUrl);
    };
  }, [src]);

  if (!isAdminCommunityPhotoUrl(src)) {
    return <img {...imgProps} src={src} className={className} />;
  }
  if (objectUrl === null) {
    return <div aria-hidden="true" className={`${className ?? ""} bg-slate-100`} />;
  }
  if (!objectUrl) return null;
  return <img {...imgProps} src={objectUrl} className={className} />;
}
