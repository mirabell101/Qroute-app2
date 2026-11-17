import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getAdminUnreadNotificationCount } from "@/lib/adminApi";
import { navigateToAdminDestination } from "@/pages/admin/adminNavigation";

interface AdminNotificationBellProps {
  adminUserId: string;
  refreshKey?: number;
  className?: string;
}

const DEFAULT_CLASS_NAME =
  "relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900";

export default function AdminNotificationBell({
  adminUserId,
  refreshKey = 0,
  className = DEFAULT_CLASS_NAME,
}: AdminNotificationBellProps) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!adminUserId) return;

    let active = true;
    getAdminUnreadNotificationCount(adminUserId)
      .then((count) => {
        if (active) setUnreadCount(count);
      })
      .catch(() => {
        if (active) {
          setUnreadCount(null);
          setLoadFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [adminUserId, refreshKey]);

  const title = loadFailed
    ? "Notifications could not be loaded"
    : unreadCount === null
      ? "Notifications"
      : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`;

  return (
    <button
      type="button"
      aria-label="Notifications"
      title={title}
      onClick={() => navigateToAdminDestination("Notifications", navigate)}
      className={className}
    >
      <Bell size={19} />
      {typeof unreadCount === "number" && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white shadow-sm">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
