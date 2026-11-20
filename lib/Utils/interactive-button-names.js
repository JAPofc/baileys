/**
 * lib/Utils/interactive-button-names.js — the canonical list of `nativeFlowMessage`
 * button names WhatsApp accepts. Kept dependency-free so both the validator
 * (`button-sender.js`) and the refreshable registry (`Builders/auto-update.js`) can share
 * exactly one source of truth.
 */
export const INTERACTIVE_BUTTON_NAMES = [
    'quick_reply',
    'cta_url',
    'cta_copy',
    'cta_call',
    'cta_catalog',
    'cta_reminder',
    'cta_cancel_reminder',
    'address_message',
    'send_location',
    'open_webview',
    'flow',
    'mpm',
    'wa_payment_transaction_details',
    'automated_greeting_message_view_catalog',
    'galaxy_message',
    'single_select'
];
