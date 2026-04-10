import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useLoaderData, useFetcher } from "react-router";

const hoisted = vi.hoisted(() => ({
  boundaryHeadersMock: vi.fn(() => ({ "X-From-Mock": "1" })),
  toastShowMock: vi.fn(),
  /** Stable mock: vi.clearAllMocks() strips Vitest methods from setupTests' nested vi.fn() */
  authenticateAdminMock: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  default: {
    authenticate: { admin: hoisted.authenticateAdminMock },
  },
  authenticate: {
    admin: hoisted.authenticateAdminMock,
  },
}));

vi.mock("@shopify/shopify-app-react-router/server", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    boundary: {
      ...actual.boundary,
      headers: (...args) => hoisted.boundaryHeadersMock(...args),
    },
  };
});

vi.mock("react-router", () => ({
  useLoaderData: vi.fn(),
  useFetcher: vi.fn(),
}));

vi.mock("@shopify/app-bridge-react", () => ({
  useAppBridge: () => ({
    toast: { show: hoisted.toastShowMock },
  }),
}));

vi.mock("../contexts/DateRangeContext", () => ({
  useDateRange: () => ({ dateRange: { start: "2026-01-01", end: "2026-01-31" } }),
  formatDateForDisplay: (d) => d,
}));

function makeFormData(fields = {}) {
  const fd = new Map(Object.entries(fields));
  return {
    get: (key) => (fd.has(key) ? fd.get(key) : null),
  };
}

function makeRequest(fields = {}) {
  const fd = makeFormData(fields);
  return {
    formData: vi.fn().mockResolvedValue(fd),
  };
}

describe("headers", () => {
  it("delegates to boundary.headers", async () => {
    hoisted.boundaryHeadersMock.mockClear();
    vi.resetModules();
    const { headers } = await import("../routes/app._index.jsx");
    const arg = { request: {} };
    const out = headers(arg);
    expect(hoisted.boundaryHeadersMock).toHaveBeenCalledWith(arg);
    expect(out).toEqual({ "X-From-Mock": "1" });
  });
});

