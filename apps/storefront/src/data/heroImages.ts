/**
 * Single source of truth for homepage / attract-screen photography.
 * Files live in /public/images/web as {name}-1280.jpg, {name}-2400.jpg and {name}-blur.jpg (48px placeholder).
 * Never reference the multi-MB originals in /public/images.
 */
export interface HeroImage {
  name: string;
  /** Short description (used where the image is not purely decorative). */
  alt: string;
  /** Ken Burns direction preset, see .kb-0 .. .kb-3 in styles.css. */
  kb: 0 | 1 | 2 | 3;
  /** CSS object-position so the pizza stays framed on narrow screens. */
  position?: string;
}

export const HERO_IMAGES: HeroImage[] = [
  { name: 'hero1', alt: 'Two loaded pizzas on dark wood', kb: 0 },
  { name: 'hero2', alt: 'Pepperoni pizza with cheese cubes', kb: 1 },
  { name: 'hero3', alt: 'Margherita with basil and cherry tomato', kb: 2 },
  { name: 'hero4', alt: 'Neapolitan pizza in front of a wood-fired oven', kb: 3 },
  { name: 'hero5', alt: 'Olive, minced beef and pepper pizza on a wooden board', kb: 0 },
  { name: 'hero6', alt: 'Chicken, feta and greens pizza', kb: 1 },
  { name: 'hero7', alt: 'A cheese pull lifting a margherita slice', kb: 2 },
];

/** Dark, cinematic frame used first by the attract screen and in the Fire Dimension. */
export const IDLE_IMAGE: HeroImage = { name: 'idle', alt: 'Pizza in front of a dark oven with flames', kb: 3 };

export const webImage = (name: string, size: 1280 | 2400 | 'blur') => `/images/web/${name}-${size}.jpg`;
export const webSrcSet = (name: string) => `${webImage(name, 1280)} 1280w, ${webImage(name, 2400)} 2400w`;
