import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Shown instead of the default panel, e.g. to scope a fallback to one pane. */
  fallback?: (reset: () => void, error: Error) => React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a thrown component shows a recoverable panel
 * instead of a blank white screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(this.reset, error);

    return (
      <div className="h-full min-h-[240px] flex items-center justify-center p-8 bg-espresso-2 text-krijt">
        <div className="panel max-w-[420px] w-full p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-terracotta" />
            <h2 className="text-[14px] font-black tracking-tight">Something broke</h2>
          </div>
          <p className="text-[12px] text-verweerd-mos leading-relaxed mb-4">
            This part of the app hit an unexpected error. You can try again — if it keeps
            happening, reload the page.
          </p>
          <pre className="text-[10px] text-verweerd-mos/80 bg-espresso-3 border border-verweerd-mos/20 rounded p-2 mb-4 overflow-x-auto">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="h-8 px-3 bg-terracotta rounded text-[11px] font-bold inline-flex items-center gap-1.5 hover:brightness-110 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="h-8 px-3 rounded border border-verweerd-mos/30 text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
