import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Optional override. Receives the captured error and a reset callback.
  fallback?: (error: Error, reset: () => void) => ReactNode;
  // Surface name in the default UI (e.g. "Post detail").
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors so a single bad component does NOT blank the
 * entire React tree. Without this, a thrown error during render of any
 * descendant unmounts the whole app and the user sees a pure-white screen
 * (no console output reaches the iOS WebView either).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaces in browser devtools and via the React Native bridge logger.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const isLight = (() => {
      try { return localStorage.getItem("homeTheme") === "light"; } catch { return false; }
    })();

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 280,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: "0 24px",
          textAlign: "center",
          background: isLight ? "#f6f6f6" : "#050505",
          color: isLight ? "#111" : "rgba(255,255,255,0.92)",
          fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {this.props.label ? `${this.props.label} 화면을 표시할 수 없습니다.` : "화면을 표시할 수 없습니다."}
        </div>
        <div style={{ fontSize: 11, color: isLight ? "#888" : "rgba(255,255,255,0.42)", maxWidth: 480, wordBreak: "break-word" }}>
          {error.message || String(error)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/")}
            style={{
              border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"}`,
              background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)",
              color: isLight ? "#111" : "rgba(255,255,255,0.92)",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            돌아가기
          </button>
          <button
            onClick={this.reset}
            style={{ border: "none", background: "#D4A547", color: "#000", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
