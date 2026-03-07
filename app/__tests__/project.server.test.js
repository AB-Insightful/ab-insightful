
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";

//prisma mocks
const updateMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("../db.server", () => {
  return {
    default: {
      project: {
        update: updateMock,
        findUnique: findUniqueMock,
      },
    },
  };
});

let setEmailNotifToggle;
let getEmailNotifToggle;

beforeAll(async () => {
  //Adjust to your real module location
  const mod = await import("../services/project.server.js");
  setEmailNotifToggle = mod.setEmailNotifToggle;
  getEmailNotifToggle = mod.getEmailNotifToggle;
});

describe("project.server.js", () => {
  beforeEach(() => {
    updateMock.mockReset();
    findUniqueMock.mockReset();
  });

  it("setEmailNotifToggle updates emailNotifEnabled for the default project_id=1", async () => {
    const fakeUpdatedProject = { id: 1, emailNotifEnabled: true };
    updateMock.mockResolvedValue(fakeUpdatedProject);

    const result = await setEmailNotifToggle(true); // project_id defaults to 1

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { emailNotifEnabled: true },
    });

    expect(result).toEqual(fakeUpdatedProject);
  });

  it("setEmailNotifToggle updates emailNotifEnabled for a provided project_id", async () => {
    const fakeUpdatedProject = { id: 7, emailNotifEnabled: false };
    updateMock.mockResolvedValue(fakeUpdatedProject);

    const result = await setEmailNotifToggle(false, 7);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { emailNotifEnabled: false },
    });

    expect(result).toEqual(fakeUpdatedProject);
  });

  it("setEmailNotifToggle propagates db errors", async () => {
    updateMock.mockRejectedValue(new Error("DB update failed"));

    await expect(setEmailNotifToggle(true, 1)).rejects.toThrow("DB update failed");
  });

  it("getEmailNotifToggle returns the boolean value when project exists (default notifId=1)", async () => {
    findUniqueMock.mockResolvedValue({ emailNotifEnabled: true });

    const result = await getEmailNotifToggle(); // defaults to 1

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { emailNotifEnabled: true },
    });

    expect(result).toBe(true);
  });

  it("getEmailNotifToggle returns false when project exists and toggle is false", async () => {
    findUniqueMock.mockResolvedValue({ emailNotifEnabled: false });

    const result = await getEmailNotifToggle(3);

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 3 },
      select: { emailNotifEnabled: true },
    });

    expect(result).toBe(false);
  });

  it("getEmailNotifToggle returns null and logs when project is not found", async () => {
    findUniqueMock.mockResolvedValue(null);
    // function for checking logs
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await getEmailNotifToggle(999);

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    expect(logSpy).toHaveBeenCalledWith("Failed to find getEmailNotifToggle() value");

    logSpy.mockRestore();
  });

  it("getEmailNotifToggle propagates db errors", async () => {
    findUniqueMock.mockRejectedValue(new Error("DB read failed"));

    await expect(getEmailNotifToggle(1)).rejects.toThrow("DB read failed");
  });
});