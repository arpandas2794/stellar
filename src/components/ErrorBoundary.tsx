'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#030712] px-4 text-center font-sans">
          <div className="glass-panel max-w-md w-full p-8 rounded-2xl glow-indigo border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 h-32 w-32 bg-indigo-500/5 rounded-full blur-2xl" />
            <div className="h-12 w-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-5 border border-red-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Application Crash</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              An unexpected error occurred while rendering this view. Your on-chain state remains safe.
            </p>
            <div className="bg-[#070b13] border border-white/5 rounded-xl p-3 text-left mb-6 font-mono text-[10px] text-red-300 break-all overflow-y-auto max-h-32">
              {this.state.error?.toString() || 'Unknown rendering error'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer min-h-[44px]"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
