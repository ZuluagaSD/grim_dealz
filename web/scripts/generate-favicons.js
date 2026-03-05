/**
 * Generate favicon files from icon.svg
 * Run: node scripts/generate-favicons.js
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const SVG_PATH = path.join(__dirname, '..', 'app', 'icon.svg')
const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const APP_DIR = path.join(__dirname, '..', 'app')

/**
 * Build a minimal .ico file containing PNG images.
 * ICO format: 6-byte header + 16-byte directory entries + PNG payloads
 */
function buildIco(pngBuffers, sizes) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4) // image count

  const dirSize = 16 * pngBuffers.length
  let dataOffset = 6 + dirSize
  const dirs = []
  const images = []

  for (let i = 0; i < pngBuffers.length; i++) {
    const buf = pngBuffers[i]
    const size = sizes[i]
    const dir = Buffer.alloc(16)
    dir.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, 1) // height
    dir.writeUInt8(0, 2)  // color palette
    dir.writeUInt8(0, 3)  // reserved
    dir.writeUInt16LE(1, 4)  // color planes
    dir.writeUInt16LE(32, 6) // bits per pixel
    dir.writeUInt32LE(buf.length, 8) // image size
    dir.writeUInt32LE(dataOffset, 12) // offset
    dirs.push(dir)
    images.push(buf)
    dataOffset += buf.length
  }

  return Buffer.concat([header, ...dirs, ...images])
}

async function main() {
  const svg = fs.readFileSync(SVG_PATH)

  // Generate PNGs at required sizes
  const [png16, png32, png180, png192, png512] = await Promise.all([
    sharp(svg).resize(16, 16).png().toBuffer(),
    sharp(svg).resize(32, 32).png().toBuffer(),
    // Apple touch icon: solid background (no transparency)
    sharp(svg).resize(180, 180).flatten({ background: '#0c0c0c' }).png().toBuffer(),
    sharp(svg).resize(192, 192).png().toBuffer(),
    sharp(svg).resize(512, 512).png().toBuffer(),
  ])

  // Build favicon.ico (16 + 32)
  const ico = buildIco([png16, png32], [16, 32])
  fs.writeFileSync(path.join(APP_DIR, 'favicon.ico'), ico)
  console.log('Created app/favicon.ico')

  // Apple touch icon (solid bg, no transparency)
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), png180)
  console.log('Created public/apple-touch-icon.png')

  // PWA icons
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), png192)
  console.log('Created public/icon-192.png')

  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), png512)
  console.log('Created public/icon-512.png')
}

main().catch(console.error)
