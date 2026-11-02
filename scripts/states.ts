// Print the seven states a session card can show, as README.md shows them.
// Run with `node scripts/states.ts`; Node 22.18 and later run TypeScript as it is.
import { type CardState, LOOK } from "../src/states.ts";

for (const [state, look] of Object.entries(LOOK) as [CardState, (typeof LOOK)[CardState]][]) {
  console.log(`${look.icon}  ${state.padEnd(9)}${look.tone.padEnd(7)}${look.label}`);
}
