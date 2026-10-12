/**
 * @jest-environment jsdom
 *
 * Event classification for the locked-view guard.
 * The Playwright spec is the camera oracle; this only checks which events
 * are cancelled.
 */

import { attachLockedViewGestureGuard } from "@/lib/whiteboard/locked-view-gesture-guard";

if (typeof PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(
      type: string,
      init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}
    ) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
    }
  }
  (globalThis as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill;
}

function mountWithCanvas(): { mount: HTMLDivElement; canvas: HTMLCanvasElement; menu: HTMLDivElement } {
  const mount = document.createElement("div");
  const scene = document.createElement("div");
  scene.className = "excalidraw";
  const canvas = document.createElement("canvas");
  canvas.className = "interactive";
  scene.appendChild(canvas);
  const menu = document.createElement("div");
  menu.className = "menu";
  mount.appendChild(scene);
  mount.appendChild(menu);
  document.body.appendChild(mount);
  return { mount, canvas, menu };
}

function wheel(target: EventTarget, init: WheelEventInit = {}): WheelEvent {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 40,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("attachLockedViewGestureGuard", () => {
  let detach: (() => void) | null = null;

  afterEach(() => {
    detach?.();
    detach = null;
    document.body.innerHTML = "";
  });

  it("cancels a canvas wheel and ignores a menu wheel", () => {
    const { mount, canvas, menu } = mountWithCanvas();
    const blocked: string[] = [];
    detach = attachLockedViewGestureGuard(mount, {
      onBlocked: (kind) => blocked.push(kind),
    });
    const onCanvas = wheel(canvas);
    const onMenu = wheel(menu);
    expect(onCanvas.defaultPrevented).toBe(true);
    expect(onMenu.defaultPrevented).toBe(false);
    expect(blocked).toEqual(["wheel"]);
    expect(mount.getAttribute("data-wb-lock-nudge")).toBe("1");
    detach();
    const after = wheel(canvas);
    expect(after.defaultPrevented).toBe(false);
  });

  it("swallows a second touch pointer and lets the first draw", () => {
    const { mount, canvas } = mountWithCanvas();
    const blocked: string[] = [];
    detach = attachLockedViewGestureGuard(mount, { onBlocked: (kind) => blocked.push(kind) });
    const first = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
    });
    const second = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 2,
      pointerType: "touch",
    });
    const secondMove = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerId: 2,
      pointerType: "touch",
    });
    const firstMove = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
    });
    canvas.dispatchEvent(first);
    canvas.dispatchEvent(second);
    canvas.dispatchEvent(secondMove);
    canvas.dispatchEvent(firstMove);
    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(true);
    expect(secondMove.defaultPrevented).toBe(true);
    expect(firstMove.defaultPrevented).toBe(false);
    expect(blocked).toEqual(["pointer2"]);
  });

  it("cancels a two-touch touchmove and a gesture on the canvas", () => {
    const { mount, canvas, menu } = mountWithCanvas();
    const blocked: string[] = [];
    detach = attachLockedViewGestureGuard(mount, { onBlocked: (kind) => blocked.push(kind) });
    const one = new TouchEvent("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(one, "touches", { value: [{ identifier: 1 }] });
    canvas.dispatchEvent(one);
    const two = new TouchEvent("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(two, "touches", { value: [{ identifier: 1 }, { identifier: 2 }] });
    canvas.dispatchEvent(two);
    const gesture = new Event("gesturechange", { bubbles: true, cancelable: true });
    canvas.dispatchEvent(gesture);
    const menuGesture = new Event("gesturechange", { bubbles: true, cancelable: true });
    menu.dispatchEvent(menuGesture);
    expect(one.defaultPrevented).toBe(false);
    expect(two.defaultPrevented).toBe(true);
    expect(gesture.defaultPrevented).toBe(true);
    expect(menuGesture.defaultPrevented).toBe(false);
    expect(blocked).toContain("pointer2");
    expect(blocked).toContain("gesture");
  });

  it("blocks pan and zoom keys unless focus is in an editor", () => {
    const { mount, canvas } = mountWithCanvas();
    const blocked: string[] = [];
    detach = attachLockedViewGestureGuard(mount, { onBlocked: (kind) => blocked.push(kind) });
    const press = (init: KeyboardEventInit, target: EventTarget = canvas) => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    };
    expect(press({ key: " ", code: "Space" }).defaultPrevented).toBe(true);
    expect(press({ key: "h", code: "KeyH" }).defaultPrevented).toBe(true);
    expect(press({ key: "+", code: "Equal" }).defaultPrevented).toBe(true);
    expect(press({ key: "-", code: "Minus" }).defaultPrevented).toBe(true);
    expect(press({ key: "=", code: "Equal" }).defaultPrevented).toBe(true);
    expect(press({ key: "_", code: "Minus", shiftKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "0", code: "Digit0", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "0", code: "Digit0", metaKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "!", code: "Digit1", shiftKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "@", code: "Digit2", shiftKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "#", code: "Digit3", shiftKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "p", code: "KeyP" }).defaultPrevented).toBe(false);

    const input = document.createElement("input");
    mount.appendChild(input);
    expect(press({ key: " ", code: "Space" }, input).defaultPrevented).toBe(false);
    const area = document.createElement("textarea");
    mount.appendChild(area);
    expect(press({ key: "+", code: "Equal" }, area).defaultPrevented).toBe(false);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    mount.appendChild(editable);
    expect(press({ key: "h", code: "KeyH" }, editable).defaultPrevented).toBe(false);
    expect(blocked.filter((k) => k === "key").length).toBeGreaterThan(0);
  });

  it("does not cancel Space on a button", () => {
    const { mount, canvas, menu } = mountWithCanvas();
    const blocked: string[] = [];
    detach = attachLockedViewGestureGuard(mount, {
      onBlocked: (kind) => blocked.push(kind),
    });
    const scene = canvas.parentElement;
    if (!(scene instanceof HTMLElement)) throw new Error("missing scene");
    const button = document.createElement("button");
    button.type = "button";
    scene.appendChild(button);
    const press = (init: KeyboardEventInit, target: EventTarget) => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    };
    // Inside .excalidraw, but a button — keyboard activation must win.
    expect(press({ key: " ", code: "Space" }, button).defaultPrevented).toBe(false);
    expect(press({ key: " ", code: "Space" }, canvas).defaultPrevented).toBe(true);
    expect(press({ key: " ", code: "Space" }, document.body).defaultPrevented).toBe(true);
    expect(press({ key: " ", code: "Space" }, menu).defaultPrevented).toBe(false);
    expect(
      press({ key: "0", code: "Digit0", ctrlKey: true }, button).defaultPrevented
    ).toBe(true);
    expect(
      press({ key: "!", code: "Digit1", shiftKey: true }, button).defaultPrevented
    ).toBe(true);
    const item = document.createElement("div");
    item.setAttribute("role", "menuitem");
    scene.appendChild(item);
    expect(press({ key: "h", code: "KeyH" }, item).defaultPrevented).toBe(false);
    const link = document.createElement("a");
    link.href = "#unlock";
    scene.appendChild(link);
    expect(press({ key: "+", code: "Equal" }, link).defaultPrevented).toBe(false);
    const select = document.createElement("select");
    scene.appendChild(select);
    expect(press({ key: "-", code: "Minus" }, select).defaultPrevented).toBe(false);
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    scene.appendChild(roleButton);
    expect(press({ key: "=", code: "Equal" }, roleButton).defaultPrevented).toBe(false);
  });
});
