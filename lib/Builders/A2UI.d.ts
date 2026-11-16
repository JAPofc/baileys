/**
 * A2UI/Bloks "basic" catalog node types — confirmed from captured traffic, not a
 * public spec, so treat this as best-effort autocomplete rather than an
 * exhaustive guarantee. `ref` is a builder-only tag (stripped before send) so
 * another node can reference this one via `BloksRef`.
 */
export interface BloksRef {
    $ref: string;
}
export interface BloksNodeBase {
    /** Builder-only tag so another node can reference this one via `{ $ref: ref }`. Stripped before send. */
    ref?: string;
}
export interface ColumnRowNode extends BloksNodeBase {
    component: 'Column' | 'Row';
    weight?: number;
    justify?: string;
    children?: BloksNode[];
}
export interface TextNode extends BloksNodeBase {
    component: 'Text';
    text: string;
    variant?: string;
}
export interface IconNode extends BloksNodeBase {
    component: 'Icon';
    name: string;
}
export interface DividerNode extends BloksNodeBase {
    component: 'Divider';
}
export interface ImageNode extends BloksNodeBase {
    component: 'Image';
    url: string;
    variant?: string;
    fit?: string;
}
export interface VideoNode extends BloksNodeBase {
    component: 'Video';
    url: string;
}
export interface ListNode extends BloksNodeBase {
    component: 'List';
    children?: BloksNode[];
}
export interface TextFieldNode extends BloksNodeBase {
    component: 'TextField';
    label?: string;
    value?: string;
    variant?: string;
}
export interface DateTimeInputNode extends BloksNodeBase {
    component: 'DateTimeInput';
    label?: string;
    value?: string;
    enableDate?: boolean;
    enableTime?: boolean;
}
export interface SliderNode extends BloksNodeBase {
    component: 'Slider';
    label?: string;
    min?: number;
    max?: number;
    value?: number;
}
export interface SwitchNode extends BloksNodeBase {
    component: 'Switch';
    label?: string;
    value?: boolean;
}
export interface CheckBoxNode extends BloksNodeBase {
    component: 'CheckBox';
    label?: string;
    value?: boolean;
}
export interface ChoicePickerNode extends BloksNodeBase {
    component: 'ChoicePicker';
    label?: string;
    variant?: string;
    displayStyle?: string;
    options?: Array<{ label: string; value: string }>;
    value?: string;
}
/**
 * Unlike the CTA/native-flow `Button` class elsewhere, an A2UI Button node has no
 * `label`/`type`+`name` — its label comes from a nested `child` (usually a `Text` node), and
 * tapping it fires `action.call` (with `action.args`), not a native-flow button name.
 */
export interface BloksButtonNode extends BloksNodeBase {
    component: 'Button';
    child?: BloksNode;
    variant?: string;
    action?: { call: string; args?: Record<string, any> };
}
export interface ModalNode extends BloksNodeBase {
    component: 'Modal';
    trigger: string | BloksRef;
    content: BloksNode | string | BloksRef;
}
export interface TabsNode extends BloksNodeBase {
    component: 'Tabs';
    tabs: Array<{ title: string; child: BloksNode }>;
}
export interface CardNode extends BloksNodeBase {
    component: 'Card';
    child?: BloksNode;
}
export interface ProgressBarNode extends BloksNodeBase {
    component: 'ProgressBar';
    value?: number;
    min?: number;
    max?: number;
    variant?: string;
}
export interface AvatarNode extends BloksNodeBase {
    component: 'Avatar';
    url?: string;
    variant?: string;
    size?: number;
}
export interface BadgeNode extends BloksNodeBase {
    component: 'Badge';
    child?: string | BloksNode;
    label?: string;
}
export interface SpacerNode extends BloksNodeBase {
    component: 'Spacer';
    height?: number;
}
export interface AudioPlayerNode extends BloksNodeBase {
    component: 'AudioPlayer';
    url: string;
    description?: string;
}
/** Fallback for components not yet confirmed on the wire — still works at runtime, just no prop-level autocomplete. */
export interface AnyBloksNode extends BloksNodeBase {
    component: string;
    [key: string]: any;
}
export type BloksNode =
    | ColumnRowNode
    | TextNode
    | IconNode
    | DividerNode
    | ImageNode
    | VideoNode
    | ListNode
    | TextFieldNode
    | DateTimeInputNode
    | SliderNode
    | SwitchNode
    | CheckBoxNode
    | ChoicePickerNode
    | BloksButtonNode
    | ModalNode
    | TabsNode
    | CardNode
    | ProgressBarNode
    | AvatarNode
    | BadgeNode
    | SpacerNode
    | AudioPlayerNode
    | AnyBloksNode;

