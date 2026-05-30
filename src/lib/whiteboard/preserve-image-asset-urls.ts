import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

/**
 * Excalidraw `onChange` / `getSceneElements()` sometimes omits `customData.assetUrl`
 * on image elements even though we set it at insert (PDF toolbar, uploads). Peers
 * hydrate from `assetUrl` — re-stamp from the page bucket before broadcast.
 */
export function preserveImageAssetUrlsOnSceneWrite(
  incoming: ReadonlyArray<ExcalidrawLikeElement>,
  previous: ReadonlyArray<ExcalidrawLikeElement> | undefined
): ExcalidrawLikeElement[] {
  if (!previous?.length) {
    return incoming.map((e) => ({ ...e }) as ExcalidrawLikeElement);
  }
  const prevById = new Map<string, ExcalidrawLikeElement>();
  for (const el of previous) {
    if (el?.id) prevById.set(el.id, el);
  }
  return incoming.map((raw) => {
    const el = raw as ExcalidrawLikeElement;
    const url = el.customData?.assetUrl;
    if (el.type !== "image" || (typeof url === "string" && url.length >= 8)) {
      return { ...el };
    }
    const prev = prevById.get(el.id);
    const prevUrl = prev?.customData?.assetUrl;
    if (typeof prevUrl !== "string" || prevUrl.length < 8) {
      return { ...el };
    }
    return {
      ...el,
      customData: {
        ...(el.customData ?? {}),
        assetUrl: prevUrl,
        ...(prev?.customData?.altText && !el.customData?.altText
          ? { altText: prev.customData.altText }
          : {}),
      },
    };
  });
}
