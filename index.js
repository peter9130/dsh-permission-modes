/**
 * Host half of the permission-modes bundle.
 *
 * Two responsibilities:
 *
 * 1. The `approval/request` answerer that makes 无需确认 (auto) mean "agree
 *    without asking". The approval policy union is `ask | never`, and `never`
 *    rejects before any answerer runs, so the auto presets keep `ask` and this
 *    prepended listener returns `allowed-once` while the Session's current
 *    preset is one of the three `*-auto` ones. Every other preset delegates to
 *    the deployment's own answerers (the Web UI asks the user).
 * 2. An optional diagnostic sink (`POST /permission-modes/log`) for the browser
 *    half: a crashed slot entry abdicates silently in the page, so the report
 *    lands in `~/.dsh/permission-modes.log` instead.
 */
import { appendFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Presets whose approval requests are answered automatically. */
const AUTO_PRESETS = new Set([
  'read-only-auto',
  'workspace-write-auto',
  'danger-full-access-auto',
])

const LOG_PATH = join(homedir(), '.dsh', 'permission-modes.log')

/** Collapse a crash loop: one line per distinct report per ten seconds. */
let lastReport = ''
let lastReportAt = 0

/**
 * Append one reported failure, dropping immediate repeats.
 * @param body - Raw request body from the browser half.
 */
function record(body) {
  const now = Date.now()
  if (body === lastReport && now - lastReportAt < 10_000) return
  lastReport = body
  lastReportAt = now
  appendFile(LOG_PATH, `${new Date(now).toISOString()} ${body}\n`).catch(() => {})
}

/**
 * Mount the auto-approval answerer and the diagnostic sink.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  // Outermost answerer: an auto preset approves its own requests before the
  // deployment's answerers can prompt. Everything else falls through.
  ctx.on('approval/request', (request, next) => {
    const presets = ctx.get('permissionPresets')
    const session = request === undefined || request === null || request.agent === undefined
      ? undefined
      : request.agent.session
    if (presets === undefined || presets === null || session === undefined) return next()
    let name
    try {
      name = presets.current(session)
    } catch (error) {
      return next()
    }
    return AUTO_PRESETS.has(name) ? 'allowed-once' : next()
  }, true)

  const webServer = ctx.get('webServer')
  if (webServer === undefined || webServer === null) return
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/permission-modes/log',
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      const chunks = []
      req.on('data', chunk => { chunks.push(chunk) })
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').slice(0, 8000)
        if (body.length > 0) record(body)
        res.writeHead(204)
        res.end()
      })
    },
  }), 'permission-modes: diagnostic sink')
}
