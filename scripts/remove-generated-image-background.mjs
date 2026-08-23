import path from "node:path";
import sharp from "sharp";

function isGeneratedBackdrop(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const alpha = data[offset + 3];
  const brightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);
  const neutral = brightest - darkest <= 24;
  return alpha === 0 || (neutral && (darkest >= 185 || brightest <= 40));
}

async function removeConnectedBackdrop(inputPath) {
  const image = sharp(inputPath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  function enqueue(pixel) {
    if (visited[pixel]) return;
    if (!isGeneratedBackdrop(data, pixel * channels)) return;
    visited[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        enqueue(nextY * width + nextX);
      }
    }
  }

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (visited[pixel]) data[pixel * channels + 3] = 0;
  }

  const parsed = path.parse(inputPath);
  const outputName = parsed.ext.toLowerCase() === ".png"
    ? `${parsed.name}-transparent.png`
    : `${parsed.name}.png`;
  const outputPath = path.join(parsed.dir, outputName);
  await sharp(data, { raw: info }).png().toFile(outputPath);
  return { outputPath, removedPixels: tail, pixelCount };
}

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  throw new Error("usage: node scripts/remove-generated-image-background.mjs <image> [...images]");
}

for (const inputPath of inputs) {
  const result = await removeConnectedBackdrop(inputPath);
  console.log(
    `${inputPath}: removed ${result.removedPixels}/${result.pixelCount} background pixels -> ${result.outputPath}`,
  );
}
