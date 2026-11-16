/**
 * lib/Utils/poll-extras.js — the poll/question primitives that sit under the Poll builder.
 *
 * `getAggregateVotesInPollMessage()` hashes option names to match incoming votes; this module
 * exposes that hash on its own (so a bot can pre-compute buckets), the "add an option to a
 * running poll" message, and the question/answer family WhatsApp uses for question stickers
 * and surveys.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { createHash } from 'crypto';
import { proto } from '../../WAProto/index.js';

/** Default survey/quiz option limits WhatsApp enforces. */
export const POLL_MAX_OPTIONS = 12;
export const POLL_MIN_OPTIONS = 2;

/**
 * The SHA-256 bucket an option name hashes to — the same value
 * `getAggregateVotesInPollMessage()` matches incoming `pollUpdateMessage` votes against.
 *
 * ```js
 * getPollOptionHash('Nasi goreng')              // Buffer
 * getPollOptionHash('Nasi goreng', 'hex')       // '1f0c…'
 * ```
 */
export const getPollOptionHash = (optionName, encoding) => {
    if (typeof optionName !== 'string') {
        throw new Boom('getPollOptionHash: the option name must be a string', { statusCode: 400 });
    }
    const digest = createHash('sha256').update(Buffer.from(optionName)).digest();
    return encoding ? digest.toString(encoding) : digest;
};

/**
 * Extend a poll with more options.
 *
 * WhatsApp's own "add option" payload (`pollAddOptionMessage.addOption`) is an *encrypted*
 * value that only the original poll's `encKey` can produce, so it cannot be built from the
 * outside. This helper gives you the path that does work: the poll content to send again,
 * with the new options appended, validated and de-duplicated — plus `optionHashes`, so votes
 * cast on the original poll still match (`getPollOptionHash()` buckets are stable).
 *
 * ```js
 * const { content } = makePollAddOptionMessage(pollMsg, ['Soto', 'Rawon'])
 * await sock.sendMessage(jid, content)
 * ```
 */
export const makePollAddOptionMessage = (poll, options) => {
    const message = poll?.message ?? poll;
    const creation = message?.pollCreationMessage
        ?? message?.pollCreationMessageV2
        ?? message?.pollCreationMessageV3
        ?? message?.pollCreationMessageV4
        ?? message?.pollCreationMessageV5
        ?? (poll?.name ? poll : null);
    if (!creation?.name) {
        throw new Boom('makePollAddOptionMessage: pass the original poll message (or its pollCreationMessage)', {
            statusCode: 400
        });
    }
    const existing = (creation.options || []).map(option => option?.optionName).filter(Boolean);
    const added = (Array.isArray(options) ? options : [options])
        .map(option => (typeof option === 'string' ? option : option?.optionName))
        .map(name => String(name ?? '').trim())
        .filter(Boolean);
    if (!added.length) {
        throw new Boom('makePollAddOptionMessage: at least one new option is required', { statusCode: 400 });
    }
    const duplicates = added.filter(name => existing.includes(name));
    if (duplicates.length) {
        throw new Boom(`makePollAddOptionMessage: these options are already on the poll: ${duplicates.join(', ')}`, {
            statusCode: 400,
            data: { duplicates }
        });
    }
    if (new Set(added).size !== added.length) {
        throw new Boom('makePollAddOptionMessage: duplicate option names', { statusCode: 400, data: { added } });
    }
    const values = [...existing, ...added];
    if (values.length > POLL_MAX_OPTIONS) {
        throw new Boom(`makePollAddOptionMessage: a poll can hold at most ${POLL_MAX_OPTIONS} options (would be ${values.length})`, {
            statusCode: 400,
            data: { total: values.length }
        });
    }
    return {
        added,
        values,
        optionHashes: Object.fromEntries(values.map(name => [name, getPollOptionHash(name, 'hex')])),
        content: {
            poll: {
                name: creation.name,
                values,
                selectableCount: creation.selectableOptionsCount ?? 1,
                ...(creation.pollType !== undefined && creation.pollType !== null ? { pollType: creation.pollType } : {})
            }
        }
    };
};

/**
 * A question message (the "ask me anything" sticker, and survey questions).
 *
 * The wire field is a `FutureProofMessage` wrapper, so the question travels as a real inner
 * message: free text becomes a `conversation`, and a multiple-choice question becomes a
 * `pollCreationMessageV3`. Both round-trip through the proto with nothing dropped.
 */
export const makeQuestionMessage = (question, { answers, allowMultiple = false, contextInfo } = {}) => {
    const text = String(question ?? '').trim();
    if (!text) {
        throw new Boom('makeQuestionMessage: the question text cannot be empty', { statusCode: 400 });
    }
    const choices = (answers ? (Array.isArray(answers) ? answers : [answers]) : [])
        .map(answer => (typeof answer === 'string' ? answer : answer?.optionName ?? answer?.text))
        .map(answer => String(answer ?? '').trim())
        .filter(Boolean);
    if (answers && choices.length < POLL_MIN_OPTIONS) {
        throw new Boom(`makeQuestionMessage: a multiple-choice question needs at least ${POLL_MIN_OPTIONS} answers`, {
            statusCode: 400
        });
    }
    if (choices.length > POLL_MAX_OPTIONS) {
        throw new Boom(`makeQuestionMessage: at most ${POLL_MAX_OPTIONS} answers`, { statusCode: 400 });
    }
    const inner = choices.length
        ? {
            pollCreationMessageV3: {
                name: text,
                options: choices.map(optionName => ({ optionName })),
                selectableOptionsCount: allowMultiple ? choices.length : 1,
                ...(contextInfo ? { contextInfo } : {})
            }
        }
        : { conversation: text };
    return { questionMessage: { message: inner } };
};

