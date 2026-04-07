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
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "mock-model") }));

// Import AFTER mocks
import { POST } from "./route";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { logAction } from "@/lib/audit";
import { generateText } from "ai";

// Build a test request
function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/autonomous/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validItem = {
  id: "le-1",
  type: "email" as const,
  title: "Project kickoff?",
  description: "Quick ping about the kickoff meeting",
  urgency: "yellow" as const,
  age: "2 days ago",
  source: "Alice <alice@example.com>",
  actionLabel: "Reply",
  meta: {
    from: "Alice <alice@example.com>",
    subject: "Project kickoff?",
    messageId: "gmail-msg-123",
    threadId: "thread-456",
    rfcMessageId: "<rfc-id@example.com>",
  },
};

const validParams = {
  to: "alice@example.com",
  subject: "Project kickoff?",
  body_hint: "Confirm that Tuesday 2pm works, and I'll send calendar invite.",
};

describe("POST /api/autonomous/send-email", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: session exists
    (auth0.getSession as any).mockResolvedValue({
      user: { sub: "auth0|user-1", name: "Me", email: "me@example.com" },
    });
    (auth0.getAccessTokenForConnection as any).mockResolvedValue({
      token: "google-token-abc",
    });
    (checkPermission as any).mockResolvedValue(true);
    (requestCIBAApproval as any).mockResolvedValue({ approved: true });
    (generateText as any).mockResolvedValue({
      text: "Hi Alice,\n\nTuesday 2pm works great. I'll send an invite.\n\nMe",
    });
    (logAction as any).mockResolvedValue(undefined);
  });

  it("returns 401 if no session", async () => {
    (auth0.getSession as any).mockResolvedValue(null);

    const res = await POST(makeReq({ item: validItem, params: validParams }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/unauthorized/i);
  });

  it("returns 403 if gmail.can_reply permission is missing", async () => {
    (checkPermission as any).mockResolvedValue(false);

    const res = await POST(makeReq({ item: validItem, params: validParams }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permission/i);
    // checkPermission must have been called with gmail + can_reply
    expect(checkPermission).toHaveBeenCalledWith(
      "auth0|user-1",
      "gmail",
      "can_reply",
    );
  });

  it("returns 400 if item param is missing", async () => {
    const res = await POST(makeReq({ params: validParams }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 if params object is missing", async () => {
    const res = await POST(makeReq({ item: validItem }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 if params.to is missing", async () => {
    const res = await POST(
      makeReq({
        item: validItem,
        params: { subject: "Hi", body_hint: "test" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if params.subject is missing", async () => {
    const res = await POST(
      makeReq({
        item: validItem,
        params: { to: "x@y.com", body_hint: "test" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns { approved: false } if CIBA denied", async () => {
    (requestCIBAApproval as any).mockResolvedValue({
      approved: false,
      error: "User denied the request",
    });
    // Make the email body fetch succeed but not crash
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: {} }),
      text: async () => "",
    }) as any;

    const res = await POST(makeReq({ item: validItem, params: validParams }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.approved).toBe(false);
    expect(data.error).toMatch(/denied/i);
  });

  it("returns { approved: true, success: true, messageId } when flow succeeds", async () => {
    // fetch gets called for: fetching email body, fetching profile, then sending email
    const fetchMock = vi.fn()
      // 1. Gmail messages/{id} fetch for email body context
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payload: {} }),
        text: async () => "",
      })
      // 2. Gmail profile fetch (for from address)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emailAddress: "me@example.com" }),
        text: async () => "",
      })
      // 3. Gmail messages/send
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "sent-msg-789" }),
        text: async () => "",
      });
    global.fetch = fetchMock as any;

    const res = await POST(makeReq({ item: validItem, params: validParams }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.approved).toBe(true);
    expect(data.success).toBe(true);
    expect(data.messageId).toBe("sent-msg-789");

    // verify the send call used POST to messages/send
    const sendCall = fetchMock.mock.calls.find((c: any[]) =>
      String(c[0]).includes("/messages/send"),
    );
    expect(sendCall).toBeTruthy();
    expect(sendCall![1].method).toBe("POST");
    // body should include raw MIME
    const sendBody = JSON.parse(sendCall![1].body);
    expect(sendBody.raw).toBeTruthy();
    expect(sendBody.threadId).toBe("thread-456");
  });

  it("returns { approved: true, success: false } if Gmail send fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payload: {} }),
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emailAddress: "me@example.com" }),
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "Gmail API error",
      });
    global.fetch = fetchMock as any;

    const res = await POST(makeReq({ item: validItem, params: validParams }));
    const data = await res.json();
    expect(data.approved).toBe(true);
    expect(data.success).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it("sanitizes the CIBA binding message and keeps it <= 64 chars", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: {} }),
      text: async () => "",
    }) as any;

    // Use params with special chars in subject that should be stripped
    const itemWithSpecials = {
      ...validItem,
      meta: {
        ...validItem.meta,
        from: "Alice O'Connor <alice@example.com>",
        subject: "Project kickoff?! [URGENT] — follow-up $$$",
      },
    };
    const paramsWithSpecials = {
      to: "alice@example.com",
      subject: "Project kickoff?! [URGENT] — follow-up $$$",
      body_hint: "confirm",
    };

    await POST(
      makeReq({ item: itemWithSpecials, params: paramsWithSpecials }),
    );

    expect(requestCIBAApproval).toHaveBeenCalledTimes(1);
    const call = (requestCIBAApproval as any).mock.calls[0][0];
    expect(call.bindingMessage).toBeTruthy();
    expect(call.bindingMessage.length).toBeLessThanOrEqual(64);
    // Must not contain special chars outside allowed set
    expect(call.bindingMessage).toMatch(/^[a-zA-Z0-9\s+\-_.,:#@]+$/);
    expect(call.userId).toBe("auth0|user-1");
    expect(call.timeoutSeconds).toBe(120);
  });

  it("binding message has form 'Send email to {name}: {subject}'", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: {} }),
      text: async () => "",
    }) as any;

    await POST(makeReq({ item: validItem, params: validParams }));

    const call = (requestCIBAApproval as any).mock.calls[0][0];
    expect(call.bindingMessage).toMatch(/Send email to/i);
    // Should mention Alice somewhere
    expect(call.bindingMessage.toLowerCase()).toContain("alice");
  });

  it("passes body_hint into the AI prompt used to generate the reply", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: {} }),
      text: async () => "",
    }) as any;

    const hint = "MY_UNIQUE_BODY_HINT_STRING_XYZ";
    await POST(
      makeReq({
        item: validItem,
        params: { ...validParams, body_hint: hint },
      }),
    );

    expect(generateText).toHaveBeenCalledTimes(1);
    const aiCall = (generateText as any).mock.calls[0][0];
    // Prompt should include the body hint so the model uses it
    expect(aiCall.prompt).toContain(hint);
  });

  it("returns 401 if Google connection is unavailable", async () => {
    (auth0.getAccessTokenForConnection as any).mockRejectedValue(
      new Error("not connected"),
    );

    const res = await POST(makeReq({ item: validItem, params: validParams }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/google/i);
  });
});
