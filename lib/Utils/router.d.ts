/**
 * JAP@Add --- Type declarations for the command router.
 */
export declare const extractCommandText: (webMessage: any) => string;
export interface RouterContext {
    sock: any;
    msg: any;
    key: any;
    jid: string;
    sender: string;
    pushName: string;
    text: string;
    raw: string;
    command: string;
    args: string[];
    reply: (content: any, opts?: any) => Promise<any>;
    react: (emoji: string) => Promise<any>;
}
export interface RouterOptions {
    prefix?: string | string[];
    ignoreMe?: boolean;
    help?: boolean;
    onError?: (err: any, ctx: RouterContext) => void;
}
export interface Router {
    command(names: string | string[], handler: (ctx: RouterContext) => any, opts?: {
        desc?: string;
    }): Router;
    use(mw: (ctx: RouterContext, next: () => Promise<void>) => any): Router;
    handle(sock: any, webMessage: any): Promise<boolean>;
    attach(sock: any): () => void;
    list(): {
        names: string[];
        desc: string;
    }[];
}
export declare const createRouter: (opts?: RouterOptions) => Router;
