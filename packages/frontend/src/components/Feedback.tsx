import React from 'react';

/** Turn any thrown value into text that is safe to show in the UI. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }): React.ReactElement {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface ErrorNoticeProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorNotice({
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorNoticeProps): React.ReactElement {
  return (
    <div className="error-notice" role="alert">
      <span className="error-notice-message">{message}</span>
      {onRetry && (
        <button type="button" className="error-notice-retry" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
