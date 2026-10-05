// Minimal CDP client for real-app verification of the plugin.
// Usage: node scripts/cdp.mjs eval "<expression>"
//        node scripts/cdp.mjs shot /tmp/out.png
//        node scripts/cdp.mjs console
import WebSocket from 'ws'
import { writeFileSync } from 'node:fs'

const PORT = process.env.HSP_CDP_PORT || 9333

async function getTarget() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  // main window: the biggest page target that is not a worker/devtools
  const pages = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools'))
  pages.sort((a, b) => (b.url.includes('index') ? 1 : 0) - (a.url.includes('index') ? 1 : 0))
  return pages[0] ?? list[0]
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.console = []
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ')
        this.console.push(`[${msg.params.type}] ${text}`)
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.console.push(`[exception] ${d.text} ${d.exception?.description ?? ''}`)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`timeout: ${method}`))
        }
      }, 30000)
    })
  }
}

const [cmd, ...args] = process.argv.slice(2)
const target = await getTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false })
await new Promise(resolve => ws.on('open', resolve))
const cdp = new CDP(ws)
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')

await new Promise(r => setTimeout(r, 300))

if (cmd === 'eval') {
  const result = await cdp.send('Runtime.evaluate', {
    expression: args[0],
    awaitPromise: true,
    returnByValue: true
  })
  console.log(JSON.stringify(result.result?.value ?? result, null, 2))
} else if (cmd === 'shot') {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(args[0], Buffer.from(result.data, 'base64'))
  console.log(`saved ${args[0]}`)
} else if (cmd === 'console') {
  console.log(cdp.console.slice(-40).join('\n') || '(no console output captured)')
} else if (cmd === 'nav') {
  await cdp.send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(args[0])}` })
  await new Promise(r => setTimeout(r, 1200))
  console.log(`navigated to ${args[0]}`)
} else {
  console.error('unknown command')
}

ws.close()
process.exit(0)
