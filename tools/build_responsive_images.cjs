const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "..");

const variants = [
  {
    input: "public/barn-owl-logo.png",
    widths: [96, 192, 288],
    output(width) {
      return `public/barn-owl-logo-${width}.webp`;
    },
    webp: { lossless: true, effort: 6 },
  },
  ...["design", "photography", "code"].map((name) => ({
    input: `public/card-covers/${name}.webp`,
    widths: [360, 720],
    output(width) {
      return `public/card-covers/${name}-${width}.webp`;
    },
    // Card covers contain type and fine graphic edges. Lossless WebP keeps the
    // resized pixels exact while still avoiding the oversized source texture.
    webp: { lossless: true, effort: 6 },
  })),
  ...["design", "photography", "code"].map((name) => ({
    input: `public/card-fronts/${name}-front.jpg`,
    widths: name === "design" ? [400, 640] : [400],
    output(width) {
      return `public/card-fronts/${name}-front-${width}.webp`;
    },
    webp: { quality: 92, smartSubsample: true, effort: 6 },
  })),
];

async function buildVariant(definition, width) {
  const input = path.join(projectRoot, definition.input);
  const output = path.join(projectRoot, definition.output(width));

  await sharp(input, { failOn: "warning" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp(definition.webp)
    .toFile(output);
}

async function main() {
  for (const definition of variants) {
    await Promise.all(
      definition.widths.map((width) => buildVariant(definition, width)),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
