// Every clip the gun audio uses, with its source and license. Paths are inside the GitHub
// mirror of the Free Firearm Sound Library (CC0) unless `freesound` is set (CC0 previews).
// docs/f2-6-feel.md §3.

export const FFSL_RAW =
  'https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/HEAD/'

// layer: own (behind the shooter, first person body), near, mid, far (enemy bodies by
// distance), mech (mechanical actions). takes: how many shots to cut from the file.
export const SOURCES = [
  { id: 'rifle-own', weapon: 'rifle', layer: 'own', path: 'Prepared SFX/SKS/U_14P.wav', takes: 3 },
  {
    id: 'rifle-near',
    weapon: 'rifle',
    layer: 'near',
    path: 'Prepared SFX/SKS/U_14P.wav',
    takes: 3,
    skip: 2,
  },
  { id: 'rifle-mid', weapon: 'rifle', layer: 'mid', path: 'Prepared SFX/SKS/U_19P.wav', takes: 3 },
  {
    id: 'rifle-mech',
    weapon: 'rifle',
    layer: 'mech',
    path: 'Master Tracks/AR-15/D_14.wav',
    takes: 1,
    hold: 0.6,
  },

  {
    id: 'carbine-own',
    weapon: 'carbine',
    layer: 'own',
    path: 'Master Tracks/AR-15/D_27.wav',
    takes: 3,
  },
  {
    id: 'carbine-near',
    weapon: 'carbine',
    layer: 'near',
    path: 'Prepared SFX/AR-15/D_32P.wav',
    takes: 2,
  },
  {
    id: 'carbine-mid',
    weapon: 'carbine',
    layer: 'mid',
    path: 'Prepared SFX/AR-15/D_24P.wav',
    takes: 3,
  },
  {
    id: 'carbine-far',
    weapon: 'carbine',
    layer: 'far',
    path: 'Master Tracks/AR-15/D_25.wav',
    takes: 2,
  },
  {
    id: 'carbine-mech',
    weapon: 'carbine',
    layer: 'mech',
    path: 'Master Tracks/AR-15/D_6.wav',
    takes: 1,
    hold: 0.8,
  },

  {
    id: 'smg-own',
    weapon: 'smg',
    layer: 'own',
    path: 'Master Tracks/Carl Gustav M45_Swedish K/G_26.wav',
    takes: 3,
  },
  {
    id: 'smg-near',
    weapon: 'smg',
    layer: 'near',
    path: 'Prepared SFX/Carl Gustav M45/G_31P.wav',
    takes: 3,
  },
  {
    id: 'smg-mid',
    weapon: 'smg',
    layer: 'mid',
    path: 'Prepared SFX/Carl Gustav M45/G_20P.wav',
    takes: 3,
  },
  {
    id: 'smg-mech',
    weapon: 'smg',
    layer: 'mech',
    path: 'Master Tracks/Carl Gustav M45_Swedish K/G_2.wav',
    takes: 1,
    hold: 0.9,
  },

  {
    id: 'shotgun-own',
    weapon: 'shotgun',
    layer: 'own',
    path: 'Prepared SFX/Nova/O_21P.wav',
    takes: 2,
  },
  {
    id: 'shotgun-near',
    weapon: 'shotgun',
    layer: 'near',
    path: 'Prepared SFX/Nova/O_21P.wav',
    takes: 2,
  },
  {
    id: 'shotgun-mid',
    weapon: 'shotgun',
    layer: 'mid',
    path: 'Prepared SFX/Nova/O_17P.wav',
    takes: 3,
  },
  {
    id: 'shotgun-mech',
    weapon: 'shotgun',
    layer: 'mech',
    path: 'Master Tracks/Nova/O_6.wav',
    takes: 1,
    hold: 0.7,
  },

  {
    id: 'sniper-own',
    weapon: 'sniper',
    layer: 'own',
    path: 'Master Tracks/Mosin Nagant/M_20.wav',
    takes: 3,
  },
  {
    id: 'sniper-near',
    weapon: 'sniper',
    layer: 'near',
    path: 'Prepared SFX/Tikka/W_29P.wav',
    takes: 2,
  },
  {
    id: 'sniper-mid',
    weapon: 'sniper',
    layer: 'mid',
    path: 'Prepared SFX/Tikka/W_24P.wav',
    takes: 3,
  },
  {
    id: 'sniper-far',
    weapon: 'sniper',
    layer: 'far',
    path: 'Master Tracks/Mosin Nagant/M_23.wav',
    takes: 3,
  },
  {
    id: 'sniper-mech',
    weapon: 'sniper',
    layer: 'mech',
    path: 'Master Tracks/Tikka/W_16.wav',
    takes: 1,
    hold: 1.2,
  },

  {
    id: 'pistol-own',
    weapon: 'pistol',
    layer: 'own',
    path: 'Prepared SFX/Walther PPQ/X_39P.wav',
    takes: 3,
  },
  {
    id: 'pistol-near',
    weapon: 'pistol',
    layer: 'near',
    path: 'Prepared SFX/Walther PPQ/X_39P.wav',
    takes: 2,
    skip: 1,
  },
  {
    id: 'pistol-mid',
    weapon: 'pistol',
    layer: 'mid',
    path: 'Prepared SFX/Walther PPQ/X_31P.wav',
    takes: 2,
  },
  {
    id: 'pistol-mech',
    weapon: 'pistol',
    layer: 'mech',
    path: 'Master Tracks/Walther PPQ/X_6.wav',
    takes: 1,
    hold: 0.9,
  },
]

export const FREESOUND = [
  {
    id: 'grenade-blast',
    author: 'unfa',
    title: 'Grenade Explosion SFX (medium-sized, meaty, realistic)',
    url: 'https://freesound.org/s/609587/',
    preview: 'https://cdn.freesound.org/previews/609/609587_1038806-hq.mp3',
    takes: 1,
    hold: 2.2,
  },
  {
    id: 'bullet-whiz',
    author: 'qubodup',
    title: 'Real Bullet Flyby Sound',
    url: 'https://freesound.org/s/855248/',
    preview: 'https://cdn.freesound.org/previews/855/855248_71257-hq.mp3',
    takes: 1,
    hold: 0.3,
  },
  {
    id: 'casing',
    author: 'GryffDavid',
    title: 'Bouncing Shell Casings (Various Sizes)',
    url: 'https://freesound.org/s/318964/',
    preview: 'https://cdn.freesound.org/previews/318/318964_5421667-hq.mp3',
    takes: 3,
    hold: 0.5,
  },
  {
    id: 'ir-garage',
    author: 'Tim_Verberne',
    title: 'IR_ST_Parking_Garage_01.wav',
    url: 'https://freesound.org/s/537675/',
    preview: 'https://cdn.freesound.org/previews/537/537675_4838691-hq.mp3',
    impulse: true,
    hold: 0.8,
  },
]
