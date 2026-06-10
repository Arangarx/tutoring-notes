"use client";

import { Component, type ReactNode } from "react";

type WbChromeErrorBoundaryProps = {
  children: ReactNode;
};

type WbChromeErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Isolates touch chrome failures so a throw in props sheets / sliders
 * cannot unmount the Excalidraw canvas.
 */
export class WbChromeErrorBoundary extends Component<
  WbChromeErrorBoundaryProps,
  WbChromeErrorBoundaryState
> {
  state: WbChromeErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WbChromeErrorBoundaryState {
    return { hasError: true };
  }

  private dismiss = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <button
          type="button"
          className="mynk-wb-chrome-error-fallback"
          onClick={this.dismiss}
        >
          Controls hit an error — tap to dismiss
        </button>
      );
    }
    return this.props.children;
  }
}
