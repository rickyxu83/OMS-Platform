const fs = require('fs')
const path = require('path')
const EVIDENCE_DIR = path.resolve(__dirname, '../../../../.sisyphus/evidence')
function ensureDir() { if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true }) }
async function captureTextEvidence(name, content) { ensureDir(); fs.writeFileSync(path.join(EVIDENCE_DIR, name), content, 'utf-8') }
async function captureScreenshotEvidence(page, name) { ensureDir(); await page.screenshot({ path: path.join(EVIDENCE_DIR, name), fullPage: true }) }
module.exports = { captureTextEvidence, captureScreenshotEvidence }
