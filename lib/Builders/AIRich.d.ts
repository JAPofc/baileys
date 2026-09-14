import type { BaseBuilder } from './shared.js';

export interface AddTextOptions {
    hyperlink?: boolean;
    citation?: boolean;
    latex?: boolean;
}

export interface AddInlineImageOptions {
    text?: string;
    alignment?: string;
    tapLinkUrl?: string;
    resolveUrl?: boolean;
}

export interface AIRichBuildOptions {
    forwarded?: boolean;
    notification?: boolean;
    includesUnifiedResponse?: boolean;
    includesSubmessages?: boolean;
    quoted?: any;
    quotedParticipant?: string;
    [key: string]: any;
}

export interface AIRichSendOptions extends AIRichBuildOptions {
    skipImageFallback?: boolean;
    messageId?: string;
}

export interface AIRichEditOptions {
    msg?: any;
    messageId?: string;
    additionalNodes?: any[];
    [key: string]: any;
}

/** AI rich-response builder (Meta AI / GenAI message primitives). */
export class AIRich extends BaseBuilder {
    constructor(client: any);
    /** Schema-backed primitives — safe to build on. */
    static STABLE_METHODS: Set<string>;
    /** Reverse-engineered primitives — may break after a WhatsApp client update. */
    static EXPERIMENTAL_METHODS: Set<string>;
    /** True when `name` is a reverse-engineered primitive with no public schema backing. */
    static isExperimental(name: string): boolean;
    addSubmessage(submessage: Record<string, any>): this;
    addSection(section: Record<string, any>): this;
    addText(text: string, options?: AddTextOptions): this;
    addCode(language: string, code: string): this;
    addTable(table: string[][], options?: AddTextOptions): this;
    addLinks(links?: Record<string, any>[]): this;
    addContentItems(items?: Record<string, any>[]): this;
    addInlineVideo(): this;
    addSource(sources?: Record<string, any>[], options?: { resolveUrl?: boolean }): this;
    addReels(reelsItems?: Record<string, any>[], options?: { resolveUrl?: boolean }): this;
    addImage(imageUrl: string, options?: { resolveUrl?: boolean; instant?: boolean }): this;
    addInlineImage(imageUrl: string, options?: AddInlineImageOptions): this;
    addVideo(videoUrl: string, options?: { autoFill?: boolean; resolveUrl?: boolean }): this;
    addProduct(data?: Record<string, any>, options?: { resolveUrl?: boolean }): this;
    addPost(data?: Record<string, any>, options?: { resolveUrl?: boolean }): this;
    addTip(text: string): this;
    addMetadata(text: string): this;
    setResponseId(id: string): this;
    refreshResponseId(): this;
    setBotResponseId(id: string): this;
    refreshBotResponseId(): this;
    hasId(id: string): boolean;
    getIds(): string[];
    peek(id: string): { id: string; sections: any[]; submessages: any[] } | null;
    delete(id: string): this;
    /** FOATextPrimitive — large heading text, distinct from addText()'s paragraph text. */
    addHeading(text: string): this;
    /** GenAI3PExtWidgetPrimitive — experimental, reverse-engineered; see JSDoc in the .js file for caveats. */
    addWidget(data: Record<string, any> | Record<string, any>[], options?: { layout?: 'Single' | 'HScroll' | 'ActionRow' | string }): this;
    /** GenAIFooterActionPrimitive — footer action link chips (e.g. "Join our Group"). */
    addFooterAction(actions: { text: string; url: string; type?: string } | { text: string; url: string; type?: string }[]): this;
    /** GenAIDividerPrimitive — plain horizontal line, no content. */
    addDivider(): this;
    /** GenAISpacerPrimitive — blank vertical spacing. */
    addSpacer(spacing?: number): this;
    /** GenAILatexUXPrimitive — has a real AI_RICH_RESPONSE_LATEX submessage (unlike most primitives here). */
    addLatex(expression: string): this;
    /** GenAITaskPrimitive — task/checklist card. */
    addTask(data: { task_id?: string; title: string; subtitle?: string; status?: string; textFallback?: boolean }): this;
    /** GenAIBotProgressStatusPrimitive — one-shot "searching/working" status chip. */
    addProgressStatus(title: string, options?: { icon?: string; is_in_progress?: boolean; target_secondary_screen_id?: string; target_secondary_screen_tab_id?: string }): this;
    /** GenAIBotThinkingStatusPrimitive — one-shot "thinking" status chip. */
    addThinkingStatus(title: string, options?: { icon?: string; is_in_progress?: boolean; target_secondary_screen_id?: string; target_secondary_screen_tab_id?: string; textFallback?: boolean }): this;
    /** GenAIMetaSubsQuotaUpsellPrimitive — subscription-quota-limit upsell card. */
    addQuotaUpsell(data: { title: string; body?: string; body_line1?: string; body_line2?: string; buttons?: { label: string; action?: string; deeplink?: string }[] }): this;
    /** FOABloksPrimitive — raw Bloks payload; most experimental primitive, fields passed through as-is. */
    addBloks(data: { type: string; data?: string; uuid?: string; initial_response?: any; versioning_id?: string; textFallback?: boolean }): this;
    addSuggest(suggestion: Record<string, any>, options?: { scroll?: boolean; layout?: string }): this;
    /** GenAIImaginePrimitive with status GENERATING — pending-generation placeholder, distinct from addImage()/addVideo()'s READY status. */
    addGenerating(options?: { imagine_type?: 'IMAGE' | 'ANIMATE'; estimated_completion_time?: number; textFallback?: boolean }): this;
    build(options?: AIRichBuildOptions): Promise<Record<string, any>>;
    send(jid: string, options?: AIRichSendOptions): Promise<any>;
    buildEdit(targetJid: string, targetId: string, options?: AIRichEditOptions): Promise<any>;
    sendEdit(jid: string, id: string, options?: AIRichEditOptions): Promise<any>;
    static tokenizer(code: string, lang?: string): Record<string, any>;
    static toTableMetadata(arr: string[][], options?: AddTextOptions): Record<string, any>;
    static newLayout(name: string, data: Record<string, any> | Record<string, any>[], extra?: Record<string, any>): Record<string, any>;
    /** Send a support-ticket marker message (messageContextInfo.supportPayload). */
    static sendSupportPayload(client: any, jid: string, text: string, options?: { ticketId?: string; isAiMessage?: boolean; shouldShowSystemMessage?: boolean; version?: number }): Promise<any>;
    /** Send an image + video as one paired-media unit (messageAssociation). */
    static sendPairedMedia(client: any, jid: string, media: { image: string | Buffer; video: string | Buffer }): Promise<any>;
}

/** `class ORich extends AIRich {}` — plain re-export alias, no additional members. */
export class ORich extends AIRich {}
