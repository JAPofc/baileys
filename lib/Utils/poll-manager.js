/**
 * Stateful poll manager — the missing companion to `getAggregateVotesInPollMessage`.
 *
 * The low-level aggregator is stateless: you have to collect every poll update
 * yourself, re-run it on the whole list each time, and it happily counts a voter
 * twice if they change their mind (WhatsApp sends the voter's FULL current
 * selection on every change, so the "old" vote must be discarded). This manager
 * keeps that state for you: register a poll once, feed it decrypted votes as they
 * arrive, and read live tallies where each voter counts once with only their
 * latest choice.
 *
 * ```js
 * import { createPollManager } from '@japofc/baileys'
 *
 * const polls = createPollManager()
 * const sent = await sock.sendMessage(jid, { poll: { name: 'Lunch?', values: ['Pizza', 'Sushi'], selectableCount: 1 } })
 * polls.register(sent) // remembers options + key
 *
 * // in messages.upsert, after you decrypt the pollUpdate:
 * polls.applyVote(sent.key.id, voterJid, ['Pizza'])
 *
 * polls.tally(sent.key.id)   // [{ name:'Pizza', count:1, voters:[...] }, ...]
 * polls.winner(sent.key.id)  // { winners:['Pizza'], count:1 }
 * console.log(polls.render(sent.key.id))
 * ```
 *
 * Accepts votes as option NAMES, 64-char sha256 hex hashes, or the raw hash
 * Buffers WhatsApp puts in `vote.selectedOptions` — all three resolve to the
 * same option. Never throws into your event loop: unknown polls/options are
 * ignored and reported via the return value.
 */
import { createHash } from 'crypto';
import { getKeyAuthor } from './generics.js';

const hashName = (name) => createHash('sha256').update(Buffer.from(String(name ?? ''))).digest('hex');

const toHashHex = (el) => {
	if (el === null || el === undefined) {
		return null;
	}
	if (Buffer.isBuffer(el) || el instanceof Uint8Array) {
		return Buffer.from(el).toString('hex');
	}
	const s = String(el);
	if (/^[0-9a-f]{64}$/i.test(s)) {
		return s.toLowerCase();
	}
	return hashName(s); // treat as a plain option name
};

const extractOptions = (src) => {
	const creation = src?.message?.pollCreationMessage
		|| src?.message?.pollCreationMessageV2
		|| src?.message?.pollCreationMessageV3
		|| src?.pollCreationMessage
		|| null;
	if (creation) {
		return {
			names: (creation.options || []).map(o => o?.optionName || ''),
			selectableCount: creation.selectableOptionsCount ?? 0
		};
	}
	// plain-object form: { options: ['a','b'] } or { values: ['a','b'] }
	const names = src?.options || src?.values || [];
	return { names: [...names], selectableCount: src?.selectableCount ?? src?.selectableOptionsCount ?? 0 };
};

