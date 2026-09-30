import type { BaseBuilder } from './shared.js';

/** Meta's unified-response primitive namespace prefix (`'GenAI'`). Protocol-fixed — not our branding. */
export const META_RICH_PREFIX: string;

/**
 * Canonicalise a rich-card CTA action string to the exact value WhatsApp's renderer
 * expects. Maps the common open-a-link aliases (`open_url`, `openUrl`, `url`, `link`,
 * `open_link`, any case/spacing) to `OPEN_URL`; otherwise trims + upper-cases the value
 * through unchanged. No-op for already-correct input. Used by addCompact/addProfileCard/addFooterAction.
 */
export function normalizeRichActionType(value?: string | null, fallback?: string): string;

/** A raw primitive spec: a string (→ markdown text), or an object with a `typename`/`__typename` (bare or fully-qualified) plus its own props. */
export type AIRichPrimitiveSpec = string | ({ typename?: string; __typename?: string } & Record<string, any>);

export interface AIRichViewModelOptions {
    /** extra top-level fields merged onto the section wrapper */
    extra?: Record<string, any>;
    /** extra fields merged into the view_model object */
    viewModel?: Record<string, any>;
    /** plain-text submessage fallback so the bubble is never empty */
    fallback?: string;
}

export interface AddTextOptions {
    hyperlink?: boolean;
    citation?: boolean;
    latex?: boolean;
}

export interface AIRichStackItem {
    text?: string;
    heading?: boolean;
    image?: string;
    alignment?: string;
    tapLinkUrl?: string;
    spacer?: boolean;
    divider?: boolean;
    primitive?: Record<string, any>;
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
    /** `new AIRich(client).addMarkdown(md)` in one call. */
    static fromMarkdown(md: string, client: any): AIRich;
    constructor(client: any);
    /** Schema-backed primitives — safe to build on. */
    static STABLE_METHODS: Set<string>;
    /** Reverse-engineered primitives — may break after a WhatsApp client update. */
    static EXPERIMENTAL_METHODS: Set<string>;
    /** True when `name` is a reverse-engineered primitive with no public schema backing. */
    static isExperimental(name: string): boolean;
    /** Normalize a primitive spec into a `{ __typename, ... }` object (Meta prefix added to bare names). */
    static primitive(spec: AIRichPrimitiveSpec): Record<string, any> | null;
    addSubmessage(submessage: Record<string, any>): this;
    /** Push a raw custom view_model section by typename (bare or fully-qualified), with one primitive or an array. */
    addViewModel(typename: string, primitives: AIRichPrimitiveSpec | AIRichPrimitiveSpec[], opts?: AIRichViewModelOptions): this;
    /** Push a single raw primitive wrapped in a SingleLayoutViewModel — quickest custom-primitive escape hatch. */
    addRawPrimitive(typename: string, props?: Record<string, any>, opts?: AIRichViewModelOptions): this;
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
    /** Add a tappable social-entity embed (IG/FB/etc. profile card). EXPERIMENTAL. */
    addSocialEntity(data?: {
        username?: string;
        entity_id?: string;
        entity_name?: string;
        full_name?: string;
        entity_full_name?: string;
        picture_url?: string;
        entity_picture_url?: string;
        image?: string;
        url?: string;
        entity_url?: string;
        type?: string;
        entity_type?: string;
        is_verified?: boolean;
        verified?: boolean;
        label?: string;
        key?: string;
        heading?: boolean;
    }, options?: { resolveUrl?: boolean }): this;
    /** One-call profile card (compact header + divider + social-entity embed) — the igstalk pattern. EXPERIMENTAL. */
    addProfileCard(profile?: {
        username: string;
        full_name?: string;
        entity_full_name?: string;
        entity_name?: string;
        entity_id?: string;
        picture_url?: string;
        image?: string;
        url?: string;
        entity_url?: string;
        action_url?: string;
        type?: string;
        entity_type?: string;
        title?: string;
        subtitle?: string;
        label?: string;
        is_verified?: boolean;
        verified?: boolean;
    }, options?: { divider?: boolean; resolveUrl?: boolean }): this;
    /** Add a compact header card (avatar + title + verified + subtitle, tappable). EXPERIMENTAL. */
    addCompact(data?: {
        title: string;
        subtitle?: string;
        secondary_subtitle?: string;
        image?: string;
        image_url?: string;
        picture_url?: string;
        entity_id?: string;
        entity_url?: string;
        url?: string;
        entity_type?: string;
        action_type?: string;
        is_verified?: boolean;
        verified?: boolean;
    }, options?: { resolveUrl?: boolean }): this;
    addTip(text: string): this;
    addMetadata(text: string): this;
    addHStack(items?: Array<string | AIRichStackItem>): this;
    addVStack(items?: Array<string | AIRichStackItem>): this;
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
    /** Build a whole card from markdown (headings/code/tables/paragraphs). */
    addMarkdown(md: string): this;
    /** Markdown checklist block. */
    addChecklist(items: Array<string | { text: string; done?: boolean }>): this;
    /** Two-column key/value table from an object or entries. */
    addKeyValue(data: Record<string, unknown> | Array<[string, unknown]>, options?: { header?: [string, string] }): this;
    /** Labelled text progress bar block. */
    addProgressBar(label: string, value: number, max?: number, options?: { size?: number }): this;
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
    /**
     * Progressive text reveal ("AI typing" effect): sends once, then patches the
     * same bubble via EDIT protocolMessages until the full text is out. Accepts a
     * plain string (split at word boundaries every ~chunkSize chars) or a
     * pre-split array of chunks. `intervalMs` (min 300) paces the edits; `cursor`
     * is shown after partial text while streaming ('' disables).
     */
    streamText(jid: string, text: string | string[], options?: {
        chunkSize?: number;
        intervalMs?: number;
        cursor?: string;
        [key: string]: any;
    }): Promise<{ key: any; text: string; edits: number }>;
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
