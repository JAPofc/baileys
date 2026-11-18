// §2.114 — newsletterCreate() threw on the server's own response when the new channel had
// no description (or no viewer_metadata yet): the channel existed, the caller got a
// TypeError and never learned its id.
// Run: node scripts/bp-repro.mjs
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/Socket/newsletter.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('const asInt ='), src.indexOf('const parseNewsletterMetadata'))
const fixed = new Function(`${body}; return parseNewsletterCreateResponse`)()

const legacyBody = `
const parseNewsletterCreateResponse = (response) => {
    const { id, thread_metadata: thread, viewer_metadata: viewer } = response;
    return {
        id, owner: undefined,
        name: thread.name.text,
        creation_time: parseInt(thread.creation_time, 10),
        description: thread.description.text,
        invite: thread.invite,
        subscribers: parseInt(thread.subscribers_count, 10),
        verification: thread.verification,
        picture: { id: thread.picture?.id, directPath: thread.picture?.direct_path },
        mute_state: viewer.mute
    };
};`
const legacy = new Function(`${legacyBody}; return parseNewsletterCreateResponse`)()

// what the server sends back for a channel created without a description
const response = {
	id: '120363111222333444@newsletter',
	thread_metadata: { name: { text: 'JAP Updates' }, invite: 'AbCdEf', subscribers_count: '1' }
}

for (const [label, parse] of [['before', legacy], ['after ', fixed]]) {
	try {
		const parsed = parse(response)
		console.log(`${label}: ok →`, JSON.stringify({ id: parsed.id, name: parsed.name, description: parsed.description, subscribers: parsed.subscribers, creation_time: parsed.creation_time }))
	} catch (err) {
		console.log(`${label}: THREW → ${err.message}  (the channel exists, its id is lost)`)
	}
}
