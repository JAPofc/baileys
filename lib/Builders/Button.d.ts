import type { BaseBuilder } from './shared.js';
import type { BloksNode } from './A2UI.js';

export interface LimitedTimeOfferParams {
    text?: string;
    url?: string;
    copy_code?: string;
    expiration_time?: number;
}

export interface BottomSheetParams {
    in_thread_buttons_limit?: number;
    divider_indices?: number[];
    list_title?: string;
    button_title?: string;
}

export interface TapTargetConfigurationParams {
    title?: string;
    description?: string;
    canonical_url?: string;
    domain?: string;
    buttonIndex?: number;
}

export interface BloksWidgetOptions {
    uuid?: string;
    catalogId?: string;
    surfaceId?: string;
    version?: string;
}

/** Native-flow interactive message builder (buttons, lists, CTAs, payments, flows). */
export class Button extends BaseBuilder {
    constructor(client: any);
    setVideo(path: string | Buffer, options?: Record<string, any>): this;
    setImage(path: string | Buffer, options?: Record<string, any>): this;
    setDocument(path: string | Buffer, options?: Record<string, any>): this;
    setMedia(obj: Record<string, any>): this;
    clearButtons(): this;
    setParams(obj: Record<string, any>): this;
    setBloksWidget(tree: BloksNode, options?: BloksWidgetOptions): this;
    addButton(name: string, params: string | Record<string, any>): this;
    makeRow(header?: string, title?: string, description?: string, id?: string): this;
    makeSection(title?: string, highlight_label?: string): this;
    addSelection(title: string, options?: Record<string, any>): this;
    addReply(display_text: string, id: string, options?: Record<string, any>): this;
    /** cta_call. Note: keys on `phone_number`, not `id`. */
    addCall(display_text: string, phone_number: string, options?: Record<string, any>): this;
    addReminder(display_text: string, id: string, options?: Record<string, any>): this;
    addCancelReminder(display_text: string, id: string, options?: Record<string, any>): this;
    addAddress(display_text: string, id: string, options?: Record<string, any>): this;
    addLocation(options?: Record<string, any>): this;
    addUrl(display_text: string, url: string, webview_interaction?: boolean, options?: Record<string, any>): this;
    addCopy(display_text: string, copy_code: string, options?: Record<string, any>): this;
    /** open_webview — opens a titled in-app webview. */
    addOpenWebview(title: string, url: string, options?: Record<string, any>): this;
    /** cta_catalog — opens the sender's WhatsApp Business catalog. Business-account gated. */
    addCatalog(display_text?: string, options?: Record<string, any>): this;
    /** automated_greeting_message_view_catalog. Business-account gated. */
    addViewCatalog(options?: Record<string, any>): this;
    /** call_permission_request. */
    addCallPermission(display_text?: string, options?: Record<string, any>): this;
    /** payment_info — structured payment-settings payload (e.g. PIX). Payment-enabled accounts only. */
    addPaymentInfo(payload?: Record<string, any>): this;
    /** review_and_pay — order/payment summary flow. Server-validated by WhatsApp. */
    addReviewAndPay(payload?: Record<string, any>): this;
    /** wa_payment_transaction_details. */
    addTransactionDetails(payload?: Record<string, any>): this;
    /** mpm — multi-product message. Business-catalog accounts only. */
    addMultiProduct(payload?: Record<string, any>): this;
    addPaymentKeyInfo(payload?: Record<string, any>): this;
    addBookingConfirmation(payload?: Record<string, any>): this;
    addCardMessage(payload?: Record<string, any>): this;
    addOrderDetails(payload?: Record<string, any>): this;
    addOrderStatus(payload?: Record<string, any>): this;
    addPaymentStatus(payload?: Record<string, any>): this;
    addPaymentMethod(payload?: Record<string, any>): this;
    addTrackOrder(id: string, display_text?: string): this;
    addReorder(id: string, display_text?: string): this;
    addCancelOrder(id: string, display_text?: string): this;
    addClearChat(): this;
    addNavigateToScreen(screen: string, data?: Record<string, any>): this;
    addFlow(flow: Record<string, any>, display_text?: string): this;
    addVoiceCall(id: string, display_text?: string): this;
    addVideoCall(id: string, display_text?: string): this;
    setLimitedTimeOffer(params?: LimitedTimeOfferParams): this;
    setBottomSheet(params?: BottomSheetParams): this;
    setTapTargetConfiguration(params?: TapTargetConfigurationParams): this;
    toCard(): Promise<Record<string, any>>;
    build(jid: string, options?: Record<string, any>): Promise<Record<string, any>>;
    send(jid: string, options?: Record<string, any>): Promise<any>;
    /** Param-type presets for validated native-flow params. */
    static paramsList: Record<string, Record<string, any>>;
}

export class CardBuilder {
    constructor(client: any);
    title(text: string): this;
    text(text: string): this;
    image(path: string | Buffer, options?: Record<string, any>): this;
    button(displayText: string, buttonId?: string): this;
}
