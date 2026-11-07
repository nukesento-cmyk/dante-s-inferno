import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { webImage, webSrcSet } from '../data/heroImages';

interface Props {
  name: string;
  alt: string;
  sizes?: string;
  /** Fill the positioned parent instead of flowing. */
  fill?: boolean;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  imgStyle?: CSSProperties;
  priority?: boolean;
  lazy?: boolean;
}

/** Optimised photo: 1280/2400 srcset, with the 48px blurred file as a placeholder until the real one decodes. */
export function WebImage({ name, alt, sizes = '100vw', fill = false, className = '', imgClassName = '', style, imgStyle, priority = false, lazy = false }: Props) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <span
      className={`web-img ${fill ? 'web-img-fill' : ''} ${loaded ? 'is-loaded' : ''} ${className}`}
      style={{ backgroundImage: `url(${webImage(name, 'blur')})`, ...style }}
    >
      <img
        ref={ref}
        className={imgClassName}
        style={imgStyle}
        src={webImage(name, 1280)}
        srcSet={webSrcSet(name)}
        sizes={sizes}
        alt={alt}
        decoding="async"
        loading={lazy ? 'lazy' : undefined}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
        onLoad={() => setLoaded(true)}
      />
    </span>
  );
}
