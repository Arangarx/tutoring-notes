/** @jest-environment jsdom */

class ResizeObserverMock {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GraphEmbeddable } from "@/components/whiteboard/GraphEmbeddable";
import { serializeGraphStateJson } from "@/lib/whiteboard/graph-state";

jest.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ resolvedTheme: "light", mode: "light", setMode: jest.fn() }),
}));

const mockCreate = jest.fn((type: string, parents: unknown[]) => {
  if (type === "functiongraph" && parents[0] === "bad!!!") {
    throw new Error("parse error");
  }
  return { id: `plot-${String(parents[0])}` };
});

const mockBoard = {
  resizeContainer: jest.fn(),
  setBoundingBox: jest.fn(),
  update: jest.fn(),
  create: mockCreate,
  removeObject: jest.fn(),
  getBoundingBox: jest.fn(() => [-10, 10, 10, -10]),
  defaultAxes: {
    x: { setAttribute: jest.fn() },
    y: { setAttribute: jest.fn() },
  },
  on: jest.fn(),
  off: jest.fn(),
};

jest.mock("jsxgraph", () => ({
  __esModule: true,
  default: {
    JSXGraph: {
      initBoard: jest.fn(() => mockBoard),
      freeBoard: jest.fn(),
    },
  },
}));

describe("GraphEmbeddable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows parse error for invalid expressions without crashing", async () => {
    const graphStateJson = serializeGraphStateJson({
      expressions: ["bad!!!"],
      bbox: [-10, 10, 10, -10],
    });

    render(
      <GraphEmbeddable
        element={{
          id: "el-graph-1",
          customData: { graphStateJson, wbType: "graph" },
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("wb-graph-expr-error-0")).toHaveTextContent(
        "Couldn't understand"
      );
    });
  });

  it("adds an expression on commit and calls persist API", async () => {
    const user = userEvent.setup();
    const updateScene = jest.fn();
    const element = {
      id: "el-graph-2",
      version: 1,
      customData: {
        wbType: "graph",
        graphStateJson: serializeGraphStateJson({ expressions: [] }),
      },
    };
    const excalidrawAPI = {
      getSceneElements: () => [element],
      updateScene,
    };

    render(
      <GraphEmbeddable element={element} excalidrawAPI={excalidrawAPI} />
    );

    await user.type(screen.getByTestId("wb-graph-expr-new"), "x^2");
    await user.click(screen.getByTestId("wb-graph-expr-add"));

    await waitFor(() => {
      expect(updateScene).toHaveBeenCalled();
    });
    const payload = updateScene.mock.calls.at(-1)?.[0];
    expect(payload.captureUpdate).toBe("NEVER");
    const next = payload.elements[0] as { customData: { graphStateJson: string } };
    expect(JSON.parse(next.customData.graphStateJson).expressions).toEqual(["x^2"]);
    expect(screen.getByTestId("wb-graph-expr-display-0")).toHaveTextContent("x^2");
  });
});
