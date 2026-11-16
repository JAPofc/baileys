export declare const HTML_PRIMITIVE_TYPENAME: 'FOAHtmlPrimitiveDemoDONOTUSE';
export declare const MAX_HTML_CARD_BYTES: number;
export type HtmlCardAssessment = {
    ok: boolean;
    bytes: number;
    reason?: string;
};
export type HtmlCardOptions = {
    maxBytes?: number;
};
export type HtmlPrimitiveOptions = {
    trustedSources?: string[];
};
export type HtmlUnifiedResponseOptions = HtmlPrimitiveOptions & {
    uuid?: string;
};
export type HtmlPrimitiveSection = {
    __typename: 'GenAIUnifiedResponseSection';
    view_model: {
        __typename: 'GenAISingleLayoutViewModel';
        primitive: {
            __typename: 'FOAHtmlPrimitiveDemoDONOTUSE';
            trusted_sources: string[];
            payload: string;
        };
    };
};
export type HtmlUnifiedResponse = {
    __typename: 'GenAIUnifiedResponse';
    response_id: string;
    sections: HtmlPrimitiveSection[];
};
export declare const assessHtmlCard: (html: unknown, opts?: HtmlCardOptions) => HtmlCardAssessment;
export declare const assertHtmlCard: (html: unknown, opts?: HtmlCardOptions) => HtmlCardAssessment;
export declare const buildHtmlPrimitiveSection: (html: string, opts?: HtmlPrimitiveOptions) => HtmlPrimitiveSection;
export declare const buildHtmlUnifiedResponse: (html: string | string[], opts?: HtmlUnifiedResponseOptions) => HtmlUnifiedResponse;