export const createPollManager = (options = {}) => {
	const { meId = 'me' } = options;
	/** pollId -> { id, options:[{name,hash}], selectableCount, creator, createdAt, votes:Map<voter, string[]> } */
	const polls = new Map();

	const resolvePollId = (idOrMsg) => (typeof idOrMsg === 'string' ? idOrMsg : idOrMsg?.key?.id);

	return {
		/**
		 * Remember a poll so its votes can be tracked. Pass the WAMessage returned
		 * by sendMessage, an incoming poll-creation message, or a plain
		 * `{ id, options }` object. Returns the poll id, or null if no id/options.
		 */
		register(pollMsg, extra = {}) {
			const id = extra.id || pollMsg?.key?.id || pollMsg?.id;
			const { names, selectableCount } = extractOptions(pollMsg);
			if (!id || !names.length) {
				return null;
			}
			const key = pollMsg?.key;
			const creator = extra.creator
				|| (key ? (key.fromMe ? meId : (key.participant || key.remoteJid)) : undefined);
			polls.set(id, {
				id,
				options: names.map(name => ({ name, hash: hashName(name) })),
				selectableCount: extra.selectableCount ?? selectableCount ?? 0,
				creator,
				createdAt: extra.at ?? Date.now(),
				closed: false,
				votes: new Map()
			});
			return id;
		},

		has(idOrMsg) {
			return polls.has(resolvePollId(idOrMsg));
		},

		/**
		 * Record a voter's latest selection (replacing any previous vote).
		 * `selection` may be option names, sha256 hex hashes, or hash Buffers.
		 * An empty selection retracts the voter's vote. Returns the fresh tally,
		 * or null if the poll isn't registered. A closed poll ignores votes and
		 * just returns its (frozen) tally.
		 */
		applyVote(idOrMsg, voterJid, selection = []) {
			const poll = polls.get(resolvePollId(idOrMsg));
			if (!poll || !voterJid) {
				return null;
			}
			if (poll.closed) {
				return this.tally(poll.id);
			}
			const wanted = (Array.isArray(selection) ? selection : [selection])
				.map(toHashHex)
				.filter(Boolean);
			let names = poll.options.filter(o => wanted.includes(o.hash)).map(o => o.name);
			// JAP@Upgrade: honour the poll's selectableCount — never record more
			// picks than the poll allows (a no-op for well-behaved clients, which
			// already send at most selectableCount options). Keeps poll order.
			if (poll.selectableCount > 0 && names.length > poll.selectableCount) {
				names = names.slice(0, poll.selectableCount);
			}
			if (!names.length) {
				poll.votes.delete(voterJid);
			}
			else {
				poll.votes.set(voterJid, names);
			}
			return this.tally(poll.id);
		},

		/**
		 * Convenience for an aggregated update straight off a decrypted poll vote:
		 * `applyUpdate(pollId, { pollUpdateMessageKey, vote: { selectedOptions } })`.
		 */
		applyUpdate(idOrMsg, update) {
			const voter = update?.voterJid || getKeyAuthor(update?.pollUpdateMessageKey, meId);
			const selected = update?.vote?.selectedOptions || update?.selectedOptions || [];
			return this.applyVote(idOrMsg, voter, selected);
		},

		/** What did this voter pick? (array of option names, latest selection) */
		getVoterChoice(idOrMsg, voterJid) {
			const poll = polls.get(resolvePollId(idOrMsg));
			return poll?.votes.get(voterJid)?.slice() || [];
		},

		/** Number of distinct voters who currently have a vote recorded. */
		totalVoters(idOrMsg) {
			const poll = polls.get(resolvePollId(idOrMsg));
			return poll ? poll.votes.size : 0;
		},

		/** [{ name, hash, count, voters:[] }] in the poll's original option order. */
		tally(idOrMsg) {
			const poll = polls.get(resolvePollId(idOrMsg));
			if (!poll) {
				return [];
			}
			const rows = poll.options.map(o => ({ name: o.name, hash: o.hash, count: 0, voters: [] }));
			const byName = new Map(rows.map(r => [r.name, r]));
			for (const [voter, names] of poll.votes) {
				for (const name of names) {
					const row = byName.get(name);
					if (row) {
						row.count += 1;
						row.voters.push(voter);
					}
				}
			}
			return rows;
		},

		/** Leading option(s). Returns { winners:[names], count } or null when no votes. */
		winner(idOrMsg) {
			const rows = this.tally(idOrMsg);
			const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
			if (max === 0) {
				return null;
			}
			return { winners: rows.filter(r => r.count === max).map(r => r.name), count: max };
		},

		/** A compact live bar chart, one line per option. */
		render(idOrMsg, opts = {}) {
			const width = opts.width ?? 16;
			const rows = this.tally(idOrMsg);
			const total = rows.reduce((s, r) => s + r.count, 0);
			return rows.map(r => {
				const pct = total ? r.count / total : 0;
				const filled = Math.round(pct * width);
				const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
				return `${r.name}\n${bar} ${r.count} (${Math.round(pct * 100)}%)`;
			}).join('\n');
		},

		/**
		 * JAP@Upgrade: voters who currently pick a given option — by option name
		 * or by its zero-based index. Returns [] for an unknown poll/option.
		 */
		getVotersFor(idOrMsg, option) {
			const poll = polls.get(resolvePollId(idOrMsg));
			if (!poll) {
				return [];
			}
			const name = typeof option === 'number' ? poll.options[option]?.name : option;
			if (name === undefined) {
				return [];
			}
			const out = [];
			for (const [voter, names] of poll.votes) {
				if (names.includes(name)) {
					out.push(voter);
				}
			}
			return out;
		},

		/**
		 * JAP@Upgrade: freeze a poll — after `close()`, `applyVote`/`applyUpdate`
		 * stop recording and just return the frozen tally (e.g. once the poll's
		 * deadline passes). Returns false for an unknown poll.
		 */
		close(idOrMsg) {
			const poll = polls.get(resolvePollId(idOrMsg));
			if (!poll) {
				return false;
			}
			poll.closed = true;
			return true;
		},
		/** JAP@Upgrade: re-open a previously closed poll. */
		reopen(idOrMsg) {
			const poll = polls.get(resolvePollId(idOrMsg));
			if (!poll) {
				return false;
			}
			poll.closed = false;
			return true;
		},
		/** JAP@Upgrade: is this poll registered and still accepting votes? */
		isOpen(idOrMsg) {
			const poll = polls.get(resolvePollId(idOrMsg));
			return !!poll && !poll.closed;
		},

		/** Registered poll ids. */
		list() {
			return [...polls.keys()];
		},

		/** Forget one poll (or all when called with no argument). */
		reset(idOrMsg) {
			if (idOrMsg === undefined) {
				polls.clear();
				return;
			}
			polls.delete(resolvePollId(idOrMsg));
		}
	};
};
