import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { formatKenyanPhone, formatKes } from '@dantes/shared';
import { useMenu, useSettings, useZones } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { hasWebGL } from '../lib/webgl';
import { weeklyHours } from '../lib/hours';
import { sceneState, type SceneSection } from '../scenes/sceneState';
import type { CloudItem } from '../scenes/HomeScene';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Footer } from '../components/Layout';
import { OpenBadge } from '../components/OpenBadge';
import { ProductCard } from '../components/ProductCard';
import { ErrorBox, Loading } from '../components/States';
import { WebImage } from '../components/WebImage';
import { HERO_IMAGES, IDLE_IMAGE, type HeroImage } from '../data/heroImages';
import { FALLBACK_INGREDIENTS } from './homeData';

// three.js lives in this chunk only (plus the customizer).
const HomeScene = lazy(() => import('../scenes/HomeScene'));

const LAYERS = [
  { name: 'Crust', text: 'Slow-rested dough, hand-stretched and blistered in the fire.', top: '18%', side: 'left' },
  { name: 'Sauce', text: 'Ripe tomatoes, garlic and a little heat. Nothing hidden.', top: '36%', side: 'right' },
  { name: 'Cheese', text: 'Mozzarella that melts, stretches and browns just right.', top: '54%', side: 'left' },
  { name: 'Toppings', text: 'Fresh, generous and placed with intent.', top: '72%', side: 'right' },
] as const;

const SCENE_SECTIONS = new Set<SceneSection>(['portal', 'anatomy', 'universe', 'fire', 'final']);
const HERO_INTERVAL_MS = 8000;
const FINAL_IMAGE = HERO_IMAGES[0]!; // hero1: moody table
const byName = (name: string) => HERO_IMAGES.find((h) => h.name === name)!;

/** Dim photo behind a section. With several images it slowly crossfades (no controls: it is atmosphere, not content). */
function Backdrop({ images, center = false, reduced, priority = false }: { images: HeroImage[]; center?: boolean; reduced: boolean; priority?: boolean }) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const multi = images.length > 1 && !reduced;

  useEffect(() => {
    if (!multi) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((i) => {
        setPrev(i);
        return (i + 1) % images.length;
      });
    }, HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [multi, images.length]);

  return (
    <div className="backdrop" aria-hidden="true">
      {images.map((img, i) => {
        // Mount only the visible image, the one fading out and the next one (preloading it).
        const next = (index + 1) % images.length;
        if (i !== index && i !== prev && !(multi && i === next)) return null;
        return (
          <div key={img.name} className={`backdrop-layer ${i === index ? 'is-on' : ''}`}>
            <WebImage
              name={img.name}
              alt=""
              fill
              priority={priority && i === 0}
              lazy={!(priority && i === 0)}
              className={`backdrop-photo ${reduced ? '' : `backdrop-kb kb-${img.kb}`}`}
              imgStyle={img.position ? { objectPosition: img.position } : undefined}
            />
          </div>
        );
      })}
      <div className={`backdrop-shade ${center ? 'is-center' : ''}`} />
    </div>
  );
}

