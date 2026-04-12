import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/cookie.server", () => ({
    getUserbyID: vi.fn(),
    createUser: vi.fn(),
    updateLatestSession: vi.fn(),
}));

import {
    getUserbyID,
    createUser,
    updateLatestSession,
} from "../services/cookie.server";

import { loader, action } from "../routes/api.pixel.jsx";

describe("api.pixel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "log").mockImplementation(() => {});
});

it("returns 204 for loader OPTIONS", async () => {
    const request = new Request("http://localhost/api/pixel", {
    method: "OPTIONS",
    headers: {
        Origin: "http://example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    },
    });

    const response = await loader({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://example.com",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
    "POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
    "Content-Type",
    );
    expect(response.headers.get("Access-Control-Allow-Private-Network")).toBe(
    "true",
    );
});

it("returns 400 for loader GET when customer_id is missing", async () => {
    const request = new Request("http://localhost/api/pixel", {
    method: "GET",
    headers: {
        Origin: "http://example.com",
    },
    });

    const response = await loader({ request });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "must supply an id" });
    expect(getUserbyID).not.toHaveBeenCalled();
});

it("returns 404 for GET when user is not found", async () => {
    vi.mocked(getUserbyID).mockResolvedValue(null);

    const request = new Request(
    "http://localhost/api/pixel?customer_id=abc123",
    {
        method: "GET",
        headers: {
        Origin: "http://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type",
        },
    },
    );

    const response = await loader({ request });

    expect(getUserbyID).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://example.com",
    );
});

it("returns 200 for loader GET when user exists", async () => {
    const mockUser = {
    id: 1,
    shopifyCustomerID: "abc123",
    latestSession: "sess_1",
    };

    vi.mocked(getUserbyID).mockResolvedValue(mockUser);

    const request = new Request(
    "http://localhost/api/pixel?customer_id=abc123",
    {
        method: "GET",
        headers: {
        Origin: "http://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type",
        },
    },
    );

    const response = await loader({ request });
    const body = await response.json();

    expect(getUserbyID).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(200);
    expect(body).toEqual(mockUser);
});

