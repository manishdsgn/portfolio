import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath, durationArgument] = process.argv.slice(2);
const targetDuration = Number(durationArgument);

if (!inputPath || !outputPath || !Number.isFinite(targetDuration) || targetDuration <= 0) {
  throw new Error("Usage: node tools/trim_mp3.mjs <input> <output> <duration-seconds>");
}

const source = await readFile(inputPath);
const mpeg1Layer3Bitrates = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const mpeg2Layer3Bitrates = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const sampleRates = [44100, 48000, 32000];

function readFrame(offset) {
  if (offset + 4 > source.length) return null;
  const header = source.readUInt32BE(offset);
  if (((header & 0xffe00000) >>> 0) !== 0xffe00000) return null;

  const versionBits = (header >>> 19) & 0b11;
  const layerBits = (header >>> 17) & 0b11;
  const bitrateIndex = (header >>> 12) & 0b1111;
  const sampleRateIndex = (header >>> 10) & 0b11;
  const padding = (header >>> 9) & 1;

  if (
    versionBits === 0b01 ||
    layerBits !== 0b01 ||
    bitrateIndex === 0 ||
    bitrateIndex === 0b1111 ||
    sampleRateIndex === 0b11
  ) return null;

  const isMpeg1 = versionBits === 0b11;
  const versionDivisor = isMpeg1 ? 1 : versionBits === 0b10 ? 2 : 4;
  const bitrateTable = isMpeg1 ? mpeg1Layer3Bitrates : mpeg2Layer3Bitrates;
  const bitrate = bitrateTable[bitrateIndex] * 1000;
  const sampleRate = sampleRates[sampleRateIndex] / versionDivisor;
  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  const byteLength = Math.floor(
    (isMpeg1 ? 144 : 72) * bitrate / sampleRate,
  ) + padding;

  return {
    byteLength,
    duration: samplesPerFrame / sampleRate,
  };
}

let firstFrameOffset = 0;
while (firstFrameOffset < source.length && readFrame(firstFrameOffset) === null) {
  firstFrameOffset += 1;
}

if (firstFrameOffset >= source.length) {
  throw new Error("No MPEG Layer III audio frame was found.");
}

let offset = firstFrameOffset;
let duration = 0;
let frames = 0;

while (offset < source.length && duration < targetDuration) {
  const frame = readFrame(offset);
  if (frame === null || offset + frame.byteLength > source.length) break;
  offset += frame.byteLength;
  duration += frame.duration;
  frames += 1;
}

if (frames === 0) throw new Error("The MP3 did not contain any complete frames.");

await writeFile(outputPath, source.subarray(firstFrameOffset, offset));
console.log(JSON.stringify({ frames, duration, bytes: offset - firstFrameOffset }));
