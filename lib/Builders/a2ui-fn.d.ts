export declare const AI_RICH_RESPONSE_TYPE_UNKNOWN: number;
export declare const AI_RICH_RESPONSE_TYPE_STANDARD: number;
export declare const AI_RICH_SUBMESSAGE_TYPE: Record<string, number>;
export declare const A2UI_DEFAULT_CATALOG: string;
export declare const A2UI_DEFAULT_VERSION: string;

/** A node in a declarative A2UI tree. */
export interface A2UINode {
    __a2ui: true;
    component: 'Text' | 'Image' | 'Button' | 'Card' | 'Column' | 'Row' | 'Surface';
    id?: string;
    [key: string]: any;
}
export declare function a2uiText(text: string, opts?: { id?: string; variant?: string }): A2UINode;
export declare function a2uiImage(url: string, opts?: { id?: string; variant?: string; fit?: string }): A2UINode;
export declare function a2uiButton(child: A2UINode, opts?: { id?: string; variant?: string; action?: Record<string, any> }): A2UINode;
export declare function a2uiColumn(children: A2UINode | A2UINode[], opts?: { id?: string }): A2UINode;
export declare function a2uiRow(children: A2UINode | A2UINode[], opts?: { id?: string }): A2UINode;
export declare function a2uiCard(child: A2UINode | A2UINode[], opts?: { id?: string }): A2UINode;
export declare function a2uiSurface(children: A2UINode | A2UINode[], opts?: {
    id?: string; surfaceId?: string; catalogId?: string; version?: string;
}): A2UINode;

export interface BloksWidgetPayload { uuid: string; data: string; type: string }
/** Flatten a tree into the `interactiveMessage.bloksWidget` payload. */
export declare function bloksWidget(tree: A2UINode | A2UINode[], opts?: {
    type?: string; wrapped?: boolean; uuid?: string; surfaceId?: string;
}): BloksWidgetPayload;
/** A widget rendered as a full-screen embedded surface. */
export declare function embeddedScreen(tree: A2UINode | A2UINode[], opts?: {
    title?: string; screenId?: string; type?: string; wrapped?: boolean; uuid?: string; surfaceId?: string;
}): { screenId: string; title?: string; widget: BloksWidgetPayload };
/** Send a declarative A2UI surface. */
export declare function sendA2UI(sock: any, jid: string, tree: A2UINode | A2UINode[], options?: Record<string, any>): Promise<any>;
/** Chain-of-thought strip for an AIRich card; spread it into a `jap()` one-liner. */
export declare function chainOfThoughtSection(steps: string | string[] | Record<string, any>[], opts?: {
    title?: string; collapsed?: boolean;
}): { thinking: Record<string, any>; tasks: Record<string, any>[] };
/** Decode a received rich-response/AIRich message (alias of readRichMessage). */
export declare function decodeAIRich(msg: any): import('../Utils/rich-reader.js').ReadRichMessageResult;
/** Forward a received rich response to another chat, card intact. */
export declare function forwardRichResponse(sock: any, jid: string, msg: any, options?: Record<string, any>): Promise<any>;

export { verifyBotSignature, readSignedRichResponse, verifyRichResponseSignature } from '../Utils/bot-signature.js';

/** A free-form widget: supply the component list yourself. */
export declare function a2uiWidget(components: Record<string, any> | Record<string, any>[], opts?: {
    uuid?: string; type?: string; wrapped?: boolean; surfaceId?: string; catalogId?: string; version?: string;
}): BloksWidgetPayload;
/** Read a bloks payload back into its components. */
export declare function decodeBloksWidget(widget: any): {
    uuid?: string; type?: string; version?: string; surfaceId?: string; catalogId?: string;
    components: Record<string, any>[]; byId: Record<string, Record<string, any>>; text: string[];
} | null;
/** Send a pre-built bloks payload. */
export declare function sendBloksWidget(sock: any, jid: string, widget: BloksWidgetPayload, opts?: {
    body?: string; footer?: string; header?: Record<string, any>; quoted?: any; [k: string]: any;
}): Promise<any>;
/** A titled group of components inside a surface. */
export declare function bloksSection(title: string, children: A2UINode | A2UINode[], opts?: { id?: string; collapsed?: boolean }): A2UINode;
/** One tab of an embedded tabbed screen. */
export declare function embeddedTab(label: string, tree: A2UINode | A2UINode[], opts?: {
    id?: string; selected?: boolean; type?: string; wrapped?: boolean; uuid?: string; surfaceId?: string;
}): { id: string; label: string; selected: boolean; widget: BloksWidgetPayload };
/** A tabbed embedded screen (exactly one selected tab). */
export declare function embeddedTabbedContent(tabs: ReturnType<typeof embeddedTab> | ReturnType<typeof embeddedTab>[], opts?: {
    screenId?: string; title?: string;
}): { screenId: string; title?: string; tabs: ReturnType<typeof embeddedTab>[] };
/** The collapsible "thinking" strip on its own. */
export declare function thinkingSection(steps: string | string[] | Record<string, any>[], opts?: { title?: string; collapsed?: boolean }): { thinking: Record<string, any> };
export type PlannerStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
/** One planner step. */
export declare function plannerStep(title: string, opts?: {
    status?: PlannerStepStatus; detail?: string; tool?: string; durationMs?: number;
}): Record<string, any>;
/** Query + steps + sources. */
export declare function searchPlannerSection(query: string, steps: (string | Record<string, any>)[], opts?: {
    sources?: (string | { url: string; title?: string })[]; title?: string;
}): { searchPlanner: Record<string, any> };
/** Several candidate answers the user can flip between. */
export declare function multipleResponseSection(responses: (string | Record<string, any>)[], opts?: {
    selected?: number; label?: string;
}): { multipleResponse: Record<string, any> };
/** A fused comparison table across two or more options. */
export declare function fusedComparisonSection(options: (string | Record<string, any>)[], rows: { label: string; values: string[] }[], opts?: {
    title?: string; recommend?: number;
}): { fusedComparison: Record<string, any> };
