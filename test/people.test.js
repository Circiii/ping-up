import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parsePeople, unpack } from '../src/scene/humans.js'

const file = readFileSync(new URL('../src/scene/people.dat', import.meta.url))
const people = parsePeople(await unpack(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)))

test('every character has the crowd poses on three levels of detail', () => {
  assert.ok(people.chars.length >= 5)
  for (const c of people.chars) {
    assert.ok(c.poses.includes('high') && c.poses.includes('eye'), c.id)
    assert.equal(c.lods.length, 3, c.id)
    // mai simplu pe fiecare treapta
    const tris = c.lods.map((l) => l.poses.high.geometry.index.count / 3)
    assert.ok(tris[0] > tris[1] && tris[1] > tris[2], `${c.id}: ${tris}`)
  }
})

test('the phone sits at (0, 1, 0) and the feet on the ground, in every pose', () => {
  for (const c of people.chars) {
    for (const lod of c.lods) {
      for (const [name, { geometry }] of Object.entries(lod.poses)) {
        const pos = geometry.attributes.position
        const role = geometry.attributes.aRole
        let minY = Infinity
        const screen = [0, 0, 0]
        let n = 0
        for (let i = 0; i < pos.count; i++) {
          minY = Math.min(minY, pos.getY(i))
          if (role.getX(i) === 3) {
            screen[0] += pos.getX(i)
            screen[1] += pos.getY(i)
            screen[2] += pos.getZ(i)
            n++
          }
        }
        assert.ok(n >= 4, `${c.id}/${name}: ecranul lipseste`)
        assert.ok(Math.abs(minY) < 0.02, `${c.id}/${name}: talpile la ${minY}`)
        assert.ok(Math.abs(screen[1] / n - 1) < 0.06, `${c.id}/${name}: telefonul la ${screen[1] / n}`)
        assert.ok(Math.hypot(screen[0] / n, screen[2] / n) < 0.06, `${c.id}/${name}: telefonul in lateral`)
      }
    }
  }
})

test('screen coordinates stay within the glass', () => {
  for (const c of people.chars) {
    const { geometry } = c.lods[0].poses.high
    const s = geometry.attributes.aScreen
    const role = geometry.attributes.aRole
    for (let i = 0; i < s.count; i++) {
      if (role.getX(i) !== 3) continue
      assert.ok(Math.abs(s.getX(i)) <= 1.001 && Math.abs(s.getY(i)) <= 1.001)
    }
  }
})

test('dancers only move the free arm between the cheer and pump poses', () => {
  const dancers = people.chars.filter((c) => c.poses.includes('cheer') && c.poses.includes('pump'))
  assert.ok(dancers.length >= 3)
  for (const c of dancers) {
    const a = c.lods[0].poses.cheer.geometry.attributes.position
    const b = c.lods[0].poses.pump.geometry.attributes.position
    let moved = 0
    let most = 0
    for (let i = 0; i < a.count; i++) {
      const d = Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i))
      if (d > 0.02) moved++
      most = Math.max(most, d)
    }
    // bratul se strange vizibil, iar restul corpului (si telefonul) ramane pe loc
    assert.ok(most > 0.15, `${c.id}: bratul abia se misca (${most})`)
    assert.ok(moved / a.count < 0.25, `${c.id}: se misca prea mult din corp (${moved}/${a.count})`)
  }
})
