import { useTitle } from '../hooks/useTitle';

export default function OurStory() {
  useTitle('Our story');
  return (
    <div className="page container-x">
      <p className="eyebrow">Our story</p>
      <h1>Freshly made. Boldly different.</h1>
      <div className="split split-eq" style={{ alignItems: 'center' }}>
        <div>
          <p>Dante's Pizza started with one idea: pizza should feel like an event. Dough rested slowly, sauce built from ripe tomatoes, mozzarella that actually stretches, and toppings with an attitude.</p>
          <p>Every pizza is made to order in a blazing-hot oven, then boxed and sent out the door while the crust still crackles. No shortcuts, no sad slices.</p>
          <p>Build it your way or pick one of our signatures. We will keep the oven roaring.</p>
        </div>
        <img src="/images/narek-petrosyan--0nj85eRLPk-unsplash.jpg" alt="A freshly baked pizza topped with basil leaves" style={{ borderRadius: 20 }} loading="lazy" />
      </div>
      <div className="exp-photos" style={{ marginTop: 32 }}>
        <img src="/images/web/idle-1280.jpg" alt="A pizza resting in front of a glowing wood oven" loading="lazy" />
        <img src="/images/web/hero3-1280.jpg" alt="Close-up of a pizza with basil and melted cheese" loading="lazy" />
        <img src="/images/faizan-saeed-8thte7ceLSw-unsplash.jpg" alt="A pizza on a wooden serving board" loading="lazy" />
      </div>
    </div>
  );
}
