// Re-encodes a PQ-coded PNG so it carries a real HDR color space.
//
// The Python side computes PQ code values and writes a plain RGB PNG; this step
// tags those values with ITU-R BT.2100 PQ via ImageIO, so macOS, Chrome, and
// Safari all route the image through the EDR pipeline instead of treating the
// codes as sRGB.
//
// Usage: swift encode-hdr.swift <in.png> <out.png>

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: encode-hdr.swift <in.png> <out.png>\n".data(using: .utf8)!)
    exit(2)
}

let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("cannot read \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

guard let pq = CGColorSpace(name: CGColorSpace.itur_2100_PQ) else {
    FileHandle.standardError.write("PQ color space unavailable\n".data(using: .utf8)!)
    exit(1)
}

// Reinterpret the existing samples in PQ space; the bytes are already PQ code
// values, so this must not resample or convert them.
guard let data = image.dataProvider?.data,
      let provider = CGDataProvider(data: data),
      let tagged = CGImage(
          width: image.width,
          height: image.height,
          bitsPerComponent: image.bitsPerComponent,
          bitsPerPixel: image.bitsPerPixel,
          bytesPerRow: image.bytesPerRow,
          space: pq,
          bitmapInfo: image.bitmapInfo,
          provider: provider,
          decode: nil,
          shouldInterpolate: false,
          intent: .defaultIntent
      ) else {
    FileHandle.standardError.write("cannot retag image\n".data(using: .utf8)!)
    exit(1)
}

guard let dest = CGImageDestinationCreateWithURL(
    outURL as CFURL, UTType.png.identifier as CFString, 1, nil
) else {
    FileHandle.standardError.write("cannot create destination\n".data(using: .utf8)!)
    exit(1)
}

CGImageDestinationAddImage(dest, tagged, nil)
guard CGImageDestinationFinalize(dest) else {
    FileHandle.standardError.write("write failed\n".data(using: .utf8)!)
    exit(1)
}

print("tagged \(outURL.lastPathComponent) as ITU-R BT.2100 PQ")
