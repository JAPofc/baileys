/**
 * JAP@Add --- Backward-compatibility aliases for bots written against `@vanzxy/baileys`.
 *
 * These re-export the renamed J.AP symbols under their old Vanzxy names so
 * existing bot code keeps working without edits:
 *
 *   import { VanzxyBaileys, AIVanzxy } from '@j.ap/baileys' // still works
 *
 * All of these are deprecated and will print no warnings (to avoid log spam);
 * new code should use {@link JapBaileys}, {@link AIRich} / {@link AIJap} instead.
 */
import { JapBaileys } from '../Builders/JapBaileys.js';
import { AIRich } from '../Builders/AIRich.js';
/** @deprecated Use {@link JapBaileys} instead. */
export const VanzxyBaileys = JapBaileys;
/** @deprecated Use {@link AIRich} (or `AIJap`) instead. */
export const AIVanzxy = AIRich;
/** @deprecated Use {@link AIRich} (or `JapAI`) instead. */
export const VanzxyAI = AIRich;
/** @deprecated Use {@link AIRich} (or `JapRich`) instead. */
export const VanzxyRich = AIRich;
/** @deprecated Use {@link AIRich} (or `RichJap`) instead. */
export const RichVanzxy = AIRich;
