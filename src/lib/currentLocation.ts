import type { Coordinates } from "@/components/transit-map/useTransitMap";

const locationOptions: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

function getLocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission denied. Enable it in your browser settings.";
    case error.POSITION_UNAVAILABLE:
      return "Your current location is unavailable.";
    case error.TIMEOUT:
      return "Location request timed out. Please try again.";
    default:
      return "Unable to determine your current location.";
  }
}

export function createCurrentLocationRequester(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | null
): () => Promise<Coordinates> {
  let inFlight: Promise<Coordinates> | null = null;

  return () => {
    if (!geolocation) {
      return Promise.reject(
        new Error("Your browser does not support location access.")
      );
    }

    if (inFlight) return inFlight;

    inFlight = new Promise<Coordinates>((resolve, reject) => {
      geolocation.getCurrentPosition(
        ({ coords }) => resolve([coords.latitude, coords.longitude]),
        (error) => reject(new Error(getLocationErrorMessage(error))),
        locationOptions
      );
    }).finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}