export interface A2UIBuilderOptions {
    catalogId?: string;
    version?: string;
}

export interface A2UIBuildOptions {
    uuid?: string;
    surfaceId?: string;
    type?: string;
    wrapped?: boolean;
    /** Run assertValid() before serialising (default true). */
    validate?: boolean;
}

export interface A2UIBuildResult {
    uuid: string;
    data: string;
    type: string;
}

export interface ListCardOptions {
    title?: string;
    items?: any[];
    fallbackText?: string;
    uuid?: string;
}

export interface SendA2UIWidgetOptions {
    a2ui: A2UI;
    bodyText?: string;
    footer?: string;
    buttons?: any[];
    contextInfo?: Record<string, any>;
    expiration?: number;
    quoted?: any;
    type?: string;
    wrapped?: boolean;
    singleScreen?: boolean;
    header?: {
        title?: string;
        subtitle?: string;
        image?: string | Buffer | { url: string };
        video?: string | Buffer | { url: string };
        document?: string | Buffer | { url: string };
    };
}

/**
 * A2UI/Bloks widget builder.
 *
 * JAP@Fix (§2.37 / v2.4.7): this block previously documented the class as "fluent" and typed
 * every component factory as returning `this`. At runtime they return the generated component
 * **id string** (siblings reference each other by id -- that's the whole point of the API), so
 * `ui.text('a').text('b')` type-checked and then died with "ui.text(...).text is not a function",
 * while the correct `const id = ui.text('a')` was flagged as a type error. Factories are typed
 * `string` now; only the terminal/config methods (root/listCard/setVersion/...) chain.
 */
export class A2UI {
    constructor(options?: A2UIBuilderOptions);
    text(text: string, options?: { id?: string; variant?: string }): string;
    image(url: string, options?: { id?: string; variant?: string; fit?: string }): string;
    video(url: string, options?: { id?: string }): string;
    checkbox(label: string, options?: { id?: string; value?: boolean }): string;
    textField(label: string, options?: { id?: string; variant?: string }): string;
    button(childId: string, options?: { id?: string; variant?: string; action?: { call: string; args?: Record<string, any> } }): string;
    card(childId: string, options?: { id?: string }): string;
    modal(triggerId: string, contentId: string, options?: { id?: string }): string;
    raw(component: string, props?: Record<string, any>, options?: { id?: string }): string;
    column(children?: string[], options?: { id?: string }): string;
    row(children?: string[], options?: { id?: string }): string;
    divider(options?: { id?: string }): string;
    slider(options?: { id?: string; value?: number; min?: number; max?: number; step?: number; label?: string }): string;
    switch(label: string, options?: { id?: string; value?: boolean }): string;
    list(children?: string[], options?: { id?: string }): string;
    progressBar(value: number, options?: { id?: string; min?: number; max?: number; variant?: string }): string;
    avatar(url: string, options?: { id?: string; variant?: string; size?: number }): string;
    badge(childId: string, options?: { id?: string; label?: string }): string;
    spacer(options?: { id?: string; height?: number }): string;
    tabs(children?: string[], options?: { id?: string; activeTab?: number }): string;
    choicePicker(label: string, options: Array<{ label: string; value: string }>, opts?: { id?: string; variant?: string; value?: string; displayStyle?: string; filterable?: boolean }): string;
    root(children: string[]): this;
    listCard(options?: ListCardOptions): this;
    send(client: any, jid: string, opts?: Record<string, any>): Promise<any>;
    /** Whether `id` was registered on this instance. */
    has(id: string): boolean;
    /** A copy of the registered component node. */
    get(id: string): Record<string, any> | undefined;
    /** Every registered component id, in registration order. */
    ids(): string[];
    /** How many components are registered (excluding the implicit root). */
    count(): number;
    /** Unregister one component; returns whether it existed. */
    remove(id: string): boolean;
    /** Drop every component, the root selection and any listCard payload. */
    clear(): this;
    /** Override the catalog url used in `createSurface.catalogId`. */
    setCatalogId(catalogId: string): this;
    /** Override the A2UI spec version stamped on the payload. */
    setVersion(version: string): this;
    /** Registered components nothing references -- encoded but never rendered. */
    findOrphans(): string[];
    /** Every structural problem; empty when the widget is safe to build. */
    validate(): string[];
    /** Throw on the first structural problem. */
    assertValid(): this;
    /** Validates refs, then returns the serialised widget payload. Call root() first (unless listCard()). */
    build(options?: A2UIBuildOptions): A2UIBuildResult;
}

/** Build + send an A2UI/Bloks widget as an interactiveMessage. */
export declare const sendA2UIWidget: (client: any, jid: string, options?: SendA2UIWidgetOptions) => Promise<any>;
