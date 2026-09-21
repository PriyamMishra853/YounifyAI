// Worked examples shown to every new workspace so the library and editor
// have something real to open. They are marked as samples in the UI.

const day = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

export function sampleDocuments() {
  return [
    {
      templateId: 'lecture_notes',
      status: 'approved',
      inputs: [{ kind: 'video', name: 'thermo_lecture_03.mp4', size: 412_000_000 }, { kind: 'image', name: 'board_photo.jpg', size: 2_100_000 }],
      content: {
        title: 'Thermodynamics — Lecture 3: Entropy',
        course: 'PHY-201 Thermal Physics',
        date: day(-2),
        summary: 'Entropy measures how many microscopic arrangements match a system’s macroscopic state. The second law says the total entropy of an isolated system never decreases, which puts a hard ceiling on how efficiently heat can be turned into work.',
        key_points: [
          'For a reversible process, dS = δQ / T.',
          'In an isolated system, entropy stays constant or increases.',
          'A Carnot engine’s efficiency is 1 − Tc/Th; no real engine can beat it.',
          'Friction and free expansion are irreversible and always create entropy.',
        ],
        concepts: [
          { term: 'Entropy (S)', definition: 'The number of microstates consistent with a macrostate, S = k ln W.' },
          { term: 'Reversible process', definition: 'An idealized process that can be undone with no net change to system or surroundings.' },
          { term: 'Carnot cycle', definition: 'Two isothermal and two adiabatic steps; the most efficient cycle between two temperatures.' },
        ],
        questions: [
          'Why can no engine working between 500 K and 300 K exceed 40% efficiency?',
          'Find the entropy change when 1 kg of ice melts at 0 °C (L = 334 kJ/kg).',
          'Give two everyday irreversible processes and say where entropy is created.',
        ],
      },
    },
    {
      templateId: 'meeting_report',
      status: 'draft',
      inputs: [{ kind: 'voice', name: 'ops_sync.m4a', size: 5_400_000 }, { kind: 'text', name: 'whatsapp_export.txt', size: 18_000 }],
      content: {
        title: 'Weekly operations sync',
        date: day(-1),
        attendees: ['Meera', 'Ravi', 'Anu', 'Dev'],
        summary: 'Stock-outs on three fast-moving items drove most of the discussion. Purchasing will move two vendors to weekly orders, and the roster changes to cover the Saturday evening rush.',
        decisions: ['Move rice and oil vendors to weekly orders from next Monday.', 'Add one cashier on Saturdays, 5–9 pm.'],
        action_items: [
          { task: 'Update the stock sheet with reorder levels', owner: 'Ravi', due: day(3) },
          { task: 'Get revised quotes from both vendors', owner: 'Anu', due: day(2) },
          { task: 'Publish the new Saturday roster', owner: '', due: day(4) },
        ],
        risks: ['Vendor B has not confirmed weekly delivery capacity.'],
      },
    },
    {
      templateId: 'voice_bill',
      status: 'draft',
      inputs: [{ kind: 'voice', name: 'counter_0412.m4a', size: 310_000 }],
      content: {
        bill_no: '0412',
        date: day(0),
        customer: 'Walk-in',
        items: [
          { item: 'Basmati rice', qty: 2, unit: 'kg', rate: 120, amount: 240 },
          { item: 'Mustard oil', qty: 1, unit: 'L', rate: 180, amount: 180 },
          { item: 'Biscuits', qty: 5, unit: 'pc', rate: 10, amount: 50 },
        ],
        subtotal: 470,
        tax: 0,
        total: 470,
        notes: '“Biscuit packet” was matched to the generic biscuits item. Confirm the brand.',
      },
    },
  ]
}

export const DIARY_SAMPLE = {
  templateId: 'journey_diary',
  status: 'approved',
  inputs: [
    { kind: 'image', name: 'IMG_2041.jpg', size: 3_200_000 },
    { kind: 'image', name: 'IMG_2057.jpg', size: 2_900_000 },
    { kind: 'voice', name: 'evening_note.m4a', size: 1_100_000 },
  ],
  content: {
    title: 'Rishikesh, day 2',
    date: day(-1),
    place: 'Rishikesh, Uttarakhand',
    entry: 'Woke before sunrise and walked down to the ghat while the river was still grey. By late morning we crossed Laxman Jhula, stopped for chai on the far bank, and spent the afternoon reading by the water. The evening aarti was louder and brighter than the photos suggest.',
    moments: [
      { time: '06:10', moment: 'Sunrise at the ghat' },
      { time: '11:30', moment: 'Crossed Laxman Jhula' },
      { time: '15:00', moment: 'Reading by the river' },
      { time: '19:00', moment: 'Evening aarti' },
    ],
    tags: ['travel', 'river', 'uttarakhand'],
  },
}

/** One finished example per template, in catalog order (landing page specimens). */
export function showcaseDocuments() {
  const [notes, report, bill] = sampleDocuments()
  return { lecture_notes: notes, meeting_report: report, journey_diary: DIARY_SAMPLE, voice_bill: bill }
}

export const SAMPLE_PRICE_LIST =`Basmati rice | kg | 120
Mustard oil | L | 180
Biscuits | pc | 10
Sugar | kg | 45
Wheat flour | kg | 38
Toor dal | kg | 140
Milk | L | 56
Tea leaf | pc | 95`
