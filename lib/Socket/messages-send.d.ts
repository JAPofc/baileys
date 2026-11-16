export function makeMessagesSocket(config: any): {
    userDevicesCache: any;
    devicesMutex: {
        mutex(code: any): any;
    };
    issuePrivacyTokens: (jids: any, timestamp: any) => Promise<any>;
    assertSessions: (jids: any, force: any) => Promise<boolean>;
    relayMessage: (jid: any, message: any, { messageId: msgId, participant, additionalAttributes, additionalNodes, useUserDevicesCache, useCachedGroupMetadata, addBizAttributes, statusJidList }: {
        messageId: any;
        participant: any;
        additionalAttributes: any;
        additionalNodes: any;
        useUserDevicesCache: any;
        useCachedGroupMetadata: any;
        addBizAttributes: any;
        statusJidList: any;
    }) => Promise<any>;
    sendReceipt: (jid: any, participant: any, messageIds: any, type: any) => Promise<void>;
    /** The socket's group-invite icon cache (inspect/clear it, or pass your own in the config). */
    groupInviteThumbnailCache?: {
        readonly ttlMs: number; readonly max: number; readonly size: number;
        get: (jid: string) => { hit: boolean; value?: Buffer };
        set: (jid: string, value?: Buffer) => Buffer | undefined;
        delete: (jid: string) => boolean;
        clear: () => void;
    };
    /** Bulk receipts. Id-less keys are skipped, ids de-duplicated, big batches split. */
    sendReceipts: (keys: any, type: any, opts?: { batchSize?: number }) => Promise<void>;
    /** Bulk read. `{ batchSize }` caps how many ids go in one receipt stanza. */
    readMessages: (keys: any, opts?: { batchSize?: number }) => Promise<void>;
    refreshMediaConn: (forceGet?: boolean) => Promise<any>;
    getMediaHost: () => string;
    waUploadToServer: (filePath: any, { mediaType, fileEncSha256B64, timeoutMs, newsletter }: {
        mediaType: any;
        fileEncSha256B64: any;
        timeoutMs: any;
        newsletter: any;
    }) => Promise<{
        mediaUrl: any;
        directPath: any;
        meta_hmac: any;
        fbid: any;
        ts: any;
        thumbnailDirectPath: any;
        thumbnailSha256: any;
    }>;
    fetchPrivacySettings: (force?: boolean) => Promise<any>;
    sendPeerDataOperationMessage: (pdoMessage: any) => Promise<any>;
    createParticipantNodes: (recipientJids: any, message: any, extraAttrs: any, dsmMessage: any) => Promise<{
        nodes: any[];
        shouldIncludeDeviceIdentity: boolean;
    }>;
    getUSyncDevices: (jids: any, useCache: any, ignoreZeroDevices: any) => Promise<any[]>;
    messageRetryManager: MessageRetryManager | null;
    updateMemberLabel: (jid: any, memberLabel: any) => Promise<any>;
    updateMediaMessage: (message: any) => Promise<any>;
    /**
     * Interactive shapes (`interactiveButtons`, `interactiveMessage`, carousels,
     * payment requests, products, group invites, events, poll results, group
     * stories) are routed through the Japyea handler set. Pass
     * `options.disableJapyea = true` to force the core message builder instead.
     */
    sendMessage: (jid: any, content: any, options?: {
        disableJapyea?: boolean;
        [key: string]: any;
    }) => Promise<any>;
    sendReaction: (jid: any, reaction: any, key: any) => Promise<any>;
    sendPin: (jid: any, key: any, opts?: {
        durationSec?: number;
    }, options?: any) => Promise<any>;
    sendUnpin: (jid: any, key: any, options?: any) => Promise<any>;
    sendKeep: (jid: any, key: any, options?: any) => Promise<any>;
    sendUnkeep: (jid: any, key: any, options?: any) => Promise<any>;
    sendEvent: (jid: any, event: any, options?: any) => Promise<any>;
    sendScheduledCall: (jid: any, scheduledCall: any, options?: any) => Promise<any>;
    cancelScheduledCall: (jid: any, key: any, options?: any) => Promise<any>;
    sendMiniApp: (jid: any, miniApp: any, options?: any) => Promise<any>;
    /** Send an AIRich card from a one-liner input: { title, markdown, table, latex, code, image, actions, … } */
    sendJapRich: (jid: string, input?: import('../Builders/Rich.js').RichOneLiner, options?: any) => Promise<any>;
    /** Send a plain string[][] as a rendered table card. */
    sendJapTable: (jid: string, table: string[][], options?: { title?: string; footer?: string; [key: string]: any }) => Promise<any>;
    /** Send a rendered LaTeX expression. */
    sendJapLatex: (jid: string, expression: string, options?: { title?: string; footer?: string; [key: string]: any }) => Promise<any>;
    /** Neutral alias for sendJapRich(). */
    sendRich: (jid: string, input?: import('../Builders/Rich.js').RichOneLiner, options?: any) => Promise<any>;
    /** Neutral alias for sendJapTable(). */
    sendTable: (jid: string, table: string[][], options?: { title?: string; footer?: string; [key: string]: any }) => Promise<any>;
    /** Neutral alias for sendJapLatex(). */
    sendLatex: (jid: string, expression: string, options?: { title?: string; footer?: string; [key: string]: any }) => Promise<any>;
    sendPoll: (jid: any, poll: any, options?: any) => Promise<any>;
    sendQuiz: (jid: any, quiz: any, options?: any) => Promise<any>;
    editPoll: (jid: any, key: any, poll: any, options?: any) => Promise<any>;
    sendMentionAll: (jid: any, text: string, options?: any) => Promise<any>;
    sendStatusMention: (content: any, mentions: string | string[], options?: any) => Promise<any>;
    sendLocation: (jid: any, location: any, options?: any) => Promise<any>;
    sendContact: (jid: any, contact: any, options?: any) => Promise<any>;
    sendGroupInvite: (jid: any, invite: any, options?: any) => Promise<any>;
    sendMusic: (jid: any, music: any, options?: any) => Promise<any>;
    sendPaymentRequest: (jid: any, req: any, options?: any) => Promise<any>;
    sendPayment: (jid: any, pay: any, options?: any) => Promise<any>;
    sendInvoice: (jid: any, invoice: any, options?: any) => Promise<any>;
    sendPollOption: (jid: any, pollKey: any, options2: any, options?: any) => Promise<any>;
    sendEventInvite: (jid: any, invite: any, options?: any) => Promise<any>;
    /**
     * Respond to a group event (RSVP). Encrypts an EventResponseMessage with the
     * event's messageSecret and relays it as encEventResponseMessage — the same
     * envelope the official client sends.
     * @param eventMessage the full event creation WAMessage (must carry messageContextInfo.messageSecret)
     * @param response 'going' | 'not_going' | 'maybe' or a proto EventResponseType number
     */
    sendEventResponse: (eventMessage: any, response: 'going' | 'not_going' | 'maybe' | number, opts?: {
        extraGuestCount?: number;
    }) => Promise<{ key: any; response: number }>;
    sendNewsletterInvite: (jid: any, invite: any, options?: any) => Promise<any>;
    /**
     * Download media from a message. Retry-aware by default: on an expired-media
     * error (HTTP 410/404) it automatically asks the phone to re-upload
     * (updateMediaMessage) and retries the download once. Pass
     * `options.disableRetry: true` to opt out of the recovery.
     */
    downloadMedia: (message: any, type?: 'buffer' | 'stream', options?: {
        disableRetry?: boolean;
        [k: string]: any;
    }) => Promise<any>;
    /** Download only a byte range of a media message (resume / slice / header peek). */
    downloadMediaRange: (message: any, range?: import('../Utils/messages.js').MediaRange, options?: {
        disableRetry?: boolean;
        [k: string]: any;
    }) => Promise<Buffer>;
    /** First `bytes` of a media message — enough to sniff the real file type/magic. */
    downloadMediaHeader: (message: any, bytes?: number, options?: {
        disableRetry?: boolean;
        [k: string]: any;
    }) => Promise<Buffer>;
    /** Forget the group sender-key memory so the next message re-distributes it. */
    clearSenderKeyMemory: (jids: string | string[]) => Promise<{ cleared: number; devices: number }>;
    /** Read the sender-key memory: `{ [groupJid]: { [deviceJid]: true } }`. */
    readSenderKeyMemory: (jids: string | string[]) => Promise<Record<string, Record<string, boolean>>>;
    /** Drop specific devices from one group's sender-key memory. */
    forgetSenderKeyDevices: (jid: string, deviceJids: string | string[]) => Promise<{ removed: number; remaining: number }>;
    /** Send an HTML bundle as a document (works on any account, no hosting). */
    sendHtmlDocument: (jid: string, html: string | Buffer, options?: { fileName?: string; caption?: string; validate?: boolean; [k: string]: any }) => Promise<any>;
    /** Send any file as an artifact card. */
    sendHtmlArtifact: (jid: string, input: any, options?: { title?: string; description?: string; fileName?: string; mimetype?: string; [k: string]: any }) => Promise<any>;
    /** Send an HTML app: a webview card with `url`, a document otherwise. */
    sendHtmlApp: (jid: string, html?: string | Buffer | null, options?: { url?: string; title?: string; body?: string; footer?: string; buttonText?: string; fallback?: boolean; [k: string]: any }) => Promise<{ mode: 'webview' | 'document'; message: any }>;
    /** Send an album (2+ images/videos) in one call. */
    sendAlbumMessage: (jid: string, medias: Record<string, any>[], options?: {
        delayMs?: number; caption?: string; [k: string]: any;
    }) => Promise<any>;
    /** Neutral alias for sendAlbumMessage(). */
    sendAlbum: (jid: string, medias: Record<string, any>[], options?: Record<string, any>) => Promise<any>;
    /** Post a status as a channel (needs `statusJidList`, e.g. from makeStatusAudienceMetadata()). */
    sendNewsletterStatus: (newsletterJid: string, content: Record<string, any>, options?: {
        statusJidList: string[]; newsletterName?: string; serverMessageId?: number; contentType?: number; [k: string]: any;
    }) => Promise<any>;
    /** React to a channel status post. */
    reactToNewsletterStatus: (newsletterJid: string, serverMessageId: number, code?: string) => Promise<{ sent: boolean; serverMessageId: number; code: string | null }>;
    /** Delete a channel status post for everyone. */
    revokeNewsletterStatus: (newsletterJid: string, serverMessageId: number) => Promise<{ revoked: boolean; serverMessageId: number }>;
    /** Only the channel posts that changed since a timestamp. */
    fetchNewsletterStatusUpdates: (newsletterJid: string, options?: { since?: number; count?: number }) => Promise<{
        newsletterJid: string; since: number; updates: import('../Utils/newsletter-status.js').NewsletterStatusEntry[]; latestTimestamp: number;
    }>;
    /** Recent status posts of a channel. */
    fetchNewsletterStatus: (newsletterJid: string, options?: { count?: number; before?: string | number }) => Promise<import('../Utils/newsletter-status.js').NewsletterStatusEntry[]>;
    /** Invite someone to be an admin of a channel. */
    sendNewsletterAdminInvite: (jid: string, invite: {
        newsletterJid: string; newsletterName: string; caption?: string; inviteExpiration?: number; jpegThumbnail?: Uint8Array | Buffer;
    }, options?: Record<string, any>) => Promise<any>;
    /** Reshare a status you were mentioned in, to your own status. */
    sendStatusReshare: (status: any, options: { statusJidList: string[]; group?: boolean; [k: string]: any }) => Promise<any>;
    /** Answer a question sticker on a status. */
    sendStatusQuestionAnswer: (jid: string, statusKey: any, text: string, options?: Record<string, any>) => Promise<any>;
    /** React to a sticker on a status. */
    sendStatusStickerInteraction: (jid: string, statusKey: any, stickerKey?: any, options?: { type?: number; [k: string]: any }) => Promise<any>;
    /** Schedule a message for later; the timer is unref'd. */
    scheduleMessage: (jid: string, content: Record<string, any>, options: {
        at: Date | number | string; scheduleId?: string; timezone?: string; [k: string]: any;
    }) => {
        scheduleId: string;
        scheduledAt: number;
        delayMs: number;
        content: Record<string, any>;
        readonly status: import('../Utils/scheduled-message.js').ScheduledMessageStatus;
        cancel: () => boolean;
        waitUntilSent: () => Promise<any>;
    };
    /** Tell the other side to drop an already-announced scheduled message. */
    unscheduleMessage: (jid: string, key: any, options?: { scheduleId?: string; [k: string]: any }) => Promise<any>;
    copyNForward: (jid: any, message: any, forceForward?: boolean, options?: {}) => Promise<any>;
    executeWMexQuery: (variables: any, queryId: any, dataPath: any) => Promise<any>;
    newsletterCreate: (name: any, description: any) => Promise<{
        id: any;
        owner: undefined;
        name: any;
        creation_time: number;
        description: any;
        invite: any;
        subscribers: number;
        verification: any;
        picture: {
            id: any;
            directPath: any;
        };
        mute_state: any;
    }>;
    newsletterUpdate: (jid: any, updates: any) => Promise<any>;
    newsletterSubscribers: (jid: any) => Promise<any>;
    newsletterSubscribed: () => Promise<any>;
    newsletterMetadata: (type: any, key: any) => Promise<any>;
    newsletterFollow: (jid: any) => Promise<any>;
    newsletterUnfollow: (jid: any) => Promise<any>;
    newsletterMute: (jid: any) => Promise<any>;
    newsletterUnmute: (jid: any) => Promise<any>;
    newsletterUpdateName: (jid: any, name: any) => Promise<any>;
    newsletterUpdateDescription: (jid: any, description: any) => Promise<any>;
    newsletterUpdatePicture: (jid: any, content: any) => Promise<any>;
    newsletterRemovePicture: (jid: any) => Promise<any>;
    newsletterReactMessage: (jid: any, serverId: any, reaction: any) => Promise<void>;
    newsletterFetchMessages: (type: any, key: any, count: any, after: any, before: any) => Promise<any[]>;
    subscribeNewsletterUpdates: (jid: any) => Promise<{
        duration: any;
    } | null>;
    newsletterAdminCount: (jid: any) => Promise<any>;
    newsletterChangeOwner: (jid: any, newOwnerJid: any) => Promise<void>;
    newsletterDemote: (jid: any, userJid: any) => Promise<void>;
    newsletterDelete: (jid: any) => Promise<void>;
    groupQuery: (jid: any, type: any, content: any) => Promise<any>;
    groupMetadata: (jid: any) => Promise<{
        id: any;
        notify: any;
        addressingMode: any;
        subject: any;
        subjectOwner: any;
        subjectOwnerPn: any;
        subjectOwnerUsername: any;
        subjectTime: number;
        size: any;
        creation: number;
        owner: string | undefined;
        ownerPn: string | undefined;
        ownerUsername: any;
        owner_country_code: any;
        desc: any;
        descId: any;
        descOwner: string | undefined;
        descOwnerPn: string | undefined;
        descOwnerUsername: any;
        descTime: number | undefined;
        linkedParent: any;
        restrict: boolean;
        announce: boolean;
        isCommunity: boolean;
        isCommunityAnnounce: boolean;
        joinApprovalMode: boolean;
        memberAddMode: boolean;
        participants: any;
        ephemeralDuration: number | undefined;
    }>;
    groupCreate: (subject: any, participants: any) => Promise<{
        id: any;
        notify: any;
        addressingMode: any;
        subject: any;
        subjectOwner: any;
        subjectOwnerPn: any;
        subjectOwnerUsername: any;
        subjectTime: number;
        size: any;
        creation: number;
        owner: string | undefined;
        ownerPn: string | undefined;
        ownerUsername: any;
        owner_country_code: any;
        desc: any;
        descId: any;
        descOwner: string | undefined;
        descOwnerPn: string | undefined;
        descOwnerUsername: any;
        descTime: number | undefined;
        linkedParent: any;
        restrict: boolean;
        announce: boolean;
        isCommunity: boolean;
        isCommunityAnnounce: boolean;
        joinApprovalMode: boolean;
        memberAddMode: boolean;
        participants: any;
        ephemeralDuration: number | undefined;
    }>;
    groupLeave: (id: any) => Promise<void>;
    groupUpdateSubject: (jid: any, subject: any) => Promise<void>;
    groupRequestParticipantsList: (jid: any) => Promise<any>;
    groupRequestParticipantsUpdate: (jid: any, participants: any, action: any) => Promise<any>;
    groupParticipantsUpdate: (jid: any, participants: any, action: any) => Promise<any[]>;
    groupUpdateDescription: (jid: any, description: any) => Promise<void>;
    groupInviteCode: (jid: any) => Promise<any>;
    groupRevokeInvite: (jid: any) => Promise<any>;
    groupAcceptInvite: (code: any) => Promise<any>;
    groupRevokeInviteV4: (groupJid: any, invitedJid: any) => Promise<boolean>;
    groupAcceptInviteV4: (...args: any[]) => Promise<any>;
    groupGetInviteInfo: (code: any) => Promise<{
        id: any;
        notify: any;
        addressingMode: any;
        subject: any;
        subjectOwner: any;
        subjectOwnerPn: any;
        subjectOwnerUsername: any;
        subjectTime: number;
        size: any;
        creation: number;
        owner: string | undefined;
        ownerPn: string | undefined;
        ownerUsername: any;
        owner_country_code: any;
        desc: any;
        descId: any;
        descOwner: string | undefined;
        descOwnerPn: string | undefined;
        descOwnerUsername: any;
        descTime: number | undefined;
        linkedParent: any;
        restrict: boolean;
        announce: boolean;
        isCommunity: boolean;
        isCommunityAnnounce: boolean;
        joinApprovalMode: boolean;
        memberAddMode: boolean;
        participants: any;
        ephemeralDuration: number | undefined;
    }>;
    groupToggleEphemeral: (jid: any, ephemeralExpiration: any) => Promise<void>;
    groupSettingUpdate: (jid: any, setting: any) => Promise<void>;
    groupMemberAddMode: (jid: any, mode: any) => Promise<void>;
    groupJoinApprovalMode: (jid: any, mode: any) => Promise<void>;
    groupFetchAllParticipating: () => Promise<{}>;
    findUserId: (pnLid: any) => Promise<{
        lid: undefined;
        phoneNumber: undefined;
    }>;
    serverProps: {
        privacyTokenOn1to1: boolean;
        profilePicPrivacyToken: boolean;
        lidTrustedTokenIssueToLid: boolean;
    };
    createCallLink: (type: any, event: any, timeoutMs: any) => Promise<any>;
    getBotListV2: () => Promise<{
        jid: any;
        personaId: any;
    }[]>;
    messageMutex: {
        mutex(code: any): any;
    };
    receiptMutex: {
        mutex(code: any): any;
    };
    appStatePatchMutex: {
        mutex(code: any): any;
    };
    notificationMutex: {
        mutex(code: any): any;
    };
    upsertMessage: (...args: any[]) => Promise<any>;
    appPatch: (patchCreate: any) => Promise<void>;
    sendPresenceUpdate: (type: any, toJid: any) => Promise<void>;
    presenceSubscribe: (toJid: any) => Promise<void>;
    profilePictureUrl: (jid: any, type?: string, timeoutMs?: number, shouldIncludeTcToken?: boolean) => Promise<any>;
    fetchBlocklist: () => Promise<any>;
    fetchStatus: (...jids: any[]) => Promise<any>;
    fetchDisappearingDuration: (...jids: any[]) => Promise<any>;
    updateProfilePicture: (jid: any, content: any, dimensions: any) => Promise<void>;
    removeProfilePicture: (jid: any) => Promise<void>;
    updateProfileStatus: (status: any) => Promise<void>;
    updateProfileName: (name: any) => Promise<void>;
    updateBlockStatus: (jid: any, action: any) => Promise<void>;
    updateDisableLinkPreviewsPrivacy: (isPreviewsDisabled: any) => Promise<void>;
    updateCallPrivacy: (value: any) => Promise<void>;
    updateMessagesPrivacy: (value: any) => Promise<void>;
    updateLastSeenPrivacy: (value: any) => Promise<void>;
    updateOnlinePrivacy: (value: any) => Promise<void>;
    updateProfilePicturePrivacy: (value: any) => Promise<void>;
    updateStatusPrivacy: (value: any) => Promise<void>;
    updateReadReceiptsPrivacy: (value: any) => Promise<void>;
    updateGroupsAddPrivacy: (value: any) => Promise<void>;
    updateDefaultDisappearingMode: (duration: any) => Promise<void>;
    getBusinessProfile: (jid: any) => Promise<{
        wid: any;
        address: any;
        description: any;
        website: any[];
        email: any;
        category: any;
        business_hours: {
            timezone: any;
            business_config: any;
        };
    } | undefined>;
    resyncAppState: (...args: any[]) => Promise<any>;
    chatModify: (mod: any, jid: any) => Promise<void>;
    cleanDirtyBits: (type: any, fromTimestamp: any) => Promise<void>;
    addOrEditContact: (jid: any, contact: any) => Promise<void>;
    removeContact: (jid: any) => Promise<void>;
    placeholderResendCache: any;
    addLabel: (jid: any, labels: any) => Promise<void>;
    addChatLabel: (jid: any, labelId: any) => Promise<void>;
    removeChatLabel: (jid: any, labelId: any) => Promise<void>;
    addMessageLabel: (jid: any, messageId: any, labelId: any) => Promise<void>;
    removeMessageLabel: (jid: any, messageId: any, labelId: any) => Promise<void>;
    star: (jid: any, messages: any, star: any) => Promise<void>;
    addOrEditQuickReply: (quickReply: any) => Promise<void>;
    removeQuickReply: (timestamp: any) => Promise<void>;
    type: string;
    ws: import("./Client/websocket.js").WebSocketClient;
    ev: {
        process(handler: any): () => void;
        emit(event: any, evData: any): any;
        isBuffering(): boolean;
        buffer: () => void;
        flush: () => boolean;
        createBufferedFunction(work: any): (...args: any[]) => Promise<any>;
        on: (...args: any[]) => any;
        off: (...args: any[]) => any;
        removeAllListeners: (...args: any[]) => any;
        destroy(): void;
    };
    authState: {
        creds: any;
        keys: {
            get: (type: any, ids: any) => Promise<any>;
            set: (data: any) => Promise<void>;
            isInTransaction: () => boolean;
            transaction: (work: any, key: any) => Promise<any>;
        };
    };
    signalRepository: any;
    user: any;
    generateMessageTag: () => string;
    query: (node: any, timeoutMs: any) => Promise<any>;
    waitForMessage: (msgId: any, timeoutMs?: any) => Promise<any>;
    waitForSocketOpen: () => Promise<void>;
    sendRawMessage: (data: any) => Promise<void>;
    sendNode: (frame: any) => Promise<void>;
    logout: (msg: any) => Promise<void>;
    end: (error: any) => Promise<void>;
    registerSocketEndHandler: (handler: any) => void;
    onUnexpectedError: (err: any, msg: any) => void;
    uploadPreKeys: (count?: number) => Promise<void>;
    uploadPreKeysToServerIfRequired: () => Promise<void>;
    digestKeyBundle: () => Promise<void>;
    rotateSignedPreKey: () => Promise<void>;
    requestPairingCode: (phoneNumber: any, customPairingCode: any) => Promise<any>;
    updateServerTimeOffset: ({ attrs }: {
        attrs: any;
    }) => void;
    sendUnifiedSession: () => Promise<void>;
    wamBuffer: import("../index.js").BinaryInfo;
    waitForConnectionUpdate: (check: any, timeoutMs: any) => Promise<void>;
    sendWAMBuffer: (wamBuffer: any) => Promise<any>;
    executeUSyncQuery: (usyncQuery: any) => Promise<any>;
    onWhatsApp: (...phoneNumber: any[]) => Promise<any>;
    fetchAccountReachoutTimelock: () => Promise<{
        isActive: boolean;
        timeEnforcementEnds: Date | undefined;
        enforcementType: any;
    }>;
    fetchNewChatMessageCap: () => Promise<any>;
};
import { MessageRetryManager } from '../Utils/index.js';
