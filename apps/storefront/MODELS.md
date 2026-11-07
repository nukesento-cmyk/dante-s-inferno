# Optional real pizza model

The Anatomy section on the homepage and the customizer preview render a procedural pizza (CanvasTexture-painted
crust, sauce and cheese, plus modelled toppings). If you have a scanned model you can use it instead.

## How to enable it

1. Put a CC0 or properly licensed pizza GLB at `public/models/pizza.glb`
   (for example the CC0 "Pizza Salami" on fab.com; check the licence on the page you download from).
2. That is all. On load the storefront sends a single `HEAD /models/pizza.glb`. If it returns a non-HTML 200 the
   GLB is loaded with drei's `useGLTF` and shown in place of the procedural pizza. A 404, a network error or a
   broken file silently falls back to the procedural pizza.

## Size and compression

- Keep the file under 5 MB.
- Compress it with Draco or meshopt (for example `gltf-transform optimize pizza.glb pizza.glb --compress draco --texture-compress webp`).
- drei loads the Draco decoder from the gstatic CDN by default. To keep the site fully self-hosted, copy the
  decoder files to `public/draco/` and call `useGLTF.setDecoderPath('/draco/')` before the first load,
  or use meshopt compression, which needs no external decoder files.
- Orientation: Y up, pizza lying flat. It is re-centred and scaled to a diameter of about 2 units, so the
  exact size or origin does not matter.

## Per-topping toggling and the explode animation

The customizer adds and removes toppings, and the Anatomy section pulls the layers apart. With a GLB, both only work
when the model contains named nodes (matching is case-insensitive):

| Node name           | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `dough`             | base layer (stays put when exploding)                            |
| `crust`             | crust rim, lifts slightly                                        |
| `sauce`             | sauce layer                                                      |
| `cheese`            | cheese layer                                                     |
| `topping_<key>`     | one node per topping, shown only if that topping is selected     |

`<key>` is either the ingredient `modelKey` (for example `topping_pepperoni`, `topping_black-olives`) or its
topping kind: `pepperoni`, `olive`, `mushroom`, `pepper`, `onion`, `leaf` (basil, spinach, herbs),
`meat`, `chunk` (feta, pineapple, cheese), `corn`, `tomato`.

Without those nodes the GLB is shown as one rigid model: everything baked into the scan stays visible, toppings
cannot be toggled and the explode animation does nothing. Use the procedural pizza (just do not add the GLB) if
per-topping customisation matters more than photographic realism.
