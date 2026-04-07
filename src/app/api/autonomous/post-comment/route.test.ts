import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: vi.fn(),
    getAccessTokenForConnection: vi.fn(),
  },
}));
vi.mock("@/lib/fga", () => ({ checkPermission: vi.fn() }));
vi.mock("@/lib/ciba-direct", () => ({ requestCIBAApproval: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn() }));

// Import AFTER mocks
import { POST } from "./route";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { logAction } from "@/lib/audit";
import { generateText } from "ai";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/autonomous/post-comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseItem = {
  id: "gh-1",
  type: "github",
  title: "PR #42 needs review",
  description: "A pull request awaiting comment",
  urgency: "yellow",
  age: "2 days ago",
  source: "octocat/hello-world",
  actionLabel: "Comment",
  meta: {
    owner: "octocat",
    repo: "hello-world",
    number: "42",
    url: "https://github.com/octocat/hello-world/pull/42",
  },
};

describe("POST /api/autonomous/post-comment", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    (auth0.getSession as any).mockResolvedValue({
      user: { sub: "user-123", name: "Test User" },
    });
    (auth0.getAccessTokenForConnection as any).mockResolvedValue({
      token: "gh-token-abc",
    });
    (checkPermission as any).mockResolvedValue(true);
    (requestCIBAApproval as any).mockResolvedValue({ approved: true });
    (logAction as any).mockResolvedValue(undefined);
    (generateText as any).mockResolvedValue({
      text: "Thanks for the detailed write-up! I'll take a look shortly.",
    });
  });

  it("returns 401 if no session", async () => {
    (auth0.getSession as any).mockResolvedValue(null);

    const res = await POST(
      makeRequest({ item: baseItem, params: { body_hint: "Looks good" } })
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("returns 403 if github.can_comment permission is missing", async () => {
    (checkPermission as any).mockResolvedValue(false);

    const res = await POST(
      makeRequest({ item: baseItem, params: { body_hint: "Looks good" } })
    );

    expect(res.status).toBe(403);
    expect(checkPermission).toHaveBeenCalledWith(
      "user-123",
      "github",
      "can_comment"
    );
    const json = await res.json();
    expect(json.error).toMatch(/permission/i);
  });

  it("returns 400 if item is missing", async () => {
    const res = await POST(makeRequest({ params: { body_hint: "hi" } }));

    expect(res.status).toBe(400);
  });

  it("returns 400 if params is missing", async () => {
    const res = await POST(makeRequest({ item: baseItem }));

    expect(res.status).toBe(400);
  });

  it("returns 400 if item.meta is missing owner", async () => {
    const bad = {
      ...baseItem,
      meta: { repo: "hello-world", number: "42" },
    };
    const res = await POST(
      makeRequest({ item: bad, params: { body_hint: "hi" } })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if item.meta is missing repo", async () => {
    const bad = {
      ...baseItem,
      meta: { owner: "octocat", number: "42" },
    };
    const res = await POST(
      makeRequest({ item: bad, params: { body_hint: "hi" } })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if item.meta is missing number", async () => {
    const bad = {
      ...baseItem,
      meta: { owner: "octocat", repo: "hello-world" },
    };
    const res = await POST(
      makeRequest({ item: bad, params: { body_hint: "hi" } })
    );
    expect(res.status).toBe(400);
  });

  it("returns { approved: false } if CIBA denied", async () => {
    (requestCIBAApproval as any).mockResolvedValue({
      approved: false,
      error: "User denied the request",
    });

    const res = await POST(
      makeRequest({ item: baseItem, params: { body_hint: "Looks good" } })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approved).toBe(false);
    expect(json.error).toBeTruthy();
  });

  it("returns { approved: true, success: true } when flow succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        html_url:
          "https://github.com/octocat/hello-world/pull/42#issuecomment-100",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeRequest({ item: baseItem, params: { body_hint: "Looks good" } })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approved).toBe(true);
    expect(json.success).toBe(true);
    expect(json.commentUrl).toBe(
      "https://github.com/octocat/hello-world/pull/42#issuecomment-100"
    );

    // Verify GitHub API call was made correctly
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/octocat/hello-world/issues/42/comments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gh-token-abc",
        }),
      })
    );

    vi.unstubAllGlobals();
  });

  it("sanitizes the CIBA binding message to <= 64 chars and allowed chars only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: "https://github.com/x/y#c" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Use item whose owner/repo/number combined would still fit
    const item = {
      ...baseItem,
      meta: {
        owner: "octocat",
        repo: "hello-world",
        number: "42",
        url: "https://github.com/octocat/hello-world/pull/42",
      },
    };

    await POST(
      makeRequest({ item, params: { body_hint: "Please review!" } })
    );

    expect(requestCIBAApproval).toHaveBeenCalledTimes(1);
    const call = (requestCIBAApproval as any).mock.calls[0][0];
    const bindingMessage = call.bindingMessage as string;

    expect(bindingMessage.length).toBeLessThanOrEqual(64);
    expect(bindingMessage.length).toBeGreaterThan(0);
    // Only allowed chars: [a-zA-Z0-9\s+\-_.,:#@]
    expect(bindingMessage).toMatch(/^[a-zA-Z0-9\s+\-_.,:#@/]+$/);
    // Must reference owner/repo#number
    expect(bindingMessage).toContain("octocat/hello-world#42");

    vi.unstubAllGlobals();
  });

  it("sanitizes binding message even when owner/repo contain unsafe chars (truncates to 64)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: "https://github.com/x/y#c" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Make an item with very long names to force sanitization + truncation
    const longItem = {
      ...baseItem,
      meta: {
        owner: "very-long-organization-name-here",
        repo: "equally-very-long-repository-name-for-testing",
        number: "9999",
        url: "https://example.com",
      },
    };

    await POST(
      makeRequest({ item: longItem, params: { body_hint: "test" } })
    );

    const call = (requestCIBAApproval as any).mock.calls[0][0];
    const bindingMessage = call.bindingMessage as string;

    expect(bindingMessage.length).toBeLessThanOrEqual(64);
    expect(bindingMessage).toMatch(/^[a-zA-Z0-9\s+\-_.,:#@/]+$/);

    vi.unstubAllGlobals();
  });

  it("generates the comment body using the body_hint from suggestion params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: "https://github.com/x/y#c" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      makeRequest({
        item: baseItem,
        params: { body_hint: "Ship it — looks great to me" },
      })
    );

    expect(generateText).toHaveBeenCalledTimes(1);
    const genCall = (generateText as any).mock.calls[0][0];
    expect(genCall.prompt).toContain("Ship it — looks great to me");
    // Should mention short / 1-2 sentences / professional tone cues
    expect(genCall.prompt.toLowerCase()).toMatch(/short|concise|1-2|professional/);

    // Verify the generated text was passed as body to GitHub
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const ghCall = fetchMock.mock.calls[0];
    const ghBody = JSON.parse(ghCall[1].body);
    expect(ghBody.body).toBe(
      "Thanks for the detailed write-up! I'll take a look shortly."
    );

    vi.unstubAllGlobals();
  });

  it("returns approved: true, success: false when GitHub API call fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeRequest({ item: baseItem, params: { body_hint: "Looks good" } })
    );

    const json = await res.json();
    expect(json.approved).toBe(true);
    expect(json.success).toBe(false);
    expect(json.error).toBeTruthy();

    vi.unstubAllGlobals();
  });
});
