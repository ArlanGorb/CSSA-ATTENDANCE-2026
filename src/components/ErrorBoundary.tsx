'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home, Bug } from 'lucide-react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    this.setState({ error, errorInfo });

    // Log to error reporting service (e.g., Sentry) in production
    if (process.env.NODE_ENV === 'production') {
      // TODO: Integrate with Sentry or similar service
      // Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    }
  }

  public handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-red-500/20 shadow-2xl">
            <div className="text-center">
              <div className="inline-flex p-4 rounded-full bg-red-500/10 mb-6 ring-1 ring-red-400/30">
                <AlertTriangle className="w-12 h-12 text-red-400" />
              </div>

              <h1 className="text-3xl font-bold text-white mb-2">
                Oops! Something went wrong
              </h1>

              <p className="text-slate-400 mb-6">
                We encountered an unexpected error. Don&apos;t worry, our team has been notified.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-left">
                  <p className="text-red-400 text-sm font-mono mb-2">
                    <strong>Error:</strong> {this.state.error.message}
                  </p>
                  {this.state.errorInfo && (
                    <details className="text-slate-500 text-xs font-mono mt-2">
                      <summary className="cursor-pointer hover:text-slate-400">
                        Show component stack
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCcw className="w-5 h-5" />
                  Try Again
                </button>

                <Link
                  href="/"
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Home className="w-5 h-5" />
                  Go Home
                </Link>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-slate-500 text-sm mb-3">Still having issues?</p>
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors"
                >
                  <Bug className="w-4 h-4" />
                  Report to Admin
                </Link>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
