import type { BaseBuilder } from './shared.js';

/** One carousel card — typically built via `new Button(client).setImage(…).addUrl(…).toCard()`. */
export interface CarouselCard {
    header: {
        hasMediaAttachment: boolean;
        [key: string]: any;
    };
    [key: string]: any;
}

/** Chainable carousel builder (max 10 cards — enforced, WA truncates beyond that). */
export class Carousel extends BaseBuilder {
    static MAX_CARDS: number;
    constructor(client: any);
    /** Add one card, or an array of cards. Each must carry header media. */
    addCard(card: CarouselCard | CarouselCard[]): this;
    /** Build the WAMessage without sending. */
    build(jid: string, options?: Record<string, any>): any;
    /** Build and send. Requires at least one card. */
    send(jid: string, options?: Record<string, any>): Promise<any>;
}
