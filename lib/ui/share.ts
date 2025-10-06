export type ShareLinkOptions = {
  href: string;
  toast: ToastInvoker;
  title?: string;
  text?: string;
  successMessage?: string;
  failureMessage?: string;
};

type ToastInvoker = (options: {
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
  duration?: number;
}) => unknown;

export async function shareLink({
  href,
  toast,
  title,
  text,
  successMessage = 'Link copied to clipboard',
  failureMessage = 'Unable to copy link. Please copy it manually.',
}: ShareLinkOptions): Promise<void> {
  const absoluteUrl = buildAbsoluteUrl(href);

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const shareData: ShareData = {
        url: absoluteUrl,
        ...(title ? { title } : {}),
        ...(text ? { text } : {}),
      };
      if (typeof navigator.canShare !== 'function' || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast({ title: successMessage, description: absoluteUrl, variant: 'success' });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      // fall through to clipboard fallback on other errors
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      toast({ title: successMessage, description: absoluteUrl, variant: 'success' });
      return;
    } catch {}
  }

  toast({ title: failureMessage, description: absoluteUrl, variant: 'warning' });
}

function buildAbsoluteUrl(href: string): string {
  if (typeof window === 'undefined') return href;
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return href;
  }
}
