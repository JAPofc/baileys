/**
 * JAP@Add --- rich-response READER: the missing other half of the AIRich
 * builder. Parses a received AI rich-response message (Meta AI style cards:
 * headings, markdown text, code blocks, tables, LaTeX, dividers, suggestion
 * pills, ...) back into plain structured blocks, so a bot can understand
 * cards sent by other bots instead of only producing its own.
 *
 * ```js
 * sock.ev.on('messages.upsert', ({ messages }) => {
 *     const rich = readRichMessage(messages[0])
 *     if (rich.found) {
 *         for (const block of rich.blocks) console.log(block.type, block)
 *         console.log(rich.text) // flat text rendering of the whole card
 *     }
 * })
 * ```
 *
 * Never throws — returns `{ found: false }` for anything that is not a rich
 * response. Prefers the unified-response payload (richest form) and falls
 * back to the proto submessages when it is absent.
 */
const ENTITY_RE = /\{\{([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

/** Resolve `{{KEY}}...{{/KEY}}` inline-entity markers back to readable text ([label](url) for links). */
const resolveInlineEntities = (text, entities) => {
    if (!text || typeof text !== 'string') {
        return { text: text ?? '', entities: [] };
    }
    const byKey = new Map();
    for (const e of entities ?? []) {
        if (e?.key) {
            byKey.set(e.key, e.metadata ?? {});
        }
    }
    const resolved = [];
    const out = text.replace(ENTITY_RE, (_, key, inner) => {
        const meta = byKey.get(key) ?? {};
        // GenAISocialEntityItem embeds (IG/FB profiles) carry entity_url / entity_full_name
        // instead of url / display_name — fall back to them so social entities resolve too.
        const url = meta.url ?? meta.entity_url;
        // the author's visible link text wins; entity name is only a fallback when it's empty
        const label = meta.display_name || inner || meta.entity_full_name || meta.entity_name || '';
        resolved.push({ key, label, url, typename: meta.__typename, raw: meta });
        if (url) {
            return `[${label}](${url})`;
        }
        return label;
    });
    return { text: out, entities: resolved };
};

/** Map one unified-response primitive to a plain block. */
const primitiveToBlock = (primitive) => {
    const t = primitive?.__typename;
    switch (t) {
        case 'FOATextPrimitive':
            return { type: 'heading', text: primitive.text ?? '' };
        case 'GenAIMarkdownTextUXPrimitive': {
            const { text, entities } = resolveInlineEntities(primitive.text, primitive.inline_entities);
            return { type: 'text', text, entities };
        }
        case 'GenAICodeUXPrimitive':
            return {
                type: 'code',
                language: primitive.language ?? '',
                code: (primitive.code_blocks ?? []).map((c) => c?.content ?? '').join('')
            };
        case 'GenAITableUXPrimitive':
        case 'GenATableUXPrimitive': { // accept the legacy mis-spelled name for back-compat
            const rows = (primitive.rows ?? []).map((r) => (r?.cells ?? []).map((c) => String(c ?? '')));
            const headerRows = (primitive.rows ?? []).map((r, i) => (r?.is_header ? i : -1)).filter((i) => i >= 0);
            return { type: 'table', rows, headerRows, title: primitive.title || undefined };
        }
        case 'GenAILatexUXPrimitive':
            return { type: 'latex', expression: primitive.latex_expression ?? '' };
        case 'GenAIDividerPrimitive':
            return { type: 'divider' };
        case 'GenAISpacerPrimitive':
            return { type: 'spacer' };
        case 'GenAIFollowUpSuggestionPillPrimitive':
            return { type: 'suggestion', text: primitive.prompt_text ?? '', promptType: primitive.prompt_type };
        case 'GenAIInlineImageUXPrimitive':
            return { type: 'image', ...primitive, __typename: undefined, raw: primitive };
        case 'GenAISearchResultPrimitive':
            return { type: 'sources', raw: primitive };
        case 'GenAICompactCardPrimitive':
            return {
                type: 'compact',
                title: primitive.title ?? '',
                subtitle: primitive.subtitle || undefined,
                secondarySubtitle: primitive.secondary_subtitle || undefined,
                image: primitive.image || undefined,
                entityId: primitive.entity_id || undefined,
                entityUrl: primitive.entity_url || undefined,
                entityType: primitive.entity_type || undefined,
                actionType: primitive.action_type || undefined,
                isVerified: !!primitive.is_verified,
                raw: primitive
            };
        default:
            return { type: 'unknown', typename: t, raw: primitive };
    }
};

/** Submessage fallback (proto side, used when unifiedResponse is absent). */
const submessageToBlock = (sub) => {
    if (sub?.codeMetadata) {
        return {
            type: 'code',
            language: sub.codeMetadata.codeLanguage ?? '',
            code: (sub.codeMetadata.codeBlocks ?? []).map((c) => c?.codeContent ?? '').join('')
        };
    }
    if (sub?.tableMetadata) {
        const rows = (sub.tableMetadata.rows ?? []).map((r) => (r?.items ?? []).map((c) => String(c ?? '')));
        const headerRows = (sub.tableMetadata.rows ?? []).map((r, i) => (r?.isHeading ? i : -1)).filter((i) => i >= 0);
        return { type: 'table', rows, headerRows, title: sub.tableMetadata.title || undefined };
    }
    if (typeof sub?.messageText === 'string' && sub.messageText.length) {
        return { type: 'text', text: sub.messageText, entities: [] };
    }
    return { type: 'unknown', messageType: sub?.messageType, raw: sub };
};

/** Flat text rendering of parsed blocks (headings, text, fenced code, simple tables). */
const blocksToText = (blocks) => {
    const out = [];
    for (const b of blocks) {
        switch (b.type) {
            case 'heading':
                out.push(`# ${b.text}`);
                break;
            case 'text':
                out.push(b.text);
                break;
            case 'code':
                out.push('```' + (b.language ?? '') + '\n' + b.code + '\n```');
                break;
            case 'table':
                out.push(b.rows.map((r) => r.join(' | ')).join('\n'));
                break;
            case 'latex':
                out.push(b.expression);
                break;
            case 'suggestion':
                out.push(`[${b.text}]`);
                break;
            case 'compact':
                out.push(b.subtitle ? `# ${b.text ?? b.title}\n${b.subtitle}` : `# ${b.title}`);
                break;
            default:
                break;
        }
    }
    return out.join('\n\n');
};

/**
 * Parse a rich-response message into structured blocks. Accepts a full
 * WebMessageInfo (`{ key, message }`), a message content object, or the
 * built content returned by `AIRich.build()`.
 */
export const readRichMessage = (msg) => {
    const notFound = { found: false, blocks: [], suggestions: [], text: '' };
    try {
        // unwrap WebMessageInfo → message content
        let content = msg?.message && typeof msg.message === 'object' && !msg.richResponseMessage && !msg.botForwardedMessage
            ? msg.message
            : msg;
        if (!content || typeof content !== 'object') {
            return notFound;
        }
        // unwrap common envelopes down to the rich payload
        const contextInfo = content.messageContextInfo ?? msg?.message?.messageContextInfo;
        content = content.botForwardedMessage?.message
            ?? content.viewOnceMessage?.message
            ?? content.viewOnceMessageV2?.message
            ?? content.ephemeralMessage?.message
            ?? content;
        const rich = content.richResponseMessage ?? content.botForwardedMessage?.message?.richResponseMessage;
        if (!rich) {
            return notFound;
        }
        let blocks = [];
        let unified = null;
        // primary: unified response (base64 JSON, richest structure)
        const data = rich.unifiedResponse?.data;
        if (data) {
            try {
                unified = JSON.parse(Buffer.from(String(data), 'base64').toString('utf-8'));
            }
            catch {
                unified = null; // fall through to submessages
            }
        }
        if (unified?.sections?.length) {
            for (const section of unified.sections) {
                const vm = section?.view_model;
                if (!vm) {
                    continue;
                }
                const primitives = vm.primitives ?? (vm.primitive !== undefined ? [vm.primitive] : []);
                for (const p of primitives) {
                    blocks.push(primitiveToBlock(p));
                }
            }
        }
        else if (Array.isArray(rich.submessages)) {
            blocks = rich.submessages.map(submessageToBlock);
        }
        const suggestions = blocks.filter((b) => b.type === 'suggestion').map((b) => b.text);
        // collect every social-entity embed (GenAISocialEntityItem) across text blocks
        const socialEntities = blocks
            .filter((b) => b.type === 'text' && Array.isArray(b.entities))
            .flatMap((b) => b.entities)
            .filter((e) => e?.typename === 'GenAISocialEntityItem')
            .map((e) => ({
                key: e.key,
                label: e.label,
                url: e.url,
                name: e.raw?.entity_name,
                fullName: e.raw?.entity_full_name,
                pictureUrl: e.raw?.entity_picture_url,
                type: e.raw?.entity_type,
                isVerified: !!e.raw?.is_verified,
                raw: e.raw
            }));
        const botMetadata = contextInfo?.botMetadata;
        return {
            found: true,
            responseId: unified?.response_id,
            botResponseId: botMetadata?.botResponseId,
            blocks,
            suggestions,
            socialEntities,
            text: blocksToText(blocks),
            raw: { rich, unified, botMetadata }
        };
    }
    catch {
        return notFound;
    }
};
