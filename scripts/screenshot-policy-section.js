// Screenshot autenticado da seção "Política de credenciais e substituições"
// na tela de edição do evento (validação visual da Fase 7 — UI).
const { chromium } = require('playwright-core')

const BASE = 'http://localhost:3000'
const SLUG = process.argv[2] || 'treinamento-credenciamento'

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  })
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })

  // Login
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'megafeira@megafeira.com')
  await page.fill('input[type="password"]', 'Mega-Feira')
  await page.click('button[type="submit"]')
  await page.waitForURL(/admin(?!\/login)/, { timeout: 20000 })

  // Tela de edição do evento
  await page.goto(`${BASE}/admin/super/eventos/${SLUG}/editar`, { waitUntil: 'networkidle' })
  const section = page.locator('h2:has-text("Política de credenciais e substituições")').locator('..')
  await section.waitFor({ timeout: 20000 })

  // Liga o toggle para o campo condicional aparecer no screenshot
  await page.locator('text=Limitar substituições durante o evento').click()
  await page.waitForTimeout(300)

  await section.screenshot({ path: 'screenshot-policy-section.png' })
  console.log('screenshot salvo: screenshot-policy-section.png')
  await browser.close()
}

main().catch((e) => { console.error(e.message); process.exit(1) })
