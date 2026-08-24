# BV theme color classification

## Theme-owned UI chrome

Backgrounds, raised surfaces, inputs, borders, text, focus, selection, control states, window chrome, dialogs, overlays, portals, status intents and showcase chrome consume the semantic `--bv-ui-*` tokens in `ui/src/index.css`. Concrete theme names and palette values stay out of components.

## Feature-owned identity

Regional identity, mask colors, layer colors, canvas checkerboards, detector/region visualization, graph slot identity and user-selected color values remain feature-owned. They are intentionally not remapped by the theme.

## Non-theme literals

Black/white alpha values used for image content backdrops, checkerboards, shadows, SVG masks and syntax highlighting are rendering primitives rather than CI colors. They remain local unless a later visual slice promotes them into a semantic contract.

`03C · Cool Graphite` is the only production theme. The other catalog entries preserve design intent only and are neither selectable nor complete token sets.
