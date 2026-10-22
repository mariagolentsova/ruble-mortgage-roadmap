import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { failed: boolean };

/** Shows a friendly screen instead of a blank page if rendering throws. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Страница не загрузилась</h1>
          <button
            type="button"
            onClick={() => {
              // A broken saved form is the most likely cause — drop it before retrying.
              try {
                localStorage.removeItem("mortgage-form-v1");
              } catch {
                /* storage unavailable */
              }
              location.reload();
            }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }
}
