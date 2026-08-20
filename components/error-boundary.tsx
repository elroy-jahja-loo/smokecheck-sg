"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <LocalizedErrorFallback onRefresh={() => { this.setState({ hasError: false }); window.location.reload(); }} />;
    }

    return this.props.children;
  }
}

function LocalizedErrorFallback({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useI18n();
  return <div className="error-boundary" role="alert"><div className="error-boundary__inner"><span className="error-boundary__icon" aria-hidden="true">!</span><h2>{t("errorBoundary.title")}</h2><p>{t("errorBoundary.body")}</p><button type="button" className="live-primary-button" onClick={onRefresh}>{t("errorBoundary.refresh")}</button></div></div>;
}