/** A free-text reply to a question message, quoting the question it answers. */
export const makeQuestionReplyMessage = (questionKey, text) => {
    const answer = String(text ?? '').trim();
    if (!questionKey?.id) {
        throw new Boom('makeQuestionReplyMessage: the question message key (with an id) is required', { statusCode: 400 });
    }
    if (!answer) {
        throw new Boom('makeQuestionReplyMessage: the reply cannot be empty', { statusCode: 400 });
    }
    return {
        questionReplyMessage: {
            message: {
                extendedTextMessage: {
                    text: answer,
                    contextInfo: {
                        stanzaId: questionKey.id,
                        ...(questionKey.participant ? { participant: questionKey.participant } : {}),
                        ...(questionKey.remoteJid ? { remoteJid: questionKey.remoteJid } : {})
                    }
                }
            }
        }
    };
};

/**
 * A structured response to a question (`questionResponseMessage` — the proto carries the
 * question key and the chosen answer as text). Indices are resolved against `answers`.
 */
export const makeQuestionResponseMessage = (questionKey, selections, { answers } = {}) => {
    if (!questionKey?.id) {
        throw new Boom('makeQuestionResponseMessage: the question message key (with an id) is required', { statusCode: 400 });
    }
    const list = Array.isArray(selections) ? selections : [selections];
    const picked = list.map(selection => {
        if (typeof selection === 'number') {
            const resolved = (answers || [])[selection];
            if (resolved === undefined) {
                throw new Boom(`makeQuestionResponseMessage: index ${selection} needs an "answers" list to resolve`, {
                    statusCode: 400,
                    data: { selection }
                });
            }
            return typeof resolved === 'string' ? resolved : resolved?.optionName ?? resolved?.text;
        }
        return typeof selection === 'string' ? selection : selection?.optionName ?? selection?.text;
    }).map(value => String(value ?? '').trim()).filter(Boolean);
    if (!picked.length) {
        throw new Boom('makeQuestionResponseMessage: pick at least one answer', { statusCode: 400 });
    }
    return {
        questionResponseMessage: {
            key: questionKey,
            text: picked.join(', ')
        },
        selectedHashes: picked.map(value => getPollOptionHash(value, 'hex'))
    };
};

/**
 * One quiz question for the `Poll` builder / rich surveys: the question plus its answers,
 * with the correct one marked.
 *
 * ```js
 * quizQuestion('Ibukota Indonesia?', ['Bandung', 'Jakarta'], { correct: 1 })
 * ```
 */
export const quizQuestion = (question, answers, { correct = 0, explanation } = {}) => {
    const text = String(question ?? '').trim();
    const options = (Array.isArray(answers) ? answers : []).map(answer => String(answer ?? '').trim()).filter(Boolean);
    if (!text) {
        throw new Boom('quizQuestion: the question text cannot be empty', { statusCode: 400 });
    }
    if (options.length < POLL_MIN_OPTIONS) {
        throw new Boom(`quizQuestion: at least ${POLL_MIN_OPTIONS} answers are required`, { statusCode: 400 });
    }
    if (options.length > POLL_MAX_OPTIONS) {
        throw new Boom(`quizQuestion: at most ${POLL_MAX_OPTIONS} answers`, { statusCode: 400 });
    }
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
        throw new Boom(`quizQuestion: "correct" must be an index between 0 and ${options.length - 1}`, {
            statusCode: 400,
            data: { correct }
        });
    }
    return {
        question: text,
        answers: options.map((optionName, index) => ({
            optionName,
            optionHash: getPollOptionHash(optionName, 'hex'),
            correct: index === correct
        })),
        correctIndex: correct,
        ...(explanation ? { explanation } : {})
    };
};

/** A whole quiz: several `quizQuestion()`s under one title, ready for a poll/rich card. */
export const quizSection = (title, questions, { shuffle = false } = {}) => {
    const list = (Array.isArray(questions) ? questions : [questions]).filter(Boolean);
    if (!list.length) {
        throw new Boom('quizSection: at least one question is required', { statusCode: 400 });
    }
    const items = list.map(item => (item?.answers ? item : quizQuestion(item?.question, item?.options ?? item?.answers, item ?? {})));
    return {
        title: String(title ?? '').trim() || 'Quiz',
        questions: shuffle ? items.map(q => ({ ...q })).sort(() => Math.random() - 0.5) : items,
        total: items.length
    };
};

/** A side-by-side survey row: one prompt, two choices (the A/B card layout). */
export const sideBySideSurveyItem = (prompt, left, right, { id } = {}) => {
    const text = String(prompt ?? '').trim();
    const a = typeof left === 'string' ? { label: left } : left;
    const b = typeof right === 'string' ? { label: right } : right;
    if (!text) {
        throw new Boom('sideBySideSurveyItem: the prompt cannot be empty', { statusCode: 400 });
    }
    if (!a?.label || !b?.label) {
        throw new Boom('sideBySideSurveyItem: both sides need a label', { statusCode: 400 });
    }
    return {
        id: id || `sbs_${Date.now().toString(36)}`,
        prompt: text,
        options: [
            { ...a, hash: getPollOptionHash(a.label, 'hex'), side: 'left' },
            { ...b, hash: getPollOptionHash(b.label, 'hex'), side: 'right' }
        ]
    };
};
