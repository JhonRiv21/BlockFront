import type { WeaponId } from '@blockfront/sim/combat/weapons'
import type { PlayerSnapshot } from '@blockfront/sim/game'
import { BUILD_COLORS, BUTTON, type InputFrame } from '@blockfront/sim/input'
import type { InputState } from './input-state.ts'

const SLOT_COUNT = 5

export interface ControlsHooks {
  // Item just selected, as a key the HUD translates.
  onItem: (item: string) => void
  onBlockColor: (color: number) => void
  localPlayer: () => PlayerSnapshot | null
  // Block under the crosshair, for the middle-click eyedropper.
  aimedBlockId: () => number
}

// Turns raw keys and clicks into the InputFrame the sim consumes: hotbar slot, build colour,
// buttons and axes. The sim is authoritative on the slot; this mirrors its locking rules.
export class Controls {
  slot = 1
  previousSlot = 2
  blockColor: number = BUILD_COLORS[0]!
  primaryRequest: WeaponId | '' = ''
  private seq = 0

  constructor(
    private readonly input: InputState,
    private readonly hooks: ControlsHooks,
  ) {}

  // 1–5 and the wheel pick a slot, Q returns to the previous one. On the block slot, 4 again or
  // the wheel while holding 4 cycles the colour, and the middle click copies the aimed block.
  readSlot(): void {
    const wheel = this.input.takeWheel()
    const holding4 = this.input.isHeld('Digit4')
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (!this.input.takePressed(`Digit${i}`)) continue
      if (i === 4 && this.slot === 4) this.cycleBlockColor(1)
      else this.selectSlot(i)
    }
    if (this.input.takePressed('KeyQ')) this.selectSlot(this.previousSlot)

    if (wheel !== 0) {
      if (holding4 && this.slot === 4) this.cycleBlockColor(wheel)
      else {
        // The wheel steps over locked slots.
        let next = this.slot
        for (let i = 0; i < SLOT_COUNT - 1; i++) {
          next = ((((next - 1 + wheel) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT) + 1
          if (this.slotInStock(next)) break
        }
        this.selectSlot(next)
      }
    }
    const aimed = this.hooks.aimedBlockId()
    if (this.input.takeClick(1) && BUILD_COLORS.includes(aimed)) {
      this.blockColor = aimed
      this.hooks.onBlockColor(this.blockColor)
    }
  }

  // The sim hands the player back to the primary when blocks or grenades run out.
  followSim(me: PlayerSnapshot): void {
    if (me.slot === 1 && this.slot !== 1 && !this.slotInStock(this.slot)) {
      this.previousSlot = this.slot
      this.slot = 1
      this.hooks.onItem(me.weapon)
    }
  }

  reset(): void {
    this.slot = 1
    this.previousSlot = 2
    this.blockColor = BUILD_COLORS[0]!
    this.primaryRequest = ''
    this.hooks.onBlockColor(this.blockColor)
  }

  setPrimary(weapon: WeaponId): void {
    this.primaryRequest = weapon
    this.hooks.onItem(weapon)
  }

  // Blocks and grenades lock their slot while the stock is empty; weapons never lock.
  slotInStock(slot: number): boolean {
    const me = this.hooks.localPlayer()
    if (!me) return true
    if (slot === 4) return me.blocks > 0
    if (slot === 5) return me.grenades > 0
    return true
  }

  selectSlot(slot: number): void {
    if (slot === this.slot || !this.slotInStock(slot)) return
    this.previousSlot = this.slot
    this.slot = slot
    const me = this.hooks.localPlayer()
    const key =
      slot === 1
        ? (me?.weapon ?? 'rifle')
        : slot === 2
          ? 'pistol'
          : slot === 3
            ? 'shovel'
            : slot === 4
              ? 'blocks'
              : 'grenade'
    this.hooks.onItem(key)
  }

  buildInput(fly: boolean): InputFrame {
    let buttons = 0
    if (!fly) {
      if (this.input.isHeld('Space')) buttons |= BUTTON.jump
      // Crouch is C only: Ctrl+W would close the tab mid-match.
      if (this.input.isHeld('KeyC')) buttons |= BUTTON.crouch
      if (this.input.isHeld('ShiftLeft')) buttons |= BUTTON.sprint
      if (this.input.isMouseHeld(0)) buttons |= BUTTON.fire
      if (this.input.isMouseHeld(2)) buttons |= BUTTON.alt
      if (this.input.isHeld('KeyR')) buttons |= BUTTON.reload
      if (this.input.isHeld('KeyG')) buttons |= BUTTON.grenade
    }
    return {
      seq: this.seq++,
      forward: fly ? 0 : this.input.axis('KeyS', 'KeyW'),
      strafe: fly ? 0 : this.input.axis('KeyA', 'KeyD'),
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      buttons,
      slot: this.slot,
      blockColor: this.blockColor,
      primary: this.primaryRequest,
    }
  }

  private cycleBlockColor(step: number): void {
    const index = BUILD_COLORS.indexOf(this.blockColor)
    const next =
      (((index + step) % BUILD_COLORS.length) + BUILD_COLORS.length) % BUILD_COLORS.length
    this.blockColor = BUILD_COLORS[next]!
    this.hooks.onBlockColor(this.blockColor)
  }
}
