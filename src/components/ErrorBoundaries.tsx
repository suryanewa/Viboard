import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { Block } from '../types';

type BoundaryState = { hasError: boolean };

const getBlockFingerprint = (block: Block) =>
  `${block.id}:${block.type}:${typeof block.data.url === 'string' ? block.data.url : ''}`;

export class BlockErrorBoundary extends Component<
  { block: Block; children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Could not render ${this.props.block.type} block ${this.props.block.id}:`, error, info);
  }

  componentDidUpdate(previousProps: { block: Block; children: ReactNode }) {
    if (
      this.state.hasError &&
      getBlockFingerprint(previousProps.block) !== getBlockFingerprint(this.props.block)
    ) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const sourceUrl = typeof this.props.block.data.url === 'string' &&
      /^https?:\/\//i.test(this.props.block.data.url)
      ? this.props.block.data.url
      : null;

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 text-center text-zinc-700 shadow-sm">
        <span className="text-sm font-semibold">This embed could not be displayed</span>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-violet-600 underline decoration-violet-300 underline-offset-2"
          >
            Open original
          </a>
        )}
      </div>
    );
  }
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Viboard encountered an unrecoverable render error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex h-screen w-screen items-center justify-center bg-zinc-100 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-xl shadow-zinc-950/5">
          <img src="/viboard-lockup.svg" alt="Viboard" className="mx-auto w-40" />
          <h1 className="mt-6 text-lg font-semibold text-zinc-950">The board hit an unexpected error</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Your locally saved board has not been cleared. Reload to try opening it again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
          >
            Reload Viboard
          </button>
        </div>
      </main>
    );
  }
}
