import { supabase } from "@/lib/supabase";

/**
 * One shared Realtime topic for public transit-map invalidation.
 * The payload intentionally contains metadata only, never row data.
 */
export const MAP_SYNC_TOPIC = "qroute:public-map";
export const MAP_SYNC_EVENT = "map_changed";

export interface MapSyncNotification {
  entity: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
}

export type MapSyncConnectionStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | string;

function isMapSyncNotification(
  value: unknown,
): value is MapSyncNotification {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.entity === "string" &&
    (record.operation === "INSERT" ||
      record.operation === "UPDATE" ||
      record.operation === "DELETE")
  );
}

/**
 * Subscribe to committed changes affecting the public map.
 *
 * The channel is private and is authorized by a narrowly scoped SELECT
 * policy on realtime.messages. Clients cannot publish to this topic.
 */
export function subscribeToMapSync(
  onChange: (notification: MapSyncNotification) => void,
  onStatus?: (status: MapSyncConnectionStatus) => void,
): () => void {
  let closed = false;

  const channel = supabase
    .channel(MAP_SYNC_TOPIC, {
      config: {
        private: true,
      },
    })
    .on("broadcast", { event: MAP_SYNC_EVENT }, (message) => {
      if (closed || !isMapSyncNotification(message.payload)) {
        return;
      }

      onChange(message.payload);
    })
    .subscribe((status) => {
      if (!closed) {
        onStatus?.(status);
      }
    });

  return () => {
    closed = true;
    void supabase.removeChannel(channel);
  };
}
