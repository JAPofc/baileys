/**
 * lib/Store/object-repository.js — a tiny id-keyed entity store (used for chat labels)
 */
export class ObjectRepository {
	/**
	 * JAP@Fix (§2.55 / v2.4.7): the constructor only understood a `{ id: entity }` map,
	 * while `toJSON()` emits a plain **array**. Feeding a serialized repository back into
	 * `new ObjectRepository(...)` therefore produced entries keyed by array index
	 * (`'0'`, `'1'`, …), so every `findById()` missed and the whole label set was lost on
	 * restore. Both shapes are now accepted.
	 *
	 * @param {Record<string, object> | object[]} entities
	 */
	constructor(entities = {}) {
		this.entityMap = new Map();
		this.load(entities);
	}

	/**
	 * Merge entities from either a `{ id: entity }` map or an array of entities carrying
	 * their own `id`. Entries with no usable id are skipped rather than stored under a
	 * meaningless key.
	 *
	 * @param {Record<string, object> | object[] | null | undefined} entities
	 * @returns {this}
	 */
	load(entities) {
		if (Array.isArray(entities)) {
			for (const entity of entities) {
				const id = entity?.id;
				if (id !== undefined && id !== null) {
					this.entityMap.set(String(id), { ...entity });
				}
			}
		}
		else if (entities && typeof entities === 'object') {
			for (const [key, entity] of Object.entries(entities)) {
				this.entityMap.set(String(entity?.id ?? key), { ...entity });
			}
		}
		return this;
	}

	findById(id) {
		return this.entityMap.get(id);
	}

	findAll() {
		return Array.from(this.entityMap.values());
	}

	upsertById(id, entity) {
		return this.entityMap.set(id, { ...entity });
	}

	deleteById(id) {
		return this.entityMap.delete(id);
	}

	count() {
		return this.entityMap.size;
	}

	/** JAP@Add (v2.4.7): whether an entity with this id is stored. */
	hasId(id) {
		return this.entityMap.has(id);
	}

	/** JAP@Add (v2.4.7): drop every entity. */
	clear() {
		this.entityMap.clear();
		return this;
	}

	toJSON() {
		return this.findAll();
	}

	/**
	 * JAP@Add (v2.4.7): rebuild a repository from whatever `toJSON()` produced — the
	 * round-trip that §2.55 broke.
	 *
	 * @param {Record<string, object> | object[] | null | undefined} json
	 * @returns {ObjectRepository}
	 */
	static fromJSON(json) {
		return new ObjectRepository(json || {});
	}
}
