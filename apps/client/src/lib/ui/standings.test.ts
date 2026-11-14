import { describe, expect, it } from 'vitest'
import { ffaStanding, sortRows } from './standings.ts'

const row = (id: number, kills: number, deaths: number, captures: number, score: number) => ({
  id,
  kills,
  deaths,
  captures,
  score,
})

// Spec (docs/final-scope.md §2 and §5): FFA shows one table ordered by kills (the score: kills
// minus own deaths) and a top bar with your place, your kills and the leader's.
describe('standings', () => {
  it('orders TDM and FFA by score, then kills, then fewer deaths', () => {
    const rows = [row(1, 5, 2, 0, 4), row(2, 6, 1, 0, 6), row(3, 5, 1, 0, 4), row(4, 4, 0, 0, 4)]
    expect(sortRows(rows, 'ffa').map((r) => r.id)).toEqual([2, 3, 1, 4])
    expect(sortRows(rows, 'tdm').map((r) => r.id)).toEqual([2, 3, 1, 4])
  })

  it('orders CTF by captures first', () => {
    const rows = [row(1, 9, 0, 0, 0), row(2, 1, 5, 2, 2)]
    expect(sortRows(rows, 'ctf').map((r) => r.id)).toEqual([2, 1])
  })

  it('gives the local place, own score and the leader score', () => {
    const rows = [row(1, 3, 0, 0, 3), row(2, 7, 0, 0, 7), row(3, 3, 0, 0, 3), row(4, 1, 0, 0, 1)]
    expect(ffaStanding(rows, 1)).toEqual({ place: 2, of: 4, score: 3, leader: 7 })
    expect(ffaStanding(rows, 2)).toEqual({ place: 1, of: 4, score: 7, leader: 7 })
    expect(ffaStanding(rows, 4).place).toBe(4)
  })
})
