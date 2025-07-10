// This will test wav-file generation

import { describe, test } from 'node:test'
import { readFile, writeFile } from 'node:fs/promises'

import * as nuked from '../docs/nuked.js'

describe('WAV file', () => {
  test('Generate wave file', async ({ assert }) => {
    const q = nuked.imf(await readFile('docs/demos/break_my_heart.imf'))
    const o = await nuked.createWave(q)
    // await writeFile('test/break_my_heart.wav', o)
    const t = await readFile('test/break_my_heart.wav')
    assert.strictEqual(o.length, t.length, 'Output length should match expected file length')
    assert.strictEqual(Buffer.compare(o, t), 0, 'Output buffer should match WAV on disk')
  })
})
