import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 단색 PNG 생성 (Node 내장 zlib만 사용) */
function createPNG(size, r, g, b) {
  // IHDR
  function ihdr(w, h) {
    const buf = Buffer.alloc(13)
    buf.writeUInt32BE(w, 0)
    buf.writeUInt32BE(h, 4)
    buf[8] = 8   // bit depth
    buf[9] = 2   // color type RGB
    buf[10] = 0  // compression
    buf[11] = 0  // filter
    buf[12] = 0  // interlace
    return buf
  }

  function crc32(buf) {
    const table = (() => {
      const t = new Uint32Array(256)
      for (let i = 0; i < 256; i++) {
        let c = i
        for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        t[i] = c
      }
      return t
    })()
    let c = 0xffffffff
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crcBuf = Buffer.concat([typeBytes, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(crcBuf))
    return Buffer.concat([len, typeBytes, data, crc])
  }

  // 이미지 데이터: filter byte(0) + RGB * size
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0  // filter
    for (let x = 0; x < size; x++) {
      // 간단한 그라데이션 효과
      const cx = x - size / 2
      const cy = y - size / 2
      const radius = size * 0.4
      const inCircle = Math.sqrt(cx * cx + cy * cy) < radius
      row[1 + x * 3] = inCircle ? 255 : r
      row[1 + x * 3 + 1] = inCircle ? 255 : g
      row[1 + x * 3 + 2] = inCircle ? 255 : b
    }
    rows.push(row)
  }
  const rawData = Buffer.concat(rows)
  const compressed = deflateSync(rawData)

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr(size, size)),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = join(__dirname, '../public/icons')
mkdirSync(outDir, { recursive: true })

// 테마 색상 #185FA5 = RGB(24, 95, 165)
const [r, g, b] = [24, 95, 165]

writeFileSync(join(outDir, 'icon-192x192.png'), createPNG(192, r, g, b))
writeFileSync(join(outDir, 'icon-512x512.png'), createPNG(512, r, g, b))

console.log('아이콘 생성 완료: public/icons/icon-192x192.png, icon-512x512.png')
