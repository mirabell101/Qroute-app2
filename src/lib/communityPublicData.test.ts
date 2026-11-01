import { describe, expect, it } from "vitest";
import { toPublicCommunityPost } from "./communityPublicData.ts";

describe("public Community post mapping", () => {
  it("keeps public display data while omitting account identifiers and private photo paths", () => {
    const post = toPublicCommunityPost({
      id: "post-1",
      author_display_name: "Rider",
      title: "Route question",
      content: "Is the station entrance open?",
      start_name: "North Terminal",
      start_latitude: 14.6,
      start_longitude: 121.0,
      destination_name: "Central Stop",
      destination_latitude: 14.61,
      destination_longitude: 121.01,
      transport_type_id: 2,
      transport_type: "Bus",
      created_at: "2026-11-01T08:00:00.000Z",
      comment_count: 1,
      upvotes: 3,
      downvotes: 1,
    });

    expect(post).toEqual({
      id: "post-1",
      author_display_name: "Rider",
      title: "Route question",
      content: "Is the station entrance open?",
      start_name: "North Terminal",
      start_latitude: 14.6,
      start_longitude: 121.0,
      destination_name: "Central Stop",
      destination_latitude: 14.61,
      destination_longitude: 121.01,
      transport_type_id: 2,
      transport_type: "Bus",
      photo_paths: [],
      photos: [],
      created_at: "2026-11-01T08:00:00.000Z",
      comment_count: 1,
      upvotes: 3,
      downvotes: 1,
    });
    expect(post).not.toHaveProperty("author_id");
  });
});
