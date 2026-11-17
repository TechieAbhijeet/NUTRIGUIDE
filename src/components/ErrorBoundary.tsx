import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onGoHome: () => void;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Page ErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleGoHome = () => {
    this.setState({ hasError: false });
    this.props.onGoHome();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="pb-28 max-w-lg mx-auto px-4 pt-12">
          <button
            type="button"
            onClick={this.handleGoHome}
            className="w-full p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm text-center space-y-3 hover:border-emerald-700/50 transition-all active:scale-[0.99]"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Something went wrong. Tap to go back Home
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-semibold">
              <Home className="w-3.5 h-3.5" />
              <span>Go Home</span>
            </div>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
