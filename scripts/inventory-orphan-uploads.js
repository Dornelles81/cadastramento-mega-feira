// Inventário de arquivos órfãos em uploads/: arquivos no disco sem nenhuma
// referência em participants (documents/customData/faceImageUrl),
// event_configs (logo/banner/favicon), events (theme/settings/metadata) e
// stands (notes/metadata).
// Uso: node scripts/inventory-orphan-uploads.js [--delete]
require('dotenv').config({ path: '.env.local', quiet: true })
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const DELETE = process.argv.includes('--delete')
const prisma = new PrismaClient()
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const REF_PATTERN = /\/(?:api\/)?uploads\/([^"\\]+)/g

async function collectDbRefs() {
  const refs = new Set()
  const scan = (obj) => {
    if (obj === null || obj === undefined) return
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj)
    for (const m of s.matchAll(REF_PATTERN)) refs.add(decodeURIComponent(m[1]))
  }
  const parts = await prisma.participant.findMany({
    select: { documents: true, customData: true, faceImageUrl: true }
  })
  for (const r of parts) {
    scan(r.documents)
    scan(r.customData)
    if (r.faceImageUrl && !r.faceImageUrl.startsWith('data:')) scan(r.faceImageUrl)
  }
  const cfgs = await prisma.eventConfig.findMany({
    select: { logoUrl: true, bannerUrl: true, faviconUrl: true }
  })
  for (const r of cfgs) {
    for (const k of ['logoUrl', 'bannerUrl', 'faviconUrl']) {
      if (r[k] && !r[k].startsWith('data:')) scan(r[k])
    }
  }
  const events = await prisma.event.findMany({ select: { theme: true, settings: true, metadata: true } })
  for (const r of events) { scan(r.theme); scan(r.settings); scan(r.metadata) }
  const stands = await prisma.stand.findMany({ select: { notes: true, metadata: true } })
  for (const r of stands) { scan(r.notes); scan(r.metadata) }
  return refs
}

function walkFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walkFiles(path.join(dir, e.name), base + e.name + '/')
      : e.name === '.gitignore' ? [] : [base + e.name]
  )
}

async function main() {
  const refs = await collectDbRefs()
  console.log('referências /uploads vivas no banco:', refs.size, [...refs].slice(0, 10))

  const files = walkFiles(UPLOAD_DIR)
  const orphans = files.filter((f) => !refs.has(f))
  const referenced = files.filter((f) => refs.has(f))
  const brokenRefs = [...refs].filter((r) => !files.includes(r))
  console.log('arquivos no disco:', files.length)
  console.log('  com referência viva:', referenced.length)
  console.log('  órfãos:', orphans.length)
  console.log('referências quebradas (banco aponta, arquivo não existe):', brokenRefs.length, brokenRefs.slice(0, 5))

  const byExt = {}
  let bytes = 0
  for (const o of orphans) {
    const ext = path.extname(o).toLowerCase() || '(sem ext)'
    byExt[ext] = (byExt[ext] || 0) + 1
    bytes += fs.statSync(path.join(UPLOAD_DIR, o)).size
  }
  console.log('órfãos por extensão:', JSON.stringify(byExt), '| volume:', (bytes / 1024 / 1024).toFixed(1), 'MB')
  console.log('amostra:', orphans.slice(0, 10))

  if (DELETE) {
    let deleted = 0
    for (const o of orphans) {
      fs.unlinkSync(path.join(UPLOAD_DIR, o))
      deleted++
    }
    console.log('DELETADOS:', deleted, 'arquivos órfãos')
  } else {
    console.log('(modo inventário — use --delete para a faxina após aprovação)')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
