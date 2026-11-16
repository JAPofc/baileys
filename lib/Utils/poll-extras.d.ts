import type { proto } from '../../WAProto/index.js';

export declare const POLL_MAX_OPTIONS: number;
export declare const POLL_MIN_OPTIONS: number;
/** The sha256 bucket an option name hashes to (same one vote aggregation uses). */
export declare function getPollOptionHash(optionName: string): Buffer;
export declare function getPollOptionHash(optionName: string, encoding: BufferEncoding): string;
/** Extend a poll with more options (returns the poll content to re-send). */
export declare function makePollAddOptionMessage(poll: any, options: string | string[] | { optionName: string }[]): {
    added: string[];
    values: string[];
    optionHashes: Record<string, string>;
    content: { poll: { name: string; values: string[]; selectableCount: number; pollType?: number } };
};
/** A question message: free text, or multiple choice when `answers` is given. */
export declare function makeQuestionMessage(question: string, opts?: {
    answers?: (string | { optionName?: string; text?: string })[];
    allowMultiple?: boolean;
    contextInfo?: proto.IContextInfo;
}): proto.IMessage;
/** A free-text reply quoting the question it answers. */
export declare function makeQuestionReplyMessage(questionKey: proto.IMessageKey, text: string): proto.IMessage;
/** A structured response to a question. */
export declare function makeQuestionResponseMessage(questionKey: proto.IMessageKey, selections: number | string | (number | string)[], opts?: {
    answers?: (string | { optionName?: string; text?: string })[];
}): proto.IMessage & { selectedHashes: string[] };
export interface QuizQuestion {
    question: string;
    answers: { optionName: string; optionHash: string; correct: boolean }[];
    correctIndex: number;
    explanation?: string;
}
/** One quiz question with its correct answer marked. */
export declare function quizQuestion(question: string, answers: string[], opts?: { correct?: number; explanation?: string }): QuizQuestion;
/** Several questions under one title. */
export declare function quizSection(title: string, questions: (QuizQuestion | Record<string, any>)[], opts?: { shuffle?: boolean }): {
    title: string; questions: QuizQuestion[]; total: number;
};
/** A side-by-side (A/B) survey row. */
export declare function sideBySideSurveyItem(prompt: string, left: string | Record<string, any>, right: string | Record<string, any>, opts?: { id?: string }): {
    id: string; prompt: string; options: Record<string, any>[];
};
