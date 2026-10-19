#!/usr/bin/env node
/**
 * Generates the plugin's icons, rendered to the PNG sizes Stream Deck requires (1x and `@2x`). The glyphs come from
 * `@daczarne/streamdeck-icons`, which also builds the MX Master 3S icon pack: this script only decides which glyph goes
 * where, and at what size.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { INK, MOUSE, mouseGlyph, svgDoc, WHITE } from "@daczarne/streamdeck-icons";
import sharp from "sharp";

const root = path.resolve("com.daczarne.mx3s.sdPlugin/imgs");

/** How much of its canvas's height the mouse covers as drawn. */
const MOUSE_SPAN = MOUSE.bottom - MOUSE.top;

/**
 * How much of each icon's height the mouse covers. In the category icon, as much as in the MX Master 3S icon pack's
 * own icon, as `scripts/packs/mx3s.mjs` of `@daczarne/streamdeck-icons` sizes it. In the marketplace icon, less, to
 * leave a margin inside its tile, about as much as the lamp leaves in the Litra plugin's.
 */
const ICON_SPANS = { category: 0.86, marketplace: 0.7 };

/** The corner radius of the marketplace icon's tile, as a share of its side, as the Litra plugin's has. */
const TILE_RADIUS = 0.18;

/**
 * Renders a glyph to a square PNG, creating its folder if needed.
 *
 * @param {string} filePath where to write the PNG
 * @param {string} svg the glyph's SVG elements, without the document around them
 * @param {number} size the PNG's width and height, in pixels
 * @returns {Promise<void>}
 */
async function writePng(filePath, svg, size) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp(Buffer.from(svgDoc(size, svg)))
    .png()
    .toFile(filePath);
  console.log("wrote", filePath);
}

/**
 * Renders a glyph at the size Stream Deck asks for and at twice that size, for high-density screens.
 *
 * @param {string} basePathNoExt the path of the PNGs, without `.png` or `@2x.png`
 * @param {(size: number) => string} svgAt1x draws the glyph's SVG elements at a size
 * @param {number} size1x the smaller PNG's width and height, in pixels
 * @returns {Promise<void>}
 */
async function writePair(basePathNoExt, svgAt1x, size1x) {
  await writePng(`${basePathNoExt}.png`, svgAt1x(size1x), size1x);
  await writePng(`${basePathNoExt}@2x.png`, svgAt1x(size1x * 2), size1x * 2);
}

/**
 * The filled mouse, scaled about the center to cover `span` of its canvas's height.
 *
 * @param {number} size the side of its square canvas
 * @param {number} span
 * @param {string} [color] the glyph's default when left out
 * @returns {string} its SVG markup
 */
function filledMouse(size, span, color) {
  const c = size / 2;
  const glyph = color === undefined ? mouseGlyph(size, { filled: true }) : mouseGlyph(size, { filled: true, color });
  return `<g transform="translate(${c} ${c}) scale(${span / MOUSE_SPAN}) translate(${-c} ${-c})">${glyph}</g>`;
}

/**
 * The category icon: the filled mouse, white on transparent.
 *
 * @param {number} size the side of its square canvas
 * @returns {string} its SVG markup
 */
function categoryIcon(size) {
  return filledMouse(size, ICON_SPANS.category);
}

/**
 * The marketplace icon: the filled mouse in the palette's white, on a rounded tile in its ink, so it shows on a light
 * page as well as on the Stream Deck app's dark one.
 *
 * @param {number} size the side of its square canvas
 * @returns {string} its SVG markup
 */
function marketplaceIcon(size) {
  return `<rect width="${size}" height="${size}" rx="${size * TILE_RADIUS}" fill="${INK}"/>
    ${filledMouse(size, ICON_SPANS.marketplace, WHITE)}`;
}

/**
 * Writes every icon the plugin's manifest points to that is drawn here.
 *
 * @returns {Promise<void>}
 */
async function main() {
  // Category (28 / 56): the plugin's icon in the Stream Deck app's list of actions
  await writePair(path.join(root, "plugin/category-icon"), categoryIcon, 28);

  // Marketplace (256 / 512): the plugin's icon in the Stream Deck app's list of plugins
  await writePair(path.join(root, "plugin/marketplace"), marketplaceIcon, 256);

  console.log("Icons generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
