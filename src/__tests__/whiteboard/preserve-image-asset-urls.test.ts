import { preserveImageAssetUrlsOnSceneWrite } from "@/lib/whiteboard/preserve-image-asset-urls";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

describe("preserveImageAssetUrlsOnSceneWrite", () => {
  it("re-stamps assetUrl from the page bucket when onChange strips customData", () => {
    const prev: ExcalidrawLikeElement[] = [
      {
        id: "img-1",
        type: "image",
        fileId: "f1",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        customData: { assetUrl: "https://blob.example/a.png" },
      } as ExcalidrawLikeElement,
    ];
    const incoming: ExcalidrawLikeElement[] = [
      {
        id: "img-1",
        type: "image",
        fileId: "f1",
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      } as ExcalidrawLikeElement,
    ];
    const out = preserveImageAssetUrlsOnSceneWrite(incoming, prev);
    expect(out[0]?.customData?.assetUrl).toBe("https://blob.example/a.png");
    expect(out[0]?.x).toBe(10);
  });
});
