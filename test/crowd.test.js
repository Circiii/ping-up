import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCrowd, rng, shuffle } from '../src/scene/crowd.js'

test('shuffle depends only on the seed', () => {
  const a = shuffle([...Array(20).keys()], rng(7))
  const b = shuffle([...Array(20).keys()], rng(7))
  assert.deepEqual(a, b)
  assert.deepEqual([...a].sort((x, y) => x - y), [...Array(20).keys()])
  assert.notDeepEqual(a, [...Array(20).keys()])
})

for (const density of [1, 0.45]) {
  test(`the story holds at density ${density}: Ana 3 hops away, medical team 5`, () => {
    const crowd = createCrowd({ density })
    assert.equal(crowd.hops.ana, 3)
    assert.equal(crowd.scenarios.report.hop[crowd.ids.medic], 5)
    assert.ok(crowd.times.delivered < 1e5, 'the reply reaches you')
    assert.ok(crowd.times.ack < 1e5, 'the ack reaches the reporter')
  })
}
