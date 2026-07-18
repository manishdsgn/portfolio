import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliCompress, createGzip, constants } from "node:zlib";
import { pipeline } from "node:stream/promises";

const toolDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(toolDir, "..", "dist");
const compressibleExtensions = new Set([
  ".bin",
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".xml",
]);
const minimumBytes = 1024;

function getExtension(filePath) {
  const dotIndex = filePath.lastIndexOf(".");
  return dotIndex === -1 ? "" : filePath.slice(dotIndex);
}

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walk(entryPath);
      continue;
    }

    if (entry.isFile()) {
      yield entryPath;
    }
  }
}

async function compressFile(filePath, extension, streamFactory) {
  await pipeline(
    createReadStream(filePath),
    streamFactory(),
    createWriteStream(`${filePath}${extension}`),
  );
}

async function precompress() {
  let compressedCount = 0;

  for await (const filePath of walk(distDir)) {
    if (
      filePath.endsWith(".br") ||
      filePath.endsWith(".gz") ||
      !compressibleExtensions.has(getExtension(filePath))
    ) {
      continue;
    }

    const fileStat = await stat(filePath);
    if (fileStat.size < minimumBytes) continue;

    await Promise.all([
      compressFile(filePath, ".gz", () => createGzip({ level: 9 })),
      compressFile(filePath, ".br", () =>
        createBrotliCompress({
          params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
          },
        }),
      ),
    ]);
    compressedCount += 1;
  }

  console.log(`precompressed ${compressedCount} dist assets`);
}

precompress().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
