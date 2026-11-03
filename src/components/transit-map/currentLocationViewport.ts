import type { Map as LeafletMap } from "leaflet";

import type { Coordinates } from "./useTransitMap";

export function moveToCurrentLocation(
  map: Pick<LeafletMap, "flyTo">,
  position: Coordinates
): void {
  map.flyTo(position, 16);
}
