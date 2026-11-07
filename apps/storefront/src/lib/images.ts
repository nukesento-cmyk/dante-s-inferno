/**
 * Product photos are uploaded or seeded as multi-MB originals under /images/. The storefront serves
 * an 800px copy from /images/web/<name>-800.jpg when one exists (see public/images/web); the original
 * stays as the fallback (onError) so admin-uploaded images and unknown files still render.
 */
const ORIGINAL = /^\/images\/([^/]+)\.jpg$/i;

export function optimizedImage(url: string): string {
  const m = ORIGINAL.exec(url);
  return m ? `/images/web/${m[1]}-800.jpg` : url;
}

export function fallbackToOriginal(url: string) {
  return (e: { currentTarget: HTMLImageElement }) => {
    const img = e.currentTarget;
    if (img.src.endsWith(url) || img.dataset.fellBack) return;
    img.dataset.fellBack = '1';
    img.src = url;
  };
}
