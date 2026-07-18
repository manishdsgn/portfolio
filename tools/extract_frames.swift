import AppKit
import AVFoundation
import CoreImage
import Foundation

struct VideoMetadata: Encodable {
  let width: Int
  let height: Int
  let fps: Double
  let durationSeconds: Double
  let frameCount: Int
}

enum ExtractionError: Error {
  case invalidArguments
  case noVideoTrack
  case readerCreationFailed
  case readerStartFailed
  case pixelBufferMissing
  case cgImageCreationFailed
  case pngEncodingFailed
}

func makePNG(from image: CGImage) throws -> Data {
  let bitmap = NSBitmapImageRep(cgImage: image)
  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    throw ExtractionError.pngEncodingFailed
  }
  return png
}

let arguments = CommandLine.arguments

guard arguments.count == 3 else {
  FileHandle.standardError.write(Data("Usage: swift extract_frames.swift <source.mp4> <output-dir>\n".utf8))
  throw ExtractionError.invalidArguments
}

let sourceURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2], isDirectory: true)
let fileManager = FileManager.default

try fileManager.createDirectory(at: outputURL, withIntermediateDirectories: true)

let asset = AVURLAsset(url: sourceURL)
guard let track = try await asset.loadTracks(withMediaType: .video).first else {
  throw ExtractionError.noVideoTrack
}

let nominalFrameRate = try await track.load(.nominalFrameRate)
let duration = try await asset.load(.duration)
let reader = try AVAssetReader(asset: asset)
let outputSettings: [String: Any] = [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
]
let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
trackOutput.alwaysCopiesSampleData = false

guard reader.canAdd(trackOutput) else {
  throw ExtractionError.readerCreationFailed
}

reader.add(trackOutput)

guard reader.startReading() else {
  throw ExtractionError.readerStartFailed
}

let ciContext = CIContext(options: nil)
var frameIndex = 0
var width = 0
var height = 0

while let sampleBuffer = trackOutput.copyNextSampleBuffer() {
  guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
    throw ExtractionError.pixelBufferMissing
  }

  if width == 0 || height == 0 {
    width = CVPixelBufferGetWidth(pixelBuffer)
    height = CVPixelBufferGetHeight(pixelBuffer)
  }

  let image = CIImage(cvPixelBuffer: pixelBuffer)
  let rect = CGRect(x: 0, y: 0, width: CVPixelBufferGetWidth(pixelBuffer), height: CVPixelBufferGetHeight(pixelBuffer))
  guard let cgImage = ciContext.createCGImage(image, from: rect) else {
    throw ExtractionError.cgImageCreationFailed
  }

  let data = try makePNG(from: cgImage)
  let frameURL = outputURL.appendingPathComponent(String(format: "frame_%05d.png", frameIndex))
  try data.write(to: frameURL)
  frameIndex += 1
}

let metadata = VideoMetadata(
  width: width,
  height: height,
  fps: Double(nominalFrameRate),
  durationSeconds: CMTimeGetSeconds(duration),
  frameCount: frameIndex
)

let metadataURL = outputURL.appendingPathComponent("frames.json")
let metadataData = try JSONEncoder().encode(metadata)
try metadataData.write(to: metadataURL)

print("Extracted \(frameIndex) frames to \(outputURL.path)")
