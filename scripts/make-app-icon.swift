#!/usr/bin/env swift
//
// Draws Sajilo's app icon and writes scripts/AppIcon.icns.
//
// The icon is generated rather than hand-drawn so it stays in step with the
// palette: the brass and charcoal below are the same values Theme.Palette uses
// for the patro skin, and changing them there means re-running this.
//
//   swift scripts/make-app-icon.swift
//
// Every size is drawn at its own resolution rather than downscaled from 1024.
// The 16pt icon is two thirds spine and one third glyph — at that size a
// downscaled version of the large art turns to mud.

import AppKit
import CoreText

// MARK: - Palette

/// Warm charcoal, tinted toward the brass rather than a neutral grey, so the
/// two colours read as one material.
let inkTop = NSColor(srgbRed: 0.153, green: 0.141, blue: 0.125, alpha: 1)
let inkBottom = NSColor(srgbRed: 0.086, green: 0.078, blue: 0.067, alpha: 1)

/// The `patro` brand brass, lit from above as a real gilt surface would be.
let brassLight = NSColor(srgbRed: 0.831, green: 0.686, blue: 0.384, alpha: 1)
let brassMid = NSColor(srgbRed: 0.690, green: 0.549, blue: 0.247, alpha: 1)
let brassDeep = NSColor(srgbRed: 0.478, green: 0.365, blue: 0.141, alpha: 1)

// MARK: - Drawing

func drawIcon(side: CGFloat, into context: CGContext) {
    let scale = side / 1024

    context.setFillColor(NSColor.clear.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: side, height: side))

    // Apple's macOS grid: an 824pt body on a 1024pt canvas, so the icon sits
    // at the same visual weight as every system app beside it in the Dock.
    let body = CGRect(x: 100 * scale, y: 108 * scale, width: 824 * scale, height: 824 * scale)
    let radius = 185.4 * scale
    let shape = CGPath(roundedRect: body, cornerWidth: radius, cornerHeight: radius, transform: nil)

    // Contact shadow, so the tile sits on the desktop instead of floating.
    context.saveGState()
    context.setShadow(
        offset: CGSize(width: 0, height: -10 * scale),
        blur: 22 * scale,
        color: NSColor(white: 0, alpha: 0.34).cgColor
    )
    context.addPath(shape)
    context.setFillColor(inkBottom.cgColor)
    context.fillPath()
    context.restoreGState()

    context.saveGState()
    context.addPath(shape)
    context.clip()

    fillVertical(context, rect: body, from: inkTop, to: inkBottom)

    // The spine. A patro hangs from a printed band, and it is the one element
    // that still reads as a calendar at 16pt, where the glyph is four pixels
    // tall. Proportionally deeper at small sizes for exactly that reason.
    let spineFraction: CGFloat = side <= 32 ? 0.34 : 0.25
    let spine = CGRect(
        x: body.minX,
        y: body.maxY - body.height * spineFraction,
        width: body.width,
        height: body.height * spineFraction
    )
    fillVertical(context, rect: spine, from: brassLight, to: brassMid)

    // A single hanging hole punched out of the spine, in the tile's own ink so
    // it reads as a hole rather than a dot. Dropped below 64pt, where it would
    // close up into a smudge.
    if side >= 64 {
        let holeSide = spine.height * 0.26
        let hole = CGRect(
            x: body.midX - holeSide / 2,
            y: spine.midY - holeSide / 2,
            width: holeSide,
            height: holeSide
        )
        context.setFillColor(inkTop.cgColor)
        context.fillEllipse(in: hole)
    }

    drawGlyph(in: body, below: spine, context: context, side: side)

    context.restoreGState()

    // Hairline edge, so the tile keeps its shape against a dark wallpaper.
    context.addPath(shape)
    context.setStrokeColor(NSColor(white: 1, alpha: 0.10).cgColor)
    context.setLineWidth(max(1, 2 * scale))
    context.strokePath()
}

/// स — the first letter of सजिलो, and a monogram rather than a flag or a
/// generic calendar page. It carries the Devanagari headline across its top,
/// which echoes the spine above it.
func drawGlyph(in body: CGRect, below spine: CGRect, context: CGContext, side: CGFloat) {
    let field = CGRect(
        x: body.minX,
        y: body.minY,
        width: body.width,
        height: spine.minY - body.minY
    )

    // Chunkier at small sizes: below 32pt the letter is a handful of pixels
    // and needs the extra weight, where at 512 the same ratio crowds the tile.
    let fill: CGFloat = side <= 32 ? 0.78 : 0.66
    let font = devanagariFont(ofSize: field.height * fill)
    let attributed = NSAttributedString(
        string: "स",
        attributes: [.font: font, .foregroundColor: brassLight]
    )

    let line = CTLineCreateWithAttributedString(attributed)
    let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)

    context.saveGState()
    context.textMatrix = .identity
    // Nudged above the geometric centre. Devanagari hangs from its headline
    // rather than sitting on a baseline, so a mathematically centred glyph
    // reads as having sunk.
    context.textPosition = CGPoint(
        x: field.midX - bounds.midX,
        y: field.midY - bounds.midY + field.height * 0.04
    )

    // Filled from the glyph's own path so the gilt gradient runs through the
    // letter rather than sitting behind a flat fill.
    if let path = glyphPath(from: line, at: context.textPosition) {
        context.addPath(path)
        context.clip()
        fillVertical(context, rect: bounds.offsetBy(dx: context.textPosition.x, dy: context.textPosition.y),
                     from: brassLight, to: brassDeep)
    } else {
        CTLineDraw(line, context)
    }
    context.restoreGState()
}

