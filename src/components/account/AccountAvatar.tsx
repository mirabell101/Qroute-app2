import { useState } from "react";
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
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const avatar = selectAccountAvatar(account, failedPhotoUrl);

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
          onError={() => setFailedPhotoUrl(avatar.url)}
        />
      ) : avatar.type === "initials" ? (
        <span className="text-sm font-semibold">{avatar.initials}</span>
      ) : (
        <UserCircle size={iconSize} strokeWidth={2} />
      )}
    </span>
  );
}
