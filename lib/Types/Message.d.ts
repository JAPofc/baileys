export { proto as WAProto };
export const AssociationType: any;
export const ButtonHeaderType: any;
export const ButtonType: any;
export const CarouselCardType: any;
export const ListType: any;
export const ProtocolType: any;
export const WAMessageStubType: any;
export const WAMessageStatus: any;
export const WAMessageAddressingMode: any;
import { proto } from '../../WAProto/index.js';

export type WAMessage = any;
export type WAMessageContent = any;
export type WAMessageKey = any;
/** Everything `sock.sendMessage(jid, content)` accepts. Kept loose (`any`-ish leaves) on purpose. */
export interface AnyMessageContent {
    text?: string;
    caption?: string;
    footer?: string;
    mentions?: string[];
    mentionAll?: boolean;
    contextInfo?: any;
    image?: any; video?: any; audio?: any; document?: any; sticker?: any;
    mimetype?: string; fileName?: string; ptt?: boolean; gifPlayback?: boolean;
    jpegThumbnail?: any; thumbnail?: any;
    location?: any; contacts?: any; contact?: any;
    poll?: any; pollUpdate?: any; pollResult?: any; pollAddOption?: any;
    event?: any; eventInvite?: any;
    scheduledCall?: any; scheduledCallEdit?: any;
    groupInvite?: any; newsletterInvite?: any;
    react?: any; pin?: any; keep?: any; delete?: any; edit?: any;
    forward?: any; ephemeral?: any; viewOnce?: boolean; viewOnceV2?: any; viewOnceV2Extension?: any;
    buttons?: any; templateButtons?: any; listReply?: any; buttonReply?: any; sections?: any;
    nativeFlow?: any; interactiveAsTemplate?: boolean;
    product?: any; products?: any; orderText?: any;
    music?: any;
    requestPayment?: any; sendPayment?: any; cancelPayment?: any; declinePayment?: any; invoice?: any; invoiceNote?: any;
    comment?: any; statusQuote?: any;
    requestPhoneNumber?: any; sharePhoneNumber?: any; limitSharing?: any;
    disappearingMessagesInChat?: any;
    externalAdReply?: any; externalAdReplyText?: any;
    flowReply?: any; code?: any; table?: any; latex?: any; links?: any; items?: any;
    headerText?: any; contentText?: any; footerText?: any; audioFooter?: any;
    inlineImage?: any; inlineVideo?: any; cards?: any; posts?: any; album?: any; stickers?: any;
    shopSurface?: any; spoiler?: any; suggested?: any; ptv?: boolean; isLottie?: boolean;
    optionText?: any; offerText?: any; bizJid?: any; paymentInviteServiceType?: any; requestPaymentFrom?: any;
    richResponse?: any; groupStatus?: any;
    raw?: boolean;
    [key: string]: any;
}
// JAP@Types: loose aliases for members referenced across the typings surface
// (full shapes pending; `any` keeps every import resolvable under tsc strict).
export type MinimalMessage = any;
export type MessageUpsertType = any;
export type MessageUserReceiptUpdate = any;
export type WAMessageUpdate = any;
export type WAMediaUpload = any;
export type MediaConnInfo = any;
export type AnyMediaMessageContent = any;
export type WAMediaUploadFunction = any;
export type WAMessageAddressingMode = any;
