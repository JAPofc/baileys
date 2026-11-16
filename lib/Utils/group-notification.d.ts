/** The acting + affected participants of a `w:gp2` group notification. */
export interface NotificationActors {
    /** LID of whoever performed the action (`<notification participant>`). */
    actingLid: string | undefined;
    /** Phone-number JID of whoever performed the action (`<notification participant_pn>`). */
    actingPn: string | undefined;
    /** Username of whoever performed the action, when the server sends one. */
    actingUsername: string | undefined;
    /**
     * LID of the participant the action targets. `undefined` when the server addressed the
     * target by phone number and sent no `lid` attribute — it is never borrowed from the actor.
     */
    affectedLid: string | undefined;
    /**
     * Phone-number JID of the participant the action targets. `undefined` when the server
     * addressed the target by LID and sent no `phone_number` attribute.
     */
    affectedPn: string | undefined;
    /** True when the notification carries no `<participant>` child, i.e. the action targets the actor. */
    affectedIsActor: boolean;
}

/** One participant of a group action, in `messageStubParameters` shape. */
export interface NotificationParticipant {
    id: string;
    phoneNumber: string | undefined;
    lid: string | undefined;
    username: string | undefined;
    admin: string | null;
}

/**
 * Resolve who performed a group action and who it was performed on. The affected
 * participant is resolved as a unit, so one person's LID can never be paired with another
 * person's phone number (BUGREPORT §2.42).
 */
export declare function resolveNotificationActors(
    fullNode: { attrs?: Record<string, any> } | null | undefined,
    child?: { tag?: string; attrs?: Record<string, any>; content?: any } | null
): NotificationActors;

/** Parse the `<participant>` children of an add/remove/promote/demote action. */
export declare function parseNotificationParticipants(
    child?: { content?: any } | null
): NotificationParticipant[];

/**
 * Collect every internally consistent LID↔PN pair a `w:gp2` notification asserts (actor
 * attributes, the affected participant, and the action's participant list), device-suffix
 * normalized and deduplicated — ready for `storeLIDPNMappings()`.
 */
export declare function extractNotificationLIDPNPairs(
    fullNode: { attrs?: Record<string, any> } | null | undefined,
    child?: { tag?: string; content?: any } | null
): Array<{ lid: string; pn: string }>;
