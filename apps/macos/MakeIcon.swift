import AppKit

let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let factor = CGFloat(pixels) / 512
        let transform = NSAffineTransform()
        transform.scale(by: factor)
        transform.concat()
        NSColor(calibratedRed: 0.025, green: 0.065, blue: 0.11, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 18, y: 18, width: 476, height: 476), xRadius: 108, yRadius: 108).fill()
        NSColor(calibratedRed: 0.22, green: 0.74, blue: 0.97, alpha: 1).setStroke()
        let arc = NSBezierPath(); arc.lineWidth = 42; arc.lineCapStyle = .round
        arc.move(to: NSPoint(x: 112, y: 176))
        arc.curve(to: NSPoint(x: 404, y: 253), controlPoint1: NSPoint(x: 154, y: 385), controlPoint2: NSPoint(x: 349, y: 404))
        arc.stroke()
        let lower = NSBezierPath(); lower.lineWidth = 38; lower.lineCapStyle = .round
        lower.move(to: NSPoint(x: 112, y: 176))
        lower.curve(to: NSPoint(x: 398, y: 176), controlPoint1: NSPoint(x: 179, y: 330), controlPoint2: NSPoint(x: 331, y: 330))
        lower.stroke()
        NSColor(calibratedRed: 0.49, green: 0.83, blue: 0.99, alpha: 1).setFill()
        for point in [NSPoint(x: 112,y: 176), NSPoint(x: 398,y: 176)] {
            NSBezierPath(ovalIn: NSRect(x: point.x-26, y: point.y-26, width: 52, height: 52)).fill()
        }
        NSColor.white.setFill()
        NSBezierPath(ovalIn: NSRect(x: 238,y: 271,width: 36,height: 36)).fill()
        NSGraphicsContext.restoreGraphicsState()
        let data = bitmap.representation(using: .png, properties: [:])!
        try data.write(to: destination.appendingPathComponent("icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"))
    }
}
