import { expect, test } from 'claude-code/testing'

import { parseCavemanMode, rcRow } from '../hooks/register'

test('RC row counts attached remote clients', () => {
  expect(rcRow('session_x', ['terminal', 'mobile', 'desktop'])?.text).toBe('2 attached')
})

test('RC row says on with no remote clients', () => {
  expect(rcRow('session_x', ['terminal'])?.text).toBe('on')
})

test('no RC row outside Remote Control', () => {
  expect(rcRow(undefined, ['terminal', 'mobile'])).toBeNull()
})

test('caveman mode read from the flag', () => {
  expect(parseCavemanMode('lite\n')).toBe('lite')
  expect(parseCavemanMode('FULL')).toBe('full')
})

test('caveman off, missing or unknown reads as null', () => {
  expect(parseCavemanMode('off')).toBeNull()
  expect(parseCavemanMode(undefined)).toBeNull()
  expect(parseCavemanMode('\u001b[31mevil')).toBeNull()
})