it("returns 204 for action OPTIONS", async () => {
    const request = new Request("http://localhost/api/pixel", {
    method: "OPTIONS",
    headers: {
        Origin: "http://example.com",
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "Content-Type",
    },
    });

    const response = await action({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://example.com",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
    "PATCH, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
    "Content-Type",
    );
    expect(response.headers.get("Access-Control-Allow-Private-Network")).toBe(
    "true",
    );
});

it("returns 400 for POST with non-json content type", async () => {
    const request = new Request("http://localhost/api/pixel", {
    method: "POST",
    headers: {
        Origin: "http://example.com",
        "Content-Type": "text/plain",
    },
    body: "hello",
    });

    const response = await action({ request });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Expected application/json" });
    expect(createUser).not.toHaveBeenCalled();
});

it("returns 201 for successful POST", async () => {
    const payload = {
    shopifyCustomerID: "cust_123",
    deviceType: "mobile",
    latestSession: "sess_123",
    };

    const createdUser = {
    id: 10,
    ...payload,
    };

    vi.mocked(createUser).mockResolvedValue(createdUser);

    const request = new Request("http://localhost/api/pixel", {
    method: "POST",
    headers: {
        Origin: "http://example.com",
        "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(createUser).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(201);
    expect(body).toEqual(createdUser);
});

it("returns 500 when POST createUser fails", async () => {
    const payload = {
    shopifyCustomerID: "cust_123",
    deviceType: "mobile",
    };

    vi.mocked(createUser).mockResolvedValue(null);

    const request = new Request("http://localhost/api/pixel", {
    method: "POST",
    headers: {
        Origin: "http://example.com",
        "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(createUser).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Could not create user." });
});

it("returns 400 for PATCH with non-json content type", async () => {
    const request = new Request("http://localhost/api/pixel", {
    method: "PATCH",
    headers: {
        Origin: "http://example.com",
        "Content-Type": "text/plain",
    },
    body: "hello",
    });

    const response = await action({ request });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Expected application/json" });
    expect(updateLatestSession).not.toHaveBeenCalled();
});

it("returns 400 for PATCH when required fields are missing", async () => {
    const payload = {
    shopifyCustomerID: "cust_123",
    };

    const request = new Request("http://localhost/api/pixel", {
    method: "PATCH",
    headers: {
        Origin: "http://example.com",
        "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
    error: "request was missing 'data' or 'customer id'",
    });
    expect(updateLatestSession).not.toHaveBeenCalled();
});

it("returns 500 when PATCH updateLatestSession fails", async () => {
    const payload = {
    shopifyCustomerID: "cust_123",
    latestSession: "sess_999",
    };

    vi.mocked(updateLatestSession).mockResolvedValue(null);

    const request = new Request("http://localhost/api/pixel", {
    method: "PATCH",
    headers: {
        Origin: "http://example.com",
        "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(updateLatestSession).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Could not update user." });
});

it("returns 200 for successful PATCH", async () => {
    const payload = {
    shopifyCustomerID: "cust_123",
    latestSession: "sess_999",
    };

    const updatedUser = {
    id: 10,
    ...payload,
    };

    vi.mocked(updateLatestSession).mockResolvedValue(updatedUser);

    const request = new Request("http://localhost/api/pixel", {
    method: "PATCH",
    headers: {
        Origin: "http://example.com",
        "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(updateLatestSession).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(200);
    expect(body).toEqual(updatedUser);
});

it("returns null for loader methods it does not handle", async () => {
    const request = new Request("http://localhost/api/pixel", {
        method: "DELETE",
    });

    const response = await loader({ request });

    expect(response).toBeNull();
    });

    it("uses default CORS fallback values for loader OPTIONS when request headers are missing", async () => {
    const request = new Request("http://localhost/api/pixel", {
        method: "OPTIONS",
    });

    const response = await loader({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
    );
    expect(response.headers.get("Access-Control-Allow-Private-Network")).toBe(
        "true",
    );
    });

    it("uses default CORS fallback values for action OPTIONS when request headers are missing", async () => {
    const request = new Request("http://localhost/api/pixel", {
        method: "OPTIONS",
    });

    const response = await action({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
    );
    expect(response.headers.get("Access-Control-Allow-Private-Network")).toBe(
        "true",
    );
    });

    it("returns 400 for POST when Content-Type header is missing", async () => {
    const request = new Request("http://localhost/api/pixel", {
        method: "POST",
        headers: {
        Origin: "http://example.com",
        },
        body: JSON.stringify({
        shopifyCustomerID: "cust_123",
        deviceType: "mobile",
        }),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Expected application/json" });
    expect(createUser).not.toHaveBeenCalled();
    });

    it("returns 400 for PATCH when latestSession is missing but customer id exists", async () => {
    const payload = {
        shopifyCustomerID: "cust_123",
        latestSession: "",
    };

    const request = new Request("http://localhost/api/pixel", {
        method: "PATCH",
        headers: {
        Origin: "http://example.com",
        "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
        error: "request was missing 'data' or 'customer id'",
    });
    expect(updateLatestSession).not.toHaveBeenCalled();
    });

    it("uses default Access-Control-Allow-Headers for loader GET success when request header list is missing", async () => {
    const mockUser = {
        id: 1,
        shopifyCustomerID: "abc123",
        latestSession: "sess_1",
    };

    vi.mocked(getUserbyID).mockResolvedValue(mockUser);

    const request = new Request(
        "http://localhost/api/pixel?customer_id=abc123",
        {
        method: "GET",
        headers: {
            Origin: "http://example.com",
        },
        },
    );

    const response = await loader({ request });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(mockUser);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
    );
    });
});