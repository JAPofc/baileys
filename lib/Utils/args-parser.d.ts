/** Quote-aware tokenizer + flag parser for bot commands. */
export interface ParseArgsOptions {
    /** Flag names that never consume the next token (treated as booleans). */
    booleans?: string[];
    /** Map of name → canonical name (e.g. { f: 'force' }). */
    alias?: Record<string, string>;
    /** Default flag values merged in before parsing. */
    defaults?: Record<string, any>;
}
export type ParsedArgs = { _: string[] } & Record<string, string | boolean | Array<string | boolean>>;
export interface ParseCommandOptions {
    /** Accepted prefixes (default ['!']). */
    prefixes?: string | string[];
    /** Lowercase the command word (default true). */
    lowerCommand?: boolean;
}
export interface ParsedCommand {
    prefix: string;
    command: string;
    args: string[];
    argString: string;
}
export declare const tokenizeArgs: (input: string) => string[];
export declare const parseArgs: (input: string | string[], opts?: ParseArgsOptions) => ParsedArgs;
export declare const parseCommand: (text: string, opts?: ParseCommandOptions) => ParsedCommand | null;
