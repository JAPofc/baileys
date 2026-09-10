/**
 * JAP@Add --- Type declarations for the Mini App sender.
 */
export declare const MINI_APP_DEFAULT_BUTTON_TEXT: string;
export interface MiniAppFlowOptions {
    id: string;
    cta?: string;
    screen?: string;
    data?: any;
    action?: string;
    actionPayload?: any;
    version?: string;
    token?: string;
}
export interface MiniAppOptions {
    title?: string;
    body?: string;
    text?: string;
    url?: string;
    appUrl?: string;
    flow?: string | MiniAppFlowOptions;
    params?: Record<string, string | number | boolean>;
    buttonText?: string;
    buttons?: any[];
    footer?: string;
    thumbnail?: Buffer | string;
    useWebview?: boolean;
    onThumbnailError?: (err: any) => void;
    [key: string]: any;
}
export declare const buildMiniAppContent: (opts?: MiniAppOptions) => Promise<any>;
export declare const sendMiniApp: (sock: any, jid: any, miniApp: MiniAppOptions, options?: any) => Promise<any>;
