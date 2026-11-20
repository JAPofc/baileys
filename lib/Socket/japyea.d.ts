export class Japyea {
    constructor(waUploadToServer: any, relayMessageFn: any, config: any, sock: any);
    relayMessage: any;
    waUploadToServer: any;
    config: any;
    sock: any;
    /**
     * The send-path variant of detectType(): returns null for shapes the core message
     * builder already owns (plain `{ album: [...] }`), so routing never regresses them.
     */
    detectSendType(content: any): JapyeaSendType | null;
    detectType(content: any): "PAYMENT" | "PRODUCT" | "GROUP_INVITE" | "INTERACTIVE_BUTTONS" | "CAROUSEL" | "INTERACTIVE" | "ALBUM" | "EVENT" | "POLL_RESULT" | "GROUP_STORY" | null;
    handlePayment(content: any, quoted: any): Promise<{
        requestPaymentMessage: any;
    }>;
    handleProduct(content: any, _jid: any, _quoted: any): Promise<{
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: {
                        text: any;
                    };
                    footer: {
                        text: any;
                    };
                    header: {
                        title: any;
                        hasMediaAttachment: boolean;
                        productMessage: {
                            product: {
                                productImage: any;
                                productId: any;
                                title: any;
                                description: any;
                                currencyCode: any;
                                priceAmount1000: any;
                                retailerId: any;
                                url: any;
                                productImageCount: number;
                            };
                            businessOwnerJid: string;
                        };
                    };
                    nativeFlowMessage: {
                        buttons: any;
                    };
                };
            };
        };
    }>;
    handleInteractive(content: any, _jid: any, _quoted: any): Promise<{
        interactiveMessage: {
            body: {
                text: any;
            };
            footer: {
                text: any;
            };
        };
    }>;
    handleInteractiveButtons(content: any, _jid: any, _quoted: any): Promise<{
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {};
                    deviceListMetadataVersion: number;
                    messageSecret: any;
                };
                interactiveMessage: {
                    body: {
                        text: any;
                    };
                    footer: {
                        text: any;
                    };
                    header: {
                        title: any;
                        subtitle: any;
                        hasMediaAttachment: boolean;
                    };
                    nativeFlowMessage: {
                        buttons: any;
                    };
                };
            };
        };
    }>;
    handleCarousel(content: any, _jid: any, _quoted: any): Promise<{
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {};
                    deviceListMetadataVersion: number;
                    messageSecret: any;
                };
                interactiveMessage: {
                    body: any;
                    footer: any;
                    header: any;
                    carouselMessage: {
                        cards: {
                            body: any;
                            footer: any;
                            header: {
                                title: any;
                                hasMediaAttachment: boolean;
                            };
                        }[];
                        messageVersion: any;
                        carouselCardType: any;
                    };
                };
            };
        };
    }>;
    handleAlbum(content: any, jid: any, quoted: any): Promise<any>;
    handleEvent(content: any, jid: any, quoted: any): Promise<any>;
    handlePollResult(content: any, jid: any, quoted: any): Promise<any>;
    handleGroupInvite(content: any, jid: any, quoted: any): Promise<any>;
    handleGroupStory(content: any, jid: any, _quoted: any, options?: {}): Promise<any>;
    sendStatusWhatsApp(content: any, jids?: any[]): Promise<any>;
}

export type JapyeaSendType = "PAYMENT" | "PRODUCT" | "GROUP_INVITE" | "INTERACTIVE_BUTTONS" | "CAROUSEL" | "INTERACTIVE" | "ALBUM" | "EVENT" | "POLL_RESULT" | "GROUP_STORY";

/** Every content shape routeJapyeaSend() knows how to put on the wire. */
export const JAPYEA_SEND_TYPES: readonly JapyeaSendType[];

export type RouteJapyeaSendArgs = {
    japyea: Japyea;
    jid: string;
    content: any;
    options?: {
        quoted?: any;
        messageId?: string;
        useCachedGroupMetadata?: boolean;
        additionalNodes?: any[];
        additionalAttributes?: Record<string, string>;
        [key: string]: any;
    };
    userJid: string;
    relayMessage: (jid: string, message: any, opts: any) => Promise<any>;
    /** Called once with the sent WAMessage, so the caller can emit messages.upsert. */
    onSent?: (message: any) => void | Promise<void>;
};

export type RouteJapyeaSendResult = {
    handled: boolean;
    type?: JapyeaSendType;
    message?: any;
};

/**
 * Runs one Japyea content shape through its handler and onto the wire, always
 * returning a WAMessage with a real key. Returns `{ handled: false }` when the
 * content is not one of its shapes.
 */
export function routeJapyeaSend(args: RouteJapyeaSendArgs): Promise<RouteJapyeaSendResult>;
