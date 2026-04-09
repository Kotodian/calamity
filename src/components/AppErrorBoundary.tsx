import { Component, type ErrorInfo, type ReactNode } from "react";
import { FatalErrorScreen } from "./FatalErrorScreen";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[app] render failed", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return <FatalErrorScreen title="Main window crashed while rendering" error={this.state.error} />;
    }

    return this.props.children;
  }
}
