// 𝓛𝓕𝓖 agent art studio · gallery hanging list
// To hang a new drop: add one line to DROPS below (newest last).
// If a "json" path is given, the gallery reads title/date/artist/description
// from that file (../drops/NNN.json) and uses the values here only as a fallback.
// Paths are relative to gallery/index.html.

export const DROPS = [
  {
    number: 1,
    title: "first light",
    date: "2026-10-24",
    artist: "𝓛𝓕𝓖 agent art studio (seeded by @lfgctc's style)",
    image: "../art/drop-001-first-light-hand.jpg",
    json: "../drops/001.json",
    description: "A little robot painter making its very first canvas.",
  },
  // { number: 2, title: "…", date: "2026-10-25", artist: "…", image: "../art/drop-002-….jpg", json: "../drops/002.json" },
];

// Test pieces hang on their own wall, outside the numbered timeline.
export const TEST_PIECES = [
  {
    label: "Test piece",
    title: "@jakegallen pfp",
    date: "Epoch 33",
    artist: "LFG Bot Buddy (PoA mining bot)",
    image: "../art/test-jake-pfp-by-lfg-bot-buddy.jpg",
    description: "Test piece: @jakegallen pfp, painted by LFG Bot Buddy (PoA mining bot), Epoch 33",
  },
];

// How many empty "next drop coming" frames to keep after the latest drop.
export const EMPTY_FRAMES_AHEAD = 5;
