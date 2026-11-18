
import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";

import type { AccountData } from "@/lib/accountApi";
import { selectAccountAvatar } from "./accountProfileModel";

interface AccountAvatarProps {
  account: AccountData | null;
  className: string;
  iconSize: number;
}

export default function AccountAvatar({
  account,
  className,
  iconSize,
}: AccountAvatarProps) {
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<string[]>([]);

  const uploadedPhotoUrl = account?.profilePhotoUrl ?? null;
  const googlePhotoUrl = account?.googleProfilePhotoUrl ?? null;

  useEffect(() => {
    setFailedPhotoUrls([]);
  }, [uploadedPhotoUrl, googlePhotoUrl]);

  const avatar = selectAccountAvatar(account, failedPhotoUrls);

  function handlePhotoError(url: string) {
    setFailedPhotoUrls((current) =>
      current.includes(url) ? current : [...current, url],
    );
  }

  return (
    <span
      role="img"
      aria-label={avatar.label}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
    >
      {avatar.type === "photo" ? (
        <img
          src={avatar.url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => handlePhotoError(avatar.url)}
        />
      ) : avatar.type === "initials" ? (
        <span className="text-sm font-semibold">
          {avatar.initials}
        </span>
      ) : (
        <UserCircle size={iconSize} strokeWidth={2} />
      )}
    </span>
  );
}
