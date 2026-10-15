// path: app/global-error.tsx
'use client';

import '@/styles/globals.css';

/** Last-resort boundary. It replaces the root layout, so it carries its own html and body. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <html lang="en">
      <body>
        <main
          id="main-content"
          className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center"
        >
          <h1 className="text-h2 font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">We could not load this page. Please try again.</p>
          {error.digest ? (
            <p className="font-mono text-caption text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
