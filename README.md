# Playground

[grafikremix.github.io/Playground](https://grafikremix.github.io/Playground/)

Eight interface experiments. Each one breaks a rule I usually defend. The fun is in the friction.

1. **Viscous toggle** — a switch that has to slosh
2. **Gravity checkboxes** — done work gets heavy
3. **Breathing buttons** — the click only fires on the exhale
4. **Magnetic text field** — letters are iron filings
5. **Elastic slider** — the ends fight back
6. **Thermal dropdown** — habits rise, neglect frosts
7. **Shattering modal** — cancel leaves glass
8. **Pressure radios** — hold to mean it

Built for a thumb as much as a mouse. Drag, flick, hold, pinch, twist.

The index is a grid of stills. Black and white until you hover or hold; colour blooms from the press. Tap opens the experiment. Hold does not.

Stills are captured from the live experiments (`?still=1` poses them), then cropped and treated. With the site running locally:

```
npm run stills
```

Or `PLAYGROUND_URL=http://127.0.0.1:4173 npm run stills` against a preview build. Output lands in `public/experiments/<slug>/still.{avif,webp,jpg}`.

Personal name, city, and contact live in `src/studio.js`. Experiments live in `src/experiments.js`. To add one: an entry there, `src/specimens/<slug>.js`, `src/pages/<slug>.js`, `specimens/<slug>.html`, then `npm run stills`. Heat for the dropdown lives in the browser. Nothing else is stored.
