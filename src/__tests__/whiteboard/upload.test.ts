/**
 * @jest-environment jsdom
 *
 * Hermetic coverage for whiteboard blob upload token retries — the failure
 * mode where page 3 of a multi-page PDF hits "Failed to retrieve the
 * client token" under burst mint load.
 */

const shouldUseHarnessMock = jest.fn(() => false);
const uploadViaHarnessMock = jest.fn();
const vercelUploadMock = jest.fn();

jest.mock("@/lib/blob-harness-client-upload", () => ({
  shouldUseBlobHarnessClientUpload: () => shouldUseHarnessMock(),
  uploadViaBlobHarness: (...args: unknown[]) => uploadViaHarnessMock(...args),
}));

jest.mock("@vercel/blob/client", () => ({
  upload: (...args: unknown[]) => vercelUploadMock(...args),
}));

import {
  uploadWhiteboardAsset,
  WHITEBOARD_UPLOAD_TOKEN_BACKOFFS_MS,
} from "@/lib/whiteboard/upload";
import { insertPdfPagesOnCanvas, type ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";

const TOKEN_ERR = new Error("Vercel Blob: Failed to retrieve the client token");

function makeFakeApi(): ExcalidrawApiLike {
  let current: unknown[] = [];
  return {
    getSceneElements: () => current,
    getAppState: () => ({
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 800,
      zoom: { value: 1 },
    }),
    addFiles: () => undefined,
    updateScene: ({ elements }) => {
      current = elements as unknown[];
    },
    scrollToContent: () => undefined,
  };
}

function makePdfPage(pageIndex: number) {
  return {
    pageIndex,
    widthPx: 800,
    heightPx: 1100,
    pngBlob: new Blob([`page-${pageIndex}`], { type: "image/png" }),
  };
}

describe("whiteboard upload token retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    shouldUseHarnessMock.mockReturnValue(false);
    uploadViaHarnessMock.mockReset();
    vercelUploadMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("WHITEBOARD_UPLOAD_TOKEN_BACKOFFS_MS exposes four attempts", () => {
    expect(WHITEBOARD_UPLOAD_TOKEN_BACKOFFS_MS).toEqual([0, 400, 1_200, 2_400]);
  });

  test("retries token mint failures and succeeds on third SDK attempt", async () => {
    vercelUploadMock
      .mockRejectedValueOnce(TOKEN_ERR)
      .mockRejectedValueOnce(TOKEN_ERR)
      .mockResolvedValueOnce({ url: "https://blob.example/page3.png" });

    const promise = uploadWhiteboardAsset({
      whiteboardSessionId: "wb-1",
      studentId: "stu-1",
      blob: new Blob(["png"], { type: "image/png" }),
      filename: "doc-p3.png",
      contentType: "image/png",
      assetTag: "pdf-page-3",
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blobUrl).toBe("https://blob.example/page3.png");
    }
    expect(vercelUploadMock).toHaveBeenCalledTimes(3);
  });

  test("does not retry non-token errors", async () => {
    vercelUploadMock.mockRejectedValueOnce(new Error("content_type_not_allowed"));

    const promise = uploadWhiteboardAsset({
      whiteboardSessionId: "wb-1",
      studentId: "stu-1",
      blob: new Blob(["png"], { type: "image/png" }),
      filename: "bad.png",
      contentType: "image/png",
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(vercelUploadMock).toHaveBeenCalledTimes(1);
  });

  test("harness mint path retries token failures", async () => {
    shouldUseHarnessMock.mockReturnValue(true);
    uploadViaHarnessMock
      .mockRejectedValueOnce(TOKEN_ERR)
      .mockResolvedValueOnce({
        url: "https://blob.harness/page.png",
        pathname: "whiteboard-sessions/stu/wb/assets/x.png",
      });

    const promise = uploadWhiteboardAsset({
      whiteboardSessionId: "wb-1",
      studentId: "stu-1",
      blob: new Blob(["png"], { type: "image/png" }),
      filename: "doc-p1.png",
      contentType: "image/png",
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(uploadViaHarnessMock).toHaveBeenCalledTimes(2);
    expect(vercelUploadMock).not.toHaveBeenCalled();
  });

  test("insertPdfPagesOnCanvas completes 3 pages when page 3 token fails twice", async () => {
    jest.useRealTimers();
    vercelUploadMock
      .mockResolvedValueOnce({ url: "https://blob.example/p1.png" })
      .mockResolvedValueOnce({ url: "https://blob.example/p2.png" })
      .mockRejectedValueOnce(TOKEN_ERR)
      .mockRejectedValueOnce(TOKEN_ERR)
      .mockResolvedValueOnce({ url: "https://blob.example/p3.png" });

    const result = await insertPdfPagesOnCanvas({
      excalidrawAPI: makeFakeApi(),
      whiteboardSessionId: "wb-1",
      studentId: "stu-1",
      filename: "worksheet.pdf",
      pages: [makePdfPage(1), makePdfPage(2), makePdfPage(3)],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pagesInserted).toBe(3);
      expect(result.assetUrls).toEqual([
        "https://blob.example/p1.png",
        "https://blob.example/p2.png",
        "https://blob.example/p3.png",
      ]);
    }
    expect(vercelUploadMock).toHaveBeenCalledTimes(5);
  }, 15_000);
});
