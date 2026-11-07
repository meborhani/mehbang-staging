# Azul visual asset kit for Mahbang Game

All SVGs are editable and rendered as scalable vector shapes. These are newly recreated approximations INSPIRED by the supplied raster reference, not pixel-perfect vector tracing of the original ornate illustration. The original reference 1000202316.png is included for visual comparison. No live tiles, score digits or player names are baked into frames.

Files:
01-background.svg — full portrait background (720x1536)
02-ornamental-border.svg — decorative screen frame (720x1536)
03-factory-frame.svg — circular factory frame 200x200; overlay 4 live tile components as separate DOM elements
04-central-tray.svg — empty central tray with ornamental central pattern, 620x315
05-player-panel.svg — opponent player-card frame, 652x292
06-own-board-frame.svg — own board frame, 712x452
07-burn-button.svg — burn button decoration, overlay dynamic Persian label
08-empty-tile.svg — neutral tile slot
09-tile-{blue,red,yellow,green,black}.svg — five tile variants

Use SVG files as assets in <img> or CSS background-image with object-fit/size constraints; don't convert the entire board to one screenshot. UI must remain accessible and interactive. Preview reference proportions carefully; SVG aspect ratios must be respected.

Pattern walls (left-to-right, top-to-bottom):
blue red yellow green black
red yellow green black blue
yellow green black blue red
green black blue red yellow
black blue red yellow green

Pattern lines: 1,2,3,4,5 slots top-to-bottom, aligned to the right, total 15. These should be transparent/neutral empty slots in DOM.
