/**
 * Opens an EventSource that deterministically closes on `pagehide` and
 * `beforeunload` as well as React cleanup. This prevents Chrome's HTTP/1.1
 * 6-connection-per-origin pool from exhausting across full-page navigations,
 * reloads, or Back/Forward cache transitions.
 */
export function openManagedEventSource(url: string): {
  source: EventSource;
  close: () => void;
} {
  const source = new EventSource(url);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', close);
      window.removeEventListener('beforeunload', close);
    }
    source.close();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', close);
    window.addEventListener('beforeunload', close);
  }

  return { source, close };
}
