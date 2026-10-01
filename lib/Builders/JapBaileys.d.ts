import type { AIRich } from './AIRich.js';
import type { RichOneLiner } from './Rich.js';
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
    japRich(input: RichOneLiner): AIRich;
    richJap(): AIRich;
    richJap(input: RichOneLiner): AIRich;
    /** One-liner rich helper: `jap.rich({ markdown: '# Hi' }).send(jid)`. */
    rich(input?: RichOneLiner): AIRich;
    /** Short JAP-branded one-liner alias: `jap.jap('# Hi').send(jid)`. */
    jap(input?: RichOneLiner): AIRich;
    /** One-liner rich sender: `await jap.sendRich(jid, { text: 'Hi' })`. */
    sendRich(jid: string, input?: RichOneLiner, options?: any): Promise<any>;
    /** JAP-branded sender alias: `await jap.sendJapRich(jid, { text: 'Hi' })`. */
    sendJapRich(jid: string, input?: RichOneLiner, options?: any): Promise<any>;
    button(): Button;
    buttonV2(): ButtonV2;
    buttonV3(): ButtonV3;
    carousel(): Carousel;
    poll(): Poll;
    a2ui(): A2UI;
    /** PascalCase aliases. */
    AIRich(): AIRich;
    Rich(input?: RichOneLiner): AIRich;
    JapRich(input?: RichOneLiner): AIRich;
    Button(): Button;
    Carousel(): Carousel;
    Poll(): Poll;
    A2UI(): A2UI;
}
