import { getBinaryNodeChild } from '../WABinary/index.js';
import { extractUSyncErrors } from '../Utils/usync-result.js';
import { USyncBotProfileProtocol } from './Protocols/UsyncBotProfileProtocol.js';
import { USyncLIDProtocol } from './Protocols/UsyncLIDProtocol.js';
import { USyncBusinessProtocol, USyncContactProtocol, USyncFeatureProtocol, USyncSidelistProtocol, USyncTextStatusProtocol, USyncDeviceProtocol, USyncDisappearingModeProtocol, USyncPictureProtocol, USyncStatusProtocol, USyncUsernameProtocol } from './Protocols/index.js';
import { USyncUser } from './USyncUser.js';
export class USyncQuery {
    constructor() {
        this.protocols = [];
        this.users = [];
        this.context = 'interactive';
        this.mode = 'query';
    }
    withMode(mode) {
        this.mode = mode;
        return this;
    }
    withContext(context) {
        this.context = context;
        return this;
    }
    withUser(user) {
        this.users.push(user);
        return this;
    }
    /**
     * JAP@Add (v2.4.7) --- queue several users at once, so callers stop hand-rolling a
     * `for` loop around `withUser()`. Null/undefined entries are ignored.
     */
    withUsers(...users) {
        for (const user of users.flat()) {
            if (user) {
                this.users.push(user);
            }
        }
        return this;
    }
    parseUSyncQueryResult(result) {
        if (result?.attrs.type !== 'result') {
            return;
        }
        // JAP@Fix (§2.135): the parser was stored DETACHED from its protocol instance, so
        // any parser that reads `this` (its configured picture type, profile version, …)
        // threw `Cannot read properties of undefined` -- and the per-user try/catch added in
        // §2.56 swallowed it, so that protocol simply never appeared in the result. Bind it.
        const protocolMap = Object.fromEntries(this.protocols.map(protocol => {
            return [protocol.name, (node) => protocol.parser(node)];
        }));
        const queryResult = {
            list: [],
            sideList: [],
            // JAP@Add (§2.49 / v2.4.7): the server's own errors used to be dropped on the
            // floor, so a refused query ("rate overlimit") was indistinguishable from a
            // genuinely empty result. extractUSyncErrors() reports both the query-level
            // <result><error/> and the per-user ones.
            errors: extractUSyncErrors(result)
        };
        const usyncNode = getBinaryNodeChild(result, 'usync');
        const listNode = usyncNode ? getBinaryNodeChild(usyncNode, 'list') : undefined;
        if (listNode?.content && Array.isArray(listNode.content)) {
            queryResult.list = listNode.content.reduce((acc, node) => {
                const id = node?.attrs.jid;
                if (id) {
                    const data = Array.isArray(node?.content)
                        ? Object.fromEntries(node.content
                            .map(content => {
                            const protocol = content.tag;
                            const parser = protocolMap[protocol];
                            if (parser) {
                                // JAP@Fix (§2.56 / v2.4.7): a protocol parser that throws
                                // -- every one of them calls assertNodeErrorFree(), which
                                // throws on a per-user <error/> node -- used to escape this
                                // map and abort the ENTIRE parse, discarding the results of
                                // every other user in the same batch. One user's error is
                                // now recorded in `errors` (via extractUSyncErrors) and
                                // that user's protocol entry is simply omitted.
                                try {
                                    return [protocol, parser(content)];
                                }
                                catch {
                                    return [protocol, null];
                                }
                            }
                            else {
                                return [protocol, null];
                            }
                        })
                            .filter(([, b]) => b !== null))
                        : {};
                    acc.push({ ...data, id });
                }
                return acc;
            }, []);
        }
        // JAP@Fix (bug 52): implement sideList for side band sync
        // sideList contains additional sync data that should be processed separately
        const sideListNode = usyncNode ? getBinaryNodeChild(usyncNode, 'side_list') : undefined;
        if (sideListNode?.content && Array.isArray(sideListNode.content)) {
            queryResult.sideList = sideListNode.content.reduce((acc, node) => {
                const id = node?.attrs.jid;
                if (id) {
                    const data = Array.isArray(node?.content)
                        ? Object.fromEntries(node.content
                            .map(content => {
                            const protocol = content.tag;
                            const parser = protocolMap[protocol];
                            if (parser) {
                                // JAP@Fix (§2.56 / v2.4.7): a protocol parser that throws
                                // -- every one of them calls assertNodeErrorFree(), which
                                // throws on a per-user <error/> node -- used to escape this
                                // map and abort the ENTIRE parse, discarding the results of
                                // every other user in the same batch. One user's error is
                                // now recorded in `errors` (via extractUSyncErrors) and
                                // that user's protocol entry is simply omitted.
                                try {
                                    return [protocol, parser(content)];
                                }
                                catch {
                                    return [protocol, null];
                                }
                            }
                            else {
                                return [protocol, null];
                            }
                        })
                            .filter(([, b]) => b !== null))
                        : {};
                    acc.push({ ...data, id });
                }
                return acc;
            }, []);
        }
        return queryResult;
    }
    withDeviceProtocol() {
        this.protocols.push(new USyncDeviceProtocol());
        return this;
    }
    withContactProtocol() {
        this.protocols.push(new USyncContactProtocol());
        return this;
    }
    /** JAP@Add (§2.139): the short text status (with emoji) shown next to a name. */
    withTextStatusProtocol() {
        this.protocols.push(new USyncTextStatusProtocol());
        return this;
    }
    /** JAP@Add (§2.139): which capabilities each contact's device supports. */
    withFeatureProtocol(features) {
        this.protocols.push(new USyncFeatureProtocol(features));
        return this;
    }
    /** JAP@Add (§2.139): request the server-side `side_list` the query already parses. */
    withSidelistProtocol(useLidAddressing = true) {
        this.protocols.push(new USyncSidelistProtocol(useLidAddressing));
        return this;
    }
    /** JAP@Add (§2.134): profile pictures for the whole batch in one round trip. */
    withPictureProtocol(type = 'preview') {
        this.protocols.push(new USyncPictureProtocol(type));
        return this;
    }
    /** JAP@Add (§2.134): business details (verified name, hours, address) for the batch. */
    withBusinessProtocol(profileVersion) {
        this.protocols.push(new USyncBusinessProtocol(profileVersion));
        return this;
    }
    withStatusProtocol() {
        this.protocols.push(new USyncStatusProtocol());
        return this;
    }
    withDisappearingModeProtocol() {
        this.protocols.push(new USyncDisappearingModeProtocol());
        return this;
    }
    withBotProfileProtocol() {
        this.protocols.push(new USyncBotProfileProtocol());
        return this;
    }
    withLIDProtocol() {
        this.protocols.push(new USyncLIDProtocol());
        return this;
    }
    withUsernameProtocol() {
        this.protocols.push(new USyncUsernameProtocol());
        return this;
    }
}
