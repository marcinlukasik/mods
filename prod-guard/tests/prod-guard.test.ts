import { describe, expect, test } from 'claude-code/testing'

function stubEngine(on: any, opened?: () => void, surfaces: string[] = ['desktop']) {
  let ran = 0
  on('process.run', async ($: any, e: any) => {
    const argv: string[] = e.argv
    if (argv[0] === 'sleep') {
      await new Promise(res => setTimeout(res, 10))
      return { value: { exitCode: 0, stdout: '', stderr: '' } }
    }
    if (argv.includes('--abbrev-ref')) return { value: { exitCode: 0, stdout: 'feature/x\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.open', () => {
    opened?.()
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('fs.read', () => { throw new Error('missing') })
  on('tool.call', () => {
    ran += 1
    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }
  })
  return { ran: () => ran }
}

describe('prod-guard', () => {
  test('harmless commands run untouched', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const engine = stubEngine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    const r: any = await $.tool.call({ tool: 'Bash', command: 'ls -la' } as any)
    expect(r.deny).toBeUndefined()
    expect(engine.ran()).toBe(1)
  })

  test('risky commands are refused when no one can confirm', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const engine = stubEngine(on, undefined, [])
    await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as any)
    const r: any = await $.tool.call({ tool: 'Bash', command: 'vercel deploy --prod' } as any)
    expect(r.deny ?? r.text).toMatch(/Prod Guard/)
    expect(engine.ran()).toBe(0)
  })

  for (const choice of ['cancel', 'proceed'] as const) {
    test(`pressing ${choice} decides the held command`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      let markOpened!: () => void
      const opened = new Promise<void>(res => (markOpened = res))
      const engine = stubEngine(on, () => markOpened())
      await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as any)

      const call: Promise<any> = $.tool.call({ tool: 'Bash', command: 'git push --force origin feature/x' } as any)
      await opened
      const ui = await $.ui.mount({
        plugin: 'prod-guard',
        surface: 'terminal',
        component: 'Pane',
        requestId: 'prod-guard',
        props: {},
      } as any)
      expect(await ui.find({ type: 'Text', text: /Force push/ })).toBeDefined()
      await ui.press({ key: choice })
      const r = await call
      if (choice === 'cancel') {
        expect(r.deny ?? r.text).toMatch(/did not approve/)
        expect(engine.ran()).toBe(0)
      } else {
        expect(r.deny).toBeUndefined()
        expect(engine.ran()).toBe(1)
      }
      await ui.unmount()
    })
  }
})
