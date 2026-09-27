/**
 * Shop & inventory — the natural extension of the economy system: sell
 * items, track inventories, consume items with effects.
 *
 * ```js
 * import { createEconomy, createShop } from '@japofc/baileys'
 *
 * const eco = createEconomy()
 * const shop = createShop(eco)
 * shop.addItem({ id: 'potion', name: 'Health Potion', price: 250, consumable: true })
 * shop.addItem({ id: 'vip', name: 'VIP Badge', price: 10_000, stock: 5 })
 *
 * shop.buy(user, 'potion', 2)          // deducts 500, adds 2 potions
 * shop.getInventory(user)              // [{ id, name, qty }]
 * shop.onUse(({ user, item }) => { /* apply the effect *\/ })
 * shop.useItem(user, 'potion')         // consumes one
 * shop.sellBack(user, 'potion')        // refund at sellRate
 * ```
 *
 * All purchases go through the economy instance you pass in, so balances,
 * transaction logs and persistence stay in one place.
 */

export const createShop = (economy, options = {}) => {
	if (!economy || typeof economy.deduct !== 'function') {
		throw new Error('createShop(economy) needs a createEconomy() instance');
	}
	const { sellRate = 0.5 } = options;

	/** id -> { id, name, price, description, stock, consumable, meta } */
	const catalog = new Map();
	/** user -> Map(itemId -> qty) */
	const inventories = new Map();
	const buyCbs = new Set();
	const useCbs = new Set();

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const inv = (user) => {
		let bag = inventories.get(user);
		if (!bag) {
			bag = new Map();
			inventories.set(user, bag);
		}
		return bag;
	};

	return {
		/** Add or replace a catalog item. */
		addItem({ id, name, price, description = '', stock = Infinity, consumable = false, maxPerUser = Infinity, ...meta } = {}) {
			if (!id || !name || !Number.isFinite(price) || price < 0) {
				throw new Error('item needs { id, name, price >= 0 }');
			}
			catalog.set(id, { id, name, price, description, stock, consumable, maxPerUser, meta });
			return catalog.get(id);
		},
		removeItem(id) {
			return catalog.delete(id);
		},
		getItem: (id) => catalog.get(id) || null,
		getCatalog: () => [...catalog.values()],
		/**
		 * Buy `qty` of an item. Throws on unknown item, empty stock or
		 * insufficient balance. Returns `{ item, qty, paid, balance }`.
		 */
		buy(user, itemId, qty = 1) {
			const item = catalog.get(itemId);
			if (!item) {
				throw new Error(`unknown item: ${itemId}`);
			}
			if (!Number.isInteger(qty) || qty < 1) {
				throw new Error('qty must be a positive integer');
			}
			if (item.stock < qty) {
				throw new Error(`out of stock: ${item.name} (${item.stock} left)`);
			}
			// JAP@Upgrade: per-user ownership cap (e.g. one VIP badge each)
			const owned = inv(user).get(itemId) || 0;
			if (owned + qty > item.maxPerUser) {
				throw new Error(`per-user limit reached: ${item.name} (max ${item.maxPerUser})`);
			}
			const cost = item.price * qty;
			const balance = economy.deduct(user, cost, `shop: ${item.name} x${qty}`);
			if (item.stock !== Infinity) {
				item.stock -= qty;
			}
			const bag = inv(user);
			bag.set(itemId, (bag.get(itemId) || 0) + qty);
			const result = { user, item, qty, paid: cost, balance };
			emit(buyCbs, result);
			return result;
		},
		/**
		 * Sell an item back at `sellRate` of its price.
		 * Returns `{ refund, balance }`.
		 */
		sellBack(user, itemId, qty = 1) {
			const item = catalog.get(itemId);
			if (!item) {
				throw new Error(`unknown item: ${itemId}`);
			}
			const bag = inv(user);
			const owned = bag.get(itemId) || 0;
			if (owned < qty) {
				throw new Error(`not enough ${item.name}: has ${owned}, selling ${qty}`);
			}
			bag.set(itemId, owned - qty);
			if (bag.get(itemId) === 0) {
				bag.delete(itemId);
			}
			if (item.stock !== Infinity) {
				item.stock += qty;
			}
			const refund = Math.floor(item.price * sellRate) * qty;
			const balance = economy.add(user, refund, `shop sell-back: ${item.name} x${qty}`);
			return { refund, balance };
		},
		/**
		 * Use one item. Consumables are removed from the inventory; onUse
		 * fires either way. Returns the remaining qty.
		 */
		useItem(user, itemId) {
			const item = catalog.get(itemId);
			if (!item) {
				throw new Error(`unknown item: ${itemId}`);
			}
			const bag = inv(user);
			const owned = bag.get(itemId) || 0;
			if (owned < 1) {
				throw new Error(`you don't own ${item.name}`);
			}
			let remaining = owned;
			if (item.consumable) {
				remaining = owned - 1;
				if (remaining === 0) {
					bag.delete(itemId);
				} else {
					bag.set(itemId, remaining);
				}
			}
			emit(useCbs, { user, item, remaining });
			return remaining;
		},
		hasItem: (user, itemId, qty = 1) => (inventories.get(user)?.get(itemId) || 0) >= qty,
		getInventory(user) {
			const bag = inventories.get(user);
			if (!bag) {
				return [];
			}
			return [...bag].map(([id, qty]) => ({ id, name: catalog.get(id)?.name ?? id, qty }));
		},
		/** Move items between users (gifting). */
		giveItem(from, to, itemId, qty = 1) {
			const bag = inv(from);
			const owned = bag.get(itemId) || 0;
			if (owned < qty) {
				throw new Error(`not enough items: has ${owned}, giving ${qty}`);
			}
			bag.set(itemId, owned - qty);
			if (bag.get(itemId) === 0) {
				bag.delete(itemId);
			}
			const target = inv(to);
			target.set(itemId, (target.get(itemId) || 0) + qty);
		},
		onBuy(cb) {
			buyCbs.add(cb);
			return () => buyCbs.delete(cb);
		},
		onUse(cb) {
			useCbs.add(cb);
			return () => useCbs.delete(cb);
		},
		toJSON() {
			return {
				sellRate,
				catalog: [...catalog.values()].map(({ meta, ...item }) => ({ ...item, ...meta, stock: item.stock === Infinity ? null : item.stock })),
				inventories: [...inventories].map(([user, bag]) => [user, [...bag]])
			};
		},
		load(snapshot) {
			catalog.clear();
			inventories.clear();
			for (const { id, name, price, description, stock, consumable, ...meta } of snapshot?.catalog || []) {
				catalog.set(id, { id, name, price, description: description || '', stock: stock === null ? Infinity : stock, consumable: !!consumable, meta });
			}
			for (const [user, bag] of snapshot?.inventories || []) {
				inventories.set(user, new Map(bag));
			}
		},
		clear() {
			catalog.clear();
			inventories.clear();
		}
	};
};
