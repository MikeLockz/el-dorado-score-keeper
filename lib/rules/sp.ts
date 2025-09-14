// Single-player rules facade: consolidates rule exports to avoid drift
export { nextToAct, isRoundDone, canPlayCard } from '../state/spRules';
export { ledSuitOf, trickHasTrump } from '../single-player/trick';