func glyphPath(from line: CTLine, at origin: CGPoint) -> CGPath? {
    let combined = CGMutablePath()
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let attributes = CTRunGetAttributes(run) as NSDictionary
        guard let font = attributes[kCTFontAttributeName as String] else { continue }
        let runFont = font as! CTFont

        let count = CTRunGetGlyphCount(run)
        var glyphs = [CGGlyph](repeating: 0, count: count)
        var positions = [CGPoint](repeating: .zero, count: count)
        CTRunGetGlyphs(run, CFRangeMake(0, count), &glyphs)
        CTRunGetPositions(run, CFRangeMake(0, count), &positions)

        for index in 0..<count {
            guard let letter = CTFontCreatePathForGlyph(runFont, glyphs[index], nil) else { continue }
            let transform = CGAffineTransform(
                translationX: origin.x + positions[index].x,
                y: origin.y + positions[index].y
            )
            combined.addPath(letter, transform: transform)
        }
    }
    return combined.isEmpty ? nil : combined
}

/// Kohinoor Devanagari is the face macOS itself sets Devanagari in, so the
/// icon matches the app's own text rather than introducing a second voice.
func devanagariFont(ofSize size: CGFloat) -> NSFont {
    for name in ["KohinoorDevanagari-Semibold", "KohinoorDevanagari-Medium", "DevanagariMT-Bold"] {
        if let font = NSFont(name: name, size: size) { return font }
    }
    return NSFont.systemFont(ofSize: size, weight: .semibold)
}

func fillVertical(_ context: CGContext, rect: CGRect, from top: NSColor, to bottom: NSColor) {
    guard let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [bottom.cgColor, top.cgColor] as CFArray,
        locations: [0, 1]
    ) else { return }

    context.saveGState()
    context.clip(to: rect)
    context.drawLinearGradient(
        gradient,
        start: CGPoint(x: rect.midX, y: rect.minY),
        end: CGPoint(x: rect.midX, y: rect.maxY),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )
    context.restoreGState()
}

// MARK: - Output

func render(side: Int) throws -> Data {
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: side, pixelsHigh: side,
        bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0
    ) else { throw Failure("could not allocate a \(side)px bitmap") }

    NSGraphicsContext.saveGraphicsState()
    defer { NSGraphicsContext.restoreGraphicsState() }
    guard let graphics = NSGraphicsContext(bitmapImageRep: rep) else {
        throw Failure("could not bind a drawing context to the bitmap")
    }
    NSGraphicsContext.current = graphics
    drawIcon(side: CGFloat(side), into: graphics.cgContext)
    graphics.flushGraphics()

    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw Failure("could not encode the \(side)px bitmap as PNG")
    }
    return data
}

struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

let scriptsDirectory = URL(fileURLWithPath: CommandLine.arguments[0])
    .deletingLastPathComponent()
let iconset = scriptsDirectory.appendingPathComponent("AppIcon.iconset")
let icns = scriptsDirectory.appendingPathComponent("AppIcon.icns")

try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

// The ten variants `iconutil` expects. Missing one leaves macOS interpolating
// that size from another, which is what makes a hand-made icon look soft.
let variants: [(name: String, side: Int)] = [
    ("icon_16x16", 16), ("icon_16x16@2x", 32),
    ("icon_32x32", 32), ("icon_32x32@2x", 64),
    ("icon_128x128", 128), ("icon_128x128@2x", 256),
    ("icon_256x256", 256), ("icon_256x256@2x", 512),
    ("icon_512x512", 512), ("icon_512x512@2x", 1024),
]

for variant in variants {
    let data = try render(side: variant.side)
    try data.write(to: iconset.appendingPathComponent("\(variant.name).png"))
}

let iconutil = Process()
iconutil.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
iconutil.arguments = ["--convert", "icns", iconset.path, "--output", icns.path]
try iconutil.run()
iconutil.waitUntilExit()
guard iconutil.terminationStatus == 0 else {
    throw Failure("iconutil exited \(iconutil.terminationStatus)")
}

print("Wrote \(icns.path)")
