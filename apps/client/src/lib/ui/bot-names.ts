// Made-up call signs for the bots: no real people, readable in both languages.
export const BOT_NAMES = [
  'Captain Cube',
  'Sir Digsalot',
  'Pixel Pirate',
  'Gravel Gus',
  'Turbo Turnip',
  'Private Pebble',
  'Corporal Crumb',
  'Sneaky Shovel',
  'Lag Monster',
  'Camper Carl',
  'Wobbly Wombat',
  'Grumpy Gopher',
  'Mister Moss',
  'Lady Ladder',
  'Count Crater',
  'Duke of Dirt',
  'Baron Brick',
  'Prof. Plank',
  'Toaster Ace',
  'Doctor Dig',
  'Agent Pickle',
  'Sgt. Sprinkles',
  'Mossy Boss',
  'Captain Crouch',
  'Rusty Rivet',
  'Pudding Cup',
  'Bandage Bandit',
  'Nugget',
  'Waffle Wizard',
  'Tofu Tank',
  'Cobble Cobra',
  'Noodle Ninja',
  'Mud Muffin',
  'Spud Sniper',
  'Block Party',
  'Major Mayhem',
] as const

// Stepping by a number coprime with the list length visits every name before repeating, so
// the consecutive ids of one match never share a name.
const STRIDE = 11

export function botName(id: number): string {
  const index = (((id * STRIDE) % BOT_NAMES.length) + BOT_NAMES.length) % BOT_NAMES.length
  return BOT_NAMES[index]!
}
