import type { AIRich } from './AIRich.js';
import type { Button } from './Button.js';
import type { ButtonV2 } from './ButtonV2.js';
import type { ButtonV3 } from './ButtonV3.js';
import type { Carousel } from './Carousel.js';
import type { Poll } from './Poll.js';
import type { A2UI } from './A2UI.js';

/**
 * JapBaileys — unified builder hub. Every builder stays in its own
 * class/file; this is a single entry point to instantiate them.
 */
export class JapBaileys {
    constructor(client: any);
    client: any;
    airich(): AIRich;
    japAI(): AIRich;
    aiJap(): AIRich;
    leafRich(): AIRich;
    japRich(): AIRich;
    richJap(): AIRich;
    button(): Button;
    buttonV2(): ButtonV2;
    buttonV3(): ButtonV3;
    carousel(): Carousel;
    poll(): Poll;
    a2ui(): A2UI;
    /** PascalCase aliases. */
    AIRich(): AIRich;
    Button(): Button;
    Carousel(): Carousel;
    Poll(): Poll;
    A2UI(): A2UI;
}