describe("loader", () => {
  beforeEach(() => {
    hoisted.authenticateAdminMock.mockReset();
    hoisted.authenticateAdminMock.mockResolvedValue({
      admin: {},
      session: { shop: "my-store.myshopify.com" },
    });
  });

  it("returns placeholder experiment and empty table when no experiments exist", async () => {
    vi.resetModules();
    vi.doMock("../services/extension.server", () => ({
      updateWebPixel: vi.fn().mockResolvedValue(undefined),
      updateAppUrlMetafield: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../services/tutorialData.server", () => ({
      getTutorialData: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("../services/session.server", () => ({
      webPixelNotNull: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock("../services/experiment.server", () => ({
      getMostRecentExperiment: vi.fn().mockResolvedValue(null),
      getExperimentReportData: vi.fn().mockResolvedValue(null), 
      getNameOfExpGoal: vi.fn().mockResolvedValue({}),         
      getImprovement: vi.fn().mockResolvedValue(0),
      getAnalysis: vi.fn().mockResolvedValue(null),
    }));

    const { loader } = await import("../routes/app._index.jsx");
    const result = await loader({ request: {} });

    expect(result.shop).toBe("my-store");
    expect(result.tableData).toEqual([]);
    expect(result.experiment).toMatchObject({
      name: "No experiments found",
      variants: [],
      status: "N/A",
    });
    expect(result.tutorialData.webPixelStatus).toBe(false);
    expect(result.tutorialData.allSetupDone).toBe(false);
  });

  it("builds tableData and sets experimentGoal when experiment exists", async () => {
    const latest = {
      id: 42,
      name: "Exp A",
      variants: [
        { id: 10, name: "Control" },
        { id: 11, name: "Variant B" },
      ],
      status: "Active",
      createdAt: new Date("2026-01-01"),
    };
    const report = {
      name: "Exp A",
      variants: latest.variants,
      status: "Active",
      analyses: [],
    };

    vi.resetModules();
    vi.doMock("../services/extension.server", () => ({
      updateWebPixel: vi.fn().mockResolvedValue(undefined),
      updateAppUrlMetafield: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../services/tutorialData.server", () => ({
      getTutorialData: vi.fn().mockResolvedValue({
        generalSettings: true,
        createExperiment: true,
        viewedListExperiment: true,
        viewedReportsPage: true,
        onSiteTracking: true,
      }),
    }));
    vi.doMock("../services/session.server", () => ({
      webPixelNotNull: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../services/experiment.server", () => ({
      getMostRecentExperiment: vi.fn().mockResolvedValue(latest),
      getExperimentReportData: vi.fn().mockResolvedValue({ ...report }),
      getNameOfExpGoal: vi.fn().mockResolvedValue({ goal: { name: "Add to cart" } }),
      getImprovement: vi.fn().mockResolvedValue(0.08),
      getAnalysis: vi.fn().mockImplementation(async (_expId, variantId) => {
        if (variantId === 11) return null;
        return {
          variantId,
          totalConversions: 5,
          totalUsers: 100,
          probabilityOfBeingBest: 0.55,
        };
      }),
    }));
    vi.doMock("../services/variant.server", () => ({
      getVariants: vi.fn().mockResolvedValue(latest.variants),
    }));

    const { loader } = await import("../routes/app._index.jsx");
    const result = await loader({ request: {} });

    expect(result.shop).toBe("my-store");
    expect(result.experiment.experimentGoal).toBe("Add to cart");
    expect(result.experiment.expId).toBe(42);
    expect(result.tableData).toHaveLength(1);
    expect(result.tableData[0]).toMatchObject({
      variantName: "Control",
      isBaseline: true,
      improvement: 0.08,
    });
  });

  it("uses found nothing when goal name is missing", async () => {
    const latest = {
      id: 7,
      name: "Exp B",
      variants: [{ id: 1, name: "Only" }],
      status: "Active",
      createdAt: new Date(),
    };

    vi.resetModules();
    vi.doMock("../services/extension.server", () => ({
      updateWebPixel: vi.fn().mockResolvedValue(undefined),
      updateAppUrlMetafield: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../services/tutorialData.server", () => ({
      getTutorialData: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock("../services/session.server", () => ({
      webPixelNotNull: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../services/experiment.server", () => ({
      getMostRecentExperiment: vi.fn().mockResolvedValue(latest),
      getExperimentReportData: vi.fn().mockResolvedValue({
        name: latest.name,
        variants: latest.variants,
        status: "Active",
        analyses: [],
      }),
      getNameOfExpGoal: vi.fn().mockResolvedValue({}),
      getImprovement: vi.fn().mockResolvedValue(0),
      getAnalysis: vi.fn().mockResolvedValue({
        variantId: 1,
        totalConversions: 1,
        totalUsers: 1,
        probabilityOfBeingBest: 0.5,
      }),
    }));
    vi.doMock("../services/variant.server", () => ({
      getVariants: vi.fn().mockResolvedValue(latest.variants),
    }));

    const { loader } = await import("../routes/app._index.jsx");
    const result = await loader({ request: {} });

    expect(result.experiment.experimentGoal).toBe("found nothing");
  });
});

describe("action", () => {
  beforeEach(() => {
    hoisted.authenticateAdminMock.mockReset();
    hoisted.authenticateAdminMock.mockResolvedValue({
      admin: {},
      session: { shop: "s.myshopify.com", id: "sess" },
    });
  });

  it("enableTracking returns success when registerWebPixel ok", async () => {
    vi.resetModules();
    vi.doMock("../services/extension.server", () => ({
      registerWebPixel: vi.fn().mockResolvedValue({ ok: true }),
    }));
    const { action } = await import("../routes/app._index.jsx");
    const request = makeRequest({ action: "enableTracking" });
    const result = await action({ request });
    expect(result).toEqual({
      success: true,
      message: "Tracking enabled successfully",
    });
  });

  it("enableTracking returns failure when registerWebPixel not ok", async () => {
    vi.resetModules();
    vi.doMock("../services/extension.server", () => ({
      registerWebPixel: vi.fn().mockResolvedValue({ ok: false }),
    }));
    const { action } = await import("../routes/app._index.jsx");
    const request = makeRequest({ action: "enableTracking" });
    const result = await action({ request });
    expect(result).toEqual({
      success: false,
      message: "Tracking could not be enabled",
    });
  });

  it("verifyAppEmbed sets on-site tracking and returns success when enabled", async () => {
    const setOnSiteTracking = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/appEmbed.server", () => ({
      verifyAppEmbed: vi.fn().mockResolvedValue({
        isEnabled: true,
        themeName: "Dawn",
      }),
    }));
    vi.doMock("../services/tutorialData.server", () => ({
      setOnSiteTracking,
    }));
    const { action } = await import("../routes/app._index.jsx");
    const request = makeRequest({ action: "verifyAppEmbed" });
    const result = await action({ request });
    expect(setOnSiteTracking).toHaveBeenCalledWith(1, true);
    expect(result).toMatchObject({
      success: true,
      themeName: "Dawn",
    });
    expect(result.message).toContain("Dawn");
  });

  it("verifyAppEmbed returns error payload when embed not enabled", async () => {
    vi.resetModules();
    vi.doMock("../services/appEmbed.server", () => ({
      verifyAppEmbed: vi.fn().mockResolvedValue({
        isEnabled: false,
        themeName: "Craft",
      }),
    }));
    vi.doMock("../services/tutorialData.server", () => ({
      setOnSiteTracking: vi.fn(),
    }));
    const { action } = await import("../routes/app._index.jsx");
    const request = makeRequest({ action: "verifyAppEmbed" });
    const result = await action({ request });
    expect(result.success).toBe(false);
    expect(result.themeName).toBe("Craft");
    expect(result.error).toContain("Craft");
  });

  it("returns unknown error for unrecognized action", async () => {
    vi.resetModules();
    const { action } = await import("../routes/app._index.jsx");
    const request = makeRequest({ action: "nope" });
    const result = await action({ request });
    expect(result).toEqual({ sucess: false, error: "Unknown error occurred" });
  });
});

describe("Index Component - Happy Path", () => {
  let Index;

  beforeEach(async () => {
    vi.resetAllMocks();
    hoisted.toastShowMock.mockClear();
    const mod = await import("../routes/app._index.jsx");
    Index = mod.default;
    useFetcher.mockReturnValue({ state: "idle", data: null, submit: vi.fn() });
  });

  const baseTutorialDone = {
    allSetupDone: true,
    webPixelStatus: true,
    onSiteTracking: true,
  };

  it("renders correctly with experiment data", () => {
    useLoaderData.mockReturnValue({
      shop: "myshop",
      experiment: {
        name: "Main A/B Test",
        expId: 99,
        variants: [{ id: 1, name: "Original" }, { id: 2, name: "Red Button" }],
        status: "Active",
        createdAt: "2026-01-01T12:00:00Z",
        analyses: [
          {
            calculatedWhen: new Date("2026-01-05"),
            variant: { name: "Original" },
            probabilityOfBeingBest: 0.45,
            expectedLoss: 0.01,
          },
        ],
        experimentGoal: "Purchase",
      },
      tableData: [
        {
          variantName: "Original",
          totalConversions: 50,
          totalUsers: 1000,
          improvement: 0,
          probabilityOfBeingBest: 0.45,
        },
      ],
      tutorialData: baseTutorialDone,
    });

    render(<Index />);

    expect(screen.getByText("Main A/B Test")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("50/1000")).toBeInTheDocument();
    expect(screen.getByText("45.0%")).toBeInTheDocument();
    expect(screen.queryByText("Mandatory Setup")).not.toBeInTheDocument();
  });

  it("renders second table row with formatted improvement", () => {
    useLoaderData.mockReturnValue({
      shop: "myshop",
      experiment: {
        name: "Exp",
        expId: 1,
        variants: [
          { id: 10, name: "A" },
          { id: 20, name: "B" },
        ],
        status: "Active",
        createdAt: "2026-01-01T12:00:00Z",
        analyses: [],
        experimentGoal: "G",
      },
      tableData: [
        {
          variantName: "A",
          totalConversions: 1,
          totalUsers: 10,
          improvement: 0,
          probabilityOfBeingBest: 0.5,
        },
        {
          variantName: "B",
          totalConversions: 2,
          totalUsers: 10,
          improvement: 0.12,
          probabilityOfBeingBest: 0.6,
        },
      ],
      tutorialData: baseTutorialDone,
    });

    render(<Index />);
    expect(screen.getByText("Baseline")).toBeInTheDocument();
    expect(screen.getByText("+0.12%")).toBeInTheDocument();
  });

  it("shows Getting Started when allSetupDone is false", () => {
    useLoaderData.mockReturnValue({
      shop: "myshop",
      experiment: {
        name: "E",
        expId: 1,
        variants: [],
        status: "Active",
        createdAt: null,
        analyses: [],
        experimentGoal: "G",
      },
      tableData: [],
      tutorialData: {
        ...baseTutorialDone,
        allSetupDone: false,
        generalSettings: false,
        createExperiment: false,
        viewedListExperiment: false,
        viewedReportsPage: false,
      },
    });

    render(<Index />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
  });

  it("Open Theme Editor uses shop in admin URL when mandatory setup shows", () => {
    useLoaderData.mockReturnValue({
      shop: "coolshop",
      experiment: { name: "E", variants: [], analyses: [], experimentGoal: "G", status: "S", createdAt: null },
      tableData: [],
      tutorialData: { webPixelStatus: false, onSiteTracking: false },
    });

    render(<Index />);
    const btn = screen.getByRole("button", { name: /Open Theme Editor/i });
    expect(btn.getAttribute("href")).toContain("admin.shopify.com/store/coolshop/themes");
  });

  it("hides Mandatory Setup when pixel and embed are satisfied", () => {
    useLoaderData.mockReturnValue({
      shop: "myshop",
      experiment: {
        name: "E",
        expId: 1,
        variants: [{ name: "V" }],
        analyses: [],
        experimentGoal: "G",
        status: "Active",
        createdAt: null,
      },
      tableData: [
        { variantName: "V", totalConversions: 1, totalUsers: 2, improvement: 0, probabilityOfBeingBest: 0.5 },
      ],
      tutorialData: { allSetupDone: true, webPixelStatus: true, onSiteTracking: true },
    });

    render(<Index />);
    expect(screen.queryByText("Mandatory Setup")).not.toBeInTheDocument();
  });

  it("shows success toast when fetcher completes with success", async () => {
    useFetcher.mockReturnValue({
      state: "idle",
      data: { success: true, message: "Saved" },
      submit: vi.fn(),
    });
    useLoaderData.mockReturnValue({
      shop: "myshop",
      experiment: {
        name: "E",
        expId: 1,
        variants: [],
        analyses: [],
        experimentGoal: "G",
        status: "Active",
        createdAt: null,
      },
      tableData: [],
      tutorialData: baseTutorialDone,
    });

    render(<Index />);
    await waitFor(() => {
      expect(hoisted.toastShowMock).toHaveBeenCalledWith("Saved", expect.objectContaining({ duration: 3000 }));
    });
  });

  it("shows error toast when fetcher completes with failure", async () => {
    useFetcher.mockReturnValue({
      state: "idle",
      data: { success: false, error: "Nope" },
      submit: vi.fn(),
    });
    useLoaderData.mockReturnValue({
      shop: "myshop",
      experiment: {
        name: "E",
        expId: 1,
        variants: [],
        analyses: [],
        experimentGoal: "G",
        status: "Active",
        createdAt: null,
      },
      tableData: [],
      tutorialData: baseTutorialDone,
    });

    render(<Index />);
    await waitFor(() => {
      expect(hoisted.toastShowMock).toHaveBeenCalledWith(
        "Nope",
        expect.objectContaining({ duration: 5000, isError: true }),
      );
    });
  });

  it("renders Recharts container after client mount (isClient branch)", async () => {
    useLoaderData.mockReturnValue({
      shop: "myshop",
      experiment: {
        name: "E",
        expId: 1,
        variants: [{ id: 1, name: "V" }],
        status: "Active",
        createdAt: null,
        analyses: [
          {
            calculatedWhen: new Date("2026-01-10"),
            variant: { name: "V" },
            probabilityOfBeingBest: 0.5,
            expectedLoss: 0.02,
          },
        ],
        experimentGoal: "G",
      },
      tableData: [
        { variantName: "V", totalConversions: 1, totalUsers: 2, improvement: 0, probabilityOfBeingBest: 0.5 },
      ],
      tutorialData: baseTutorialDone,
    });

    render(<Index />);
    await waitFor(() => {
      expect(document.querySelector(".recharts-responsive-container")).toBeInTheDocument();
    });
  });

  describe("Index Component - Setup Tutorial Actions", () => {
    beforeEach(async () => {
      vi.resetAllMocks();
      hoisted.toastShowMock.mockClear();
      const mod = await import("../routes/app._index.jsx");
      Index = mod.default;
    });

    it("calls fetcher.submit when Enable Tracking is clicked", () => {
      const mockSubmit = vi.fn();
      useFetcher.mockReturnValue({
        state: "idle",
        data: null,
        submit: mockSubmit,
      });

      useLoaderData.mockReturnValue({
        experiment: { variants: [] },
        tableData: [],
        tutorialData: { webPixelStatus: false, onSiteTracking: false },
      });

      render(<Index />);

      const enableButton = screen.getByRole("button", { name: /Enable Tracking/i });
      fireEvent.click(enableButton);

      expect(mockSubmit).toHaveBeenCalledWith({ action: "enableTracking" }, { method: "POST" });
    });

    it('shows "Enabling..." text when the fetcher is submitting', () => {
      useFetcher.mockReturnValue({
        state: "submitting",
        formData: { get: (key) => (key === "action" ? "enableTracking" : null) },
        submit: vi.fn(),
      });

      useLoaderData.mockReturnValue({
        experiment: { variants: [] },
        tableData: [],
        tutorialData: { webPixelStatus: false, onSiteTracking: false },
      });

      render(<Index />);
      expect(screen.getByText("Enabling...")).toBeInTheDocument();
    });

    it("calls fetcher.submit for verifyAppEmbed when Verify Installation is clicked", () => {
      const mockSubmit = vi.fn();
      useFetcher.mockReturnValue({
        state: "idle",
        data: null,
        submit: mockSubmit,
      });

      useLoaderData.mockReturnValue({
        experiment: { variants: [] },
        tableData: [],
        tutorialData: { webPixelStatus: true, onSiteTracking: false },
      });

      render(<Index />);
      fireEvent.click(screen.getByRole("button", { name: /Verify Installation/i }));

      expect(mockSubmit).toHaveBeenCalledWith({ action: "verifyAppEmbed" }, { method: "POST" });
    });
  });
});
