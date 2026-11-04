const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_PHOTO_DATA_URL_LENGTH =
  Math.ceil((MAX_PROFILE_PHOTO_BYTES * 4) / 3) + 100;

export function getLegacyProfilePhotoFile(
  record: unknown,
  expectedUserId: string,
): File | null {
  if (
    typeof record !== "object" ||
    record === null ||
    Array.isArray(record) ||
    !("id" in record) ||
    record.id !== expectedUserId ||
    !("profilePicture" in record) ||
    typeof record.profilePicture !== "string" ||
    record.profilePicture.length > MAX_PROFILE_PHOTO_DATA_URL_LENGTH
  ) {
    return null;
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    record.profilePicture,
  );
  if (!match) return null;

  try {
    const binary = atob(match[2]);
    if (!binary.length || binary.length > MAX_PROFILE_PHOTO_BYTES) {
      return null;
    }

    const contents = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const extension = match[1] === "image/jpeg"
      ? "jpg"
      : match[1].slice("image/".length);
    return new File([contents], `profile-photo.${extension}`, {
      type: match[1],
    });
  } catch {
    return null;
  }
}
