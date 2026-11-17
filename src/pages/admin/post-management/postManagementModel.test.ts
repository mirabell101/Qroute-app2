import { beforeAll, describe, expect, it } from "vitest";

type PostManagementModelModule = typeof import("./postManagementModel");
let postManagementModel: PostManagementModelModule | null = null;

function getModel(): PostManagementModelModule {
  expect(postManagementModel).not.toBeNull();
  return postManagementModel!;
}

function post(
  overrides: Partial<{
    id: string;
    is_hidden: boolean;
    author_display_name: string;
    title: string;
    content: string;
    start_name: string;
    destination_name: string;
    transport_type: string | null;
  }> = {},
) {
  return {
    id: "post-1",
    is_hidden: false,
    author_display_name: "Alice",
    title: "Commute question",
    content: "Any advice?",
    start_name: "Start",
    destination_name: "Destination",
    transport_type: "Bus",
    ...overrides,
  };
}

describe("post management visibility model", () => {
  beforeAll(async () => {
    try {
      postManagementModel = await import("./postManagementModel");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Cannot find module")
      ) {
        throw error;
      }
    }
  });

  it("interprets the persisted is_hidden value", () => {
    const { getPostVisibility } = getModel();

    expect(getPostVisibility({ is_hidden: true })).toBe("Hidden");
    expect(getPostVisibility({ is_hidden: false })).toBe("Visible");
    expect(getPostVisibility({})).toBe("Visible");
  });

  it("applies a successful visibility change without mutating existing data", () => {
    const { applyPostVisibility } = getModel();
    const posts = [post(), post({ id: "post-2" })];

    const updated = applyPostVisibility(posts, "post-1", true);

    expect(updated.map((item) => [item.id, item.is_hidden])).toEqual([
      ["post-1", true],
      ["post-2", false],
    ]);
    expect(posts[0]?.is_hidden).toBe(false);
  });

  it("preserves search, transport, and visibility filtering", () => {
    const { filterCommunityPosts } = getModel();
    const posts = [
      post(),
      post({
        id: "post-2",
        title: "Hidden route",
        is_hidden: true,
        start_name: "Quezon",
      }),
      post({ id: "post-3", transport_type: "Train" }),
    ];

    expect(
      filterCommunityPosts(posts, {
        searchTerm: "Quezon",
        transportFilter: "All",
        statusFilter: "All",
      }).map((item) => item.id),
    ).toEqual(["post-2"]);

    expect(
      filterCommunityPosts(posts, {
        searchTerm: "",
        transportFilter: "Train",
        statusFilter: "Visible",
      }).map((item) => item.id),
    ).toEqual(["post-3"]);

    expect(
      filterCommunityPosts(posts, {
        searchTerm: "",
        transportFilter: "All",
        statusFilter: "Hidden",
      }).map((item) => item.id),
    ).toEqual(["post-2"]);
  });
});
