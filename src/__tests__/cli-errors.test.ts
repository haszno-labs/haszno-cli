import { afterEach, expect, it, vi } from 'vitest'
import { HasznoApiError } from '../client/error.js'
import { configureCliErrors, failCli, writeCliError } from '../client/cli-error.js'

afterEach(() => {
  configureCliErrors(() => false, [])
  vi.restoreAllMocks()
})

it('writes one JSON stderr line with HTTP metadata and without credentials', () => {
  configureCliErrors(() => true, ['legacy-secret'])
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  writeCliError(new HasznoApiError(403, 'legacy-secret and haszno_live_example', 'forbidden', 'req-test'))

  expect(stderr).toHaveBeenCalledTimes(1)
  const value = String(stderr.mock.calls[0]?.[0])
  expect(JSON.parse(value)).toMatchObject({
    error: '[kitakarva] and [kitakarva]', code: 'forbidden', status: 403, requestId: 'req-test',
  })
  expect(stdout).not.toHaveBeenCalled()
})

it('preserves the requested validation exit code', () => {
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  expect(() => failCli('Invalid flag', 2, { json: true })).toThrow('exit')
  expect(exit).toHaveBeenCalledWith(2)
  expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toEqual({ error: 'Invalid flag', code: 'invalid_input' })
})

it('redacts an echoed short password without mangling words or machine-readable codes', () => {
  configureCliErrors(() => true, ['e', 'a:b'])
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  writeCliError(new HasznoApiError(401, 'Rejected "e" and a:b', 'unauthenticated', 'request-e2'))
  expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
    error: 'Rejected "[kitakarva]" and [kitakarva]',
    code: 'unauthenticated', requestId: 'request-e2',
  })
})
