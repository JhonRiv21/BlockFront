import type { Team } from '@blockfront/sim/game'
import { CanvasTexture, Sprite, SpriteMaterial } from 'three'

const TEAM_INK: Record<Team, string> = { blue: '#7fb0ff', red: '#ff8a7a' }

// Name over an ally with a second cue besides colour: a disc for blue, a diamond for red.
export function buildNameplate(name: string, team: Team, through: boolean): Sprite {
  const width = 256
  const height = 64
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.font = 'bold 30px ui-monospace, monospace'
    context.textBaseline = 'middle'
    const textWidth = context.measureText(name).width
    const iconSize = 22
    const total = iconSize + 12 + textWidth
    let x = (width - total) / 2
    context.fillStyle = 'rgba(10, 13, 24, 0.6)'
    context.fillRect(x - 10, 8, total + 20, height - 16)
    context.fillStyle = TEAM_INK[team]
    const cy = height / 2
    context.beginPath()
    if (team === 'blue') context.arc(x + iconSize / 2, cy, iconSize / 2, 0, Math.PI * 2)
    else {
      context.moveTo(x + iconSize / 2, cy - iconSize / 2)
      context.lineTo(x + iconSize, cy)
      context.lineTo(x + iconSize / 2, cy + iconSize / 2)
      context.lineTo(x, cy)
      context.closePath()
    }
    context.fill()
    x += iconSize + 12
    context.fillStyle = '#f4f6fb'
    context.fillText(name, x, cy)
  }
  const texture = new CanvasTexture(canvas)
  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, transparent: true, depthTest: !through, depthWrite: false }),
  )
  sprite.scale.set(1.6, 0.4, 1)
  sprite.renderOrder = through ? 20 : 12
  return sprite
}

// Flag glyph over an allied carrier, visible through walls on purpose (TF2 convention).
export function buildCarrierMarker(team: Team): Sprite {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#f4f6fb'
    context.fillRect(14, 8, 5, 48)
    context.fillStyle = team === 'blue' ? '#e03a3a' : '#2f6fe4'
    context.fillRect(19, 8, 30, 20)
  }
  const sprite = new Sprite(
    new SpriteMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  )
  sprite.scale.set(0.6, 0.6, 1)
  sprite.renderOrder = 21
  return sprite
}