export default function Home() {
  useTitle('Freshly made. Boldly different.');
  const { data: menu, isLoading: menuLoading, error: menuError, refetch } = useMenu();
  const { data: settings } = useSettings();
  const { data: zones } = useZones();
  const reduced = useReducedMotion();
  const rich = useMemo(() => hasWebGL(), []) && !reduced;
  const [section, setSection] = useState<SceneSection>('portal');
  const [picked, setPicked] = useState<string | null>(null);
  const [pastHero, setPastHero] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const ingredients = useMemo(() => {
    const map = new Map<string, { id: string; slug: string; name: string; description: string; modelKey: string; color: string; surchargeCents: number }>();
    menu?.products.forEach((p) => [...p.defaultIngredients, ...p.extraIngredients].forEach((i) => map.set(i.id, i)));
    return map.size ? [...map.values()] : FALLBACK_INGREDIENTS;
  }, [menu]);
  const heroToppings = useMemo(() => {
    const p = menu?.products.find((x) => x.featured && x.defaultIngredients.length) ?? menu?.products.find((x) => x.defaultIngredients.length);
    const list = p ? p.defaultIngredients : ingredients.slice(0, 5);
    return list.map((i) => ({ modelKey: i.modelKey, color: i.color }));
  }, [menu, ingredients]);
  const cloud: CloudItem[] = useMemo(() => ingredients.map((i) => ({ slug: i.slug, modelKey: i.modelKey, color: i.color })), [ingredients]);
  const products = useMemo(() => {
    const all = menu?.products ?? [];
    return [...all.filter((p) => p.featured), ...all.filter((p) => !p.featured)].slice(0, 6);
  }, [menu]);
  const teaserProduct = menu?.products.find((p) => p.featured) ?? menu?.products[0];
  const shown = ingredients.find((i) => i.slug === picked);

  // Mobile order bar appears once the hero has scrolled out of view.
  useEffect(() => {
    const el = document.getElementById('sec-portal');
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setPastHero(!e!.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!rich) return;
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      // The pin must exist before the other triggers so their start/end include its extra scroll length.
      gsap
        .timeline({ scrollTrigger: { trigger: '#sec-anatomy', start: 'top top', end: '+=220%', pin: true, scrub: 0.6 } })
        .to(sceneState, { explode: 1, duration: 1.2, ease: 'power2.inOut' }, 0)
        .to('.anat-label', { opacity: 1, duration: 0.3, stagger: 0.3 }, 0.3);

      // Which scene section is live is re-derived after every toggle, so jumps (End key, anchors) land correctly.
      const tracked: { id: SceneSection; st: ScrollTrigger }[] = [];
      const sync = () => {
        const live = tracked.filter((t) => t.st.isActive).pop();
        if (live && sceneState.section !== live.id) {
          sceneState.section = live.id;
          setSection(live.id);
        }
      };
      const track = (id: SceneSection, el: string, start = 'top 55%', end = 'bottom 55%') =>
        tracked.push({ id, st: ScrollTrigger.create({ trigger: el, start, end, onToggle: sync }) });
      track('portal', '#wrap-portal');
      track('anatomy', '#wrap-anatomy');
      track('universe', '#wrap-universe');
      track('fire', '#wrap-fire');
      track('off', '#solid-zone', 'top 55%', 'bottom 85%');
      // last section: the page cannot scroll its top up to 55%, so it starts earlier
      track('final', '#wrap-final', 'top 85%');

      gsap.from('.hero-title .w > span', { yPercent: 110, duration: 1.1, stagger: 0.09, ease: 'power4.out', delay: 0.2 });
      gsap.from('.hero-fade', { opacity: 0, y: 24, duration: 1, stagger: 0.15, delay: 0.7 });

      ScrollTrigger.create({
        trigger: '#sec-fire',
        start: 'top bottom',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          sceneState.fire = self.progress;
        },
      });
    }, root);

    // Menu, zones and settings arrive after mount and change the page height: re-measure every trigger.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    if (root.current) ro.observe(root.current);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      sceneState.section = 'portal';
      sceneState.explode = 0;
      sceneState.fire = 0;
      sceneState.highlight = null;
    };
  }, [rich]);

  const choose = (slug: string | null) => {
    setPicked(slug);
    sceneState.highlight = slug;
  };
  const words = ['Freshly', 'made.', 'Boldly', 'different.'];
  const sceneVisible = rich && SCENE_SECTIONS.has(section);

  return (
    <div className={`home ${rich ? 'is-rich' : ''}`} ref={root} data-section={section}>
      {rich && (
        <div className="scene-canvas" style={{ opacity: sceneVisible ? 1 : 0 }} aria-hidden="true">
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <HomeScene toppings={heroToppings} cloud={cloud} active={sceneVisible} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {/* 01 THE PORTAL */}
      <div id="wrap-portal">
        <section id="sec-portal" className="sec" aria-labelledby="h-portal">
          <Backdrop images={HERO_IMAGES} reduced={reduced} priority />
          <div className="container-x">
            <div className="hero-copy">
              <p className="eyebrow hero-fade">01 · The Portal</p>
              <h1 id="h-portal" className="hero-title" aria-label="Freshly made. Boldly different.">
                {words.map((w, i) => (
                  <span key={w} aria-hidden="true">
                    <span className="w"><span className={i >= 2 ? 'accent' : ''}>{w}</span></span>{' '}
                  </span>
                ))}
              </h1>
              <p className="hero-sub hero-fade">Pizza that arrives like an event. Hand-stretched, fire-baked, delivered hot across the city.</p>
              <div className="chips hero-fade" style={{ marginTop: 24 }}>
                <Link to="/menu" className="btn btn-primary btn-lg">Order now</Link>
                <a href="#sec-anatomy" className="btn btn-ghost btn-lg">See what is inside</a>
              </div>
            </div>
          </div>
          {rich && <span className="scroll-hint" aria-hidden="true">SCROLL</span>}
        </section>
      </div>

      {/* 02 THE ANATOMY: plain stage so the exploding layers read clearly */}
      <div id="wrap-anatomy">
        <section id="sec-anatomy" className="sec anatomy" aria-labelledby="h-anatomy">
          <div className="container-x" style={{ position: 'relative', height: rich ? '80svh' : undefined }}>
            <p className="eyebrow">02 · The Anatomy</p>
            <h2 id="h-anatomy">Four layers.<br />Zero shortcuts.</h2>
            <div className={rich ? 'anatomy-labels' : 'anat-list'} style={rich ? undefined : { marginTop: 24 }}>
              {LAYERS.map((l) => (
                <div key={l.name} className="anat-label" style={rich ? { top: l.top, [l.side]: 0 } : { opacity: 1 }}>
                  <div>
                    <strong>{l.name}</strong>
                    <p>{l.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* 03 INGREDIENT UNIVERSE */}
      <div id="wrap-universe">
        <section id="sec-universe" className="sec" aria-labelledby="h-universe">
          <div className="container-x universe-wrap">
            <div>
              <p className="eyebrow">03 · Ingredient Universe</p>
              <h2 id="h-universe">Everything on it<br />earns its place</h2>
              <p className="muted" style={{ maxWidth: '48ch' }}>Hover, focus or tap an ingredient to see what it brings to the party.</p>
            </div>
            <div className="ing-chips" role="group" aria-label="Ingredients">
              {ingredients.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="chip"
                  aria-pressed={picked === i.slug}
                  onMouseEnter={() => choose(i.slug)}
                  onMouseLeave={() => choose(null)}
                  onFocus={() => choose(i.slug)}
                  onBlur={() => choose(null)}
                  onClick={() => choose(picked === i.slug ? null : i.slug)}
                >
                  <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: i.color, marginRight: 8 }} />
                  {i.name}
                </button>
              ))}
            </div>
            <div className="ing-card" aria-live="polite">
              {shown ? (
                <>
                  <h3>{shown.name}</h3>
                  <p className="muted" style={{ margin: 0 }}>{shown.description || "A Dante's favourite."}</p>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Pick an ingredient.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 04 FIRE DIMENSION: the real oven behind the baking pizza */}
      <div id="wrap-fire">
        <section id="sec-fire" className="sec fire-sec" aria-labelledby="h-fire">
          <Backdrop images={[IDLE_IMAGE]} center reduced={reduced} />
          <div className="fire-stick">
            <div className="container-x">
              <div className="fire-copy">
                <p className="eyebrow">04 · Fire Dimension</p>
                <h2 id="h-fire">Born in 450 degrees</h2>
                <p className="muted">Our oven runs hotter than your ambitions. Ninety seconds of roaring heat gives you leopard-spotted crust, bubbling cheese and a smoky finish.</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div id="solid-zone">
        {/* 05 THE COLLECTION */}
        <section id="sec-collection" className="sec sec-solid" aria-labelledby="h-collection" style={{ alignItems: 'start' }}>
          <div className="container-x">
            <p className="eyebrow">05 · The Collection</p>
            <h2 id="h-collection">The line-up</h2>
            {menuLoading && <Loading label="Loading the menu…" />}
            {menuError && <ErrorBox error={menuError} onRetry={() => refetch()} />}
            <div className="collection-rail">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
            <p style={{ marginTop: 28 }}>
              <Link to="/menu" className="btn btn-ghost">See the full menu</Link>
            </p>
          </div>
        </section>

        {/* 06 CUSTOMIZER TEASER */}
        <section id="sec-customizer" className="sec sec-warm" aria-labelledby="h-custom">
          <div className="container-x teaser">
            <div>
              <p className="eyebrow">06 · The Customizer</p>
              <h2 id="h-custom">Build it.<br />Watch it grow.</h2>
              <p className="muted" style={{ maxWidth: '46ch' }}>Pick your size, choose your crust, pile on extras or drop what you do not love. The pizza and the price update as you go.</p>
              <Link to={teaserProduct ? `/customize/${teaserProduct.id}` : '/menu'} className="btn btn-primary btn-lg">Start building</Link>
            </div>
            <div className="teaser-img">
              <WebImage name="hero3" alt={byName('hero3').alt} sizes="(min-width: 900px) 50vw, 100vw" lazy />
            </div>
          </div>
        </section>

        {/* 07 THE EXPERIENCE */}
        <section id="sec-experience" className="sec sec-solid" aria-labelledby="h-exp" style={{ alignItems: 'start' }}>
          <div className="container-x">
            <p className="eyebrow">07 · The Experience</p>
            <h2 id="h-exp">From our fire to your door</h2>
            <div className="split split-eq" style={{ alignItems: 'center', marginBottom: 32 }}>
              <p>Dante's is made for people who want more from dinner. Every box is built to order, baked hot and handled with care. Choose delivery to your area, or collect it fresh from the restaurant.</p>
              <div className="exp-photos" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <WebImage name="hero7" alt={byName('hero7').alt} sizes="(min-width: 900px) 25vw, 50vw" lazy />
                <WebImage name="hero6" alt={byName('hero6').alt} sizes="(min-width: 900px) 25vw, 50vw" lazy />
              </div>
            </div>
            <h3>Delivery areas</h3>
            {zones && zones.length > 0 ? (
              <div className="zone-grid">
                {zones.map((z) => (
                  <div key={z.id} className="panel">
                    <strong>{z.name}</strong>
                    <p className="muted" style={{ margin: '4px 0' }}>{z.etaMinMinutes}–{z.etaMaxMinutes} min</p>
                    <p style={{ margin: 0 }}>{formatKes(z.feeCents)} fee · min {formatKes(z.minOrderCents)}</p>
                    {z.freeDeliveryFromCents !== null && <p className="hint">Free over {formatKes(z.freeDeliveryFromCents)}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="muted">Delivery areas appear here once loaded.</p>}
          </div>
        </section>
      </div>

      {/* 08 FINAL PORTAL */}
      <div id="wrap-final">
        <section id="sec-final" className="sec final-sec" aria-labelledby="h-final" style={{ alignItems: 'end' }}>
          <Backdrop images={[FINAL_IMAGE]} center reduced={reduced} />
          <div className="container-x" style={{ display: 'grid', justifyItems: 'center', gap: 16 }}>
            <p className="eyebrow">08 · Final Portal</p>
            <h2 id="h-final" className="hero-title" style={{ fontSize: 'clamp(2.2rem,8vw,5rem)' }}>Hungry yet?</h2>
            <Link to="/menu" className="btn btn-primary btn-lg">Order now</Link>
            {settings && (
              <div className="panel" style={{ marginTop: 20, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', textAlign: 'left', width: '100%', background: 'rgba(28,28,33,.92)' }}>
                <div>
                  <OpenBadge settings={settings} />
                  <p style={{ marginTop: 12 }}>{settings.address}</p>
                  <p style={{ margin: 0 }}><a href={`tel:${settings.phone}`}>{formatKenyanPhone(settings.phone)}</a></p>
                  {settings.whatsappPhone && <p style={{ margin: 0 }}><a href={`https://wa.me/${settings.whatsappPhone.replace(/^\+/, '')}`} target="_blank" rel="noreferrer">WhatsApp {formatKenyanPhone(settings.whatsappPhone)}</a></p>}
                </div>
                <ul className="plain hours">
                  {weeklyHours(settings.hours).map((h) => <li key={h.day}><span>{h.day}</span><span>{h.text}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className={`mobile-cta ${pastHero ? 'is-on' : ''}`} aria-hidden={!pastHero}>
        <strong>DANTE'S PIZZA</strong>
        <Link to="/menu" className="btn btn-primary" tabIndex={pastHero ? 0 : -1}>Order now</Link>
      </div>
      <Footer />
    </div>
  );
}
