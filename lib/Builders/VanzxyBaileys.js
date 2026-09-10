/**
 * JAP@Add --- Deep-import compat shim.
 *
 * `@deprecated` — import from `'./JapBaileys.js'` (or the package root) instead.
 * Kept only so `import { VanzxyBaileys } from '.../lib/Builders/VanzxyBaileys.js'`
 * in old bot code keeps resolving after the rebrand.
 */
export { JapBaileys as VanzxyBaileys } from './JapBaileys.js';
