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
import { generateText } from "ai";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/autonomous/send-slack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseItem = {
  id: "slack-1",
  type: "slack" as const,
  title: "Can you review the PR draft?",
  description: "Message from @alice",
  urgency: "yellow" as const,
  age: "2 days ago",
  source: "@alice",
  actionLabel: "Reply",
  meta: {
    channel: "C01234567",
    ts: "1712000000.000100",
  },
};

describe("POST /api/autonomous/send-slack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default happy path wiring
    (auth0.getSession as any).mockResolvedValue({
      user: { sub: "user-abc", name: "Sam Jones" },
    });
    (checkPermission as any).mockResolvedValue(true);
    (auth0.getAccessTokenForConnection as any).mockResolvedValue({
      token: "slack-token-xyz",
    });
    (generateText as any).mockResolvedValue({ text: "on it, ill take a look shortly" });
    (requestCIBAApproval as any).mockResolvedValue({ approved: true });
    // default fetch mock (Slack API success)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ts: "1712000001.000200" }),
      text: async () => "",
    }) as any;
  });

  it("returns 401 if no session", async () => {
    (auth0.getSession as any).mockResolvedValue(null);
    const res = await POST(
      makeReq({ item: baseItem, params: { body_hint: "say yes" } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 if slack.can_send permission is missing", async () => {
    (checkPermission as any).mockResolvedValue(false);
    const res = await POST(
      makeReq({ item: baseItem, params: { body_hint: "say yes" } }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 if item missing", async () => {
    const res = await POST(makeReq({ params: { body_hint: "yo" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 if params missing (no channel)", async () => {
    const badItem = { ...baseItem, meta: { ts: "1712000000.000100" } };
    const res = await POST(
      makeReq({ item: badItem, params: { body_hint: "yo" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if params missing (no threadTs)", async () => {
    const badItem = { ...baseItem, meta: { channel: "C01234567" } };
    const res = await POST(
      makeReq({ item: badItem, params: { body_hint: "yo" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns { approved: false } if CIBA denied", async () => {
    (requestCIBAApproval as any).mockResolvedValue({
      approved: false,
      error: "User denied the request",
    });
    const res = await POST(
      makeReq({ item: baseItem, params: { body_hint: "say yes" } }),
    );
    const data = await res.json();
    expect(data.approved).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it("returns { approved: true, success: true } when flow succeeds", async () => {
    const res = await POST(
      makeReq({ item: baseItem, params: { body_hint: "say yes" } }),
    );
    const data = await res.json();
    expect(data.approved).toBe(true);
    expect(data.success).toBe(true);
    expect(data.messageTs).toBe("1712000001.000200");

    // Verify fetch called with correct Slack API payload
    const fetchCall = (global.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse(fetchCall[1].body);
    expect(body.channel).toBe("C01234567");
    expect(body.thread_ts).toBe("1712000000.000100");
    expect(body.text).toBe("on it, ill take a look shortly");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer slack-token-xyz");
  });

  it("sanitizes the CIBA binding message and keeps it under 64 chars", async () => {
    const longItem = {
      ...baseItem,
      title:
        "Can you please review the huge PR draft with !!! special chars? $$$ <> @#%",
    };
    await POST(
      makeReq({ item: longItem, params: { body_hint: "yes" } }),
    );
    const cibaArgs = (requestCIBAApproval as any).mock.calls[0][0];
    expect(cibaArgs.bindingMessage.length).toBeLessThanOrEqual(64);
    // Must only contain allowed chars: [a-zA-Z0-9\s+\-_.,:#@]
    expect(cibaArgs.bindingMessage).toMatch(/^[a-zA-Z0-9\s+\-_.,:#@]+$/);
    // Starts with the expected prefix
    expect(cibaArgs.bindingMessage).toMatch(/^Reply in Slack:/);
  });

  it("generates the message using body_hint from suggestion params", async () => {
    await POST(
      makeReq({
        item: baseItem,
        params: { body_hint: "confirm I'll review it tonight" },
      }),
    );
    expect(generateText).toHaveBeenCalled();
    const genCall = (generateText as any).mock.calls[0][0];
    expect(genCall.prompt).toContain("confirm I'll review it tonight");
  });
});
