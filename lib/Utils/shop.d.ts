/** Shop & inventory — items, purchases and consumables on top of the economy. */
import type { Economy } from './economy';

export interface ShopItem {
	id: string;
	name: string;
	price: number;
	description: string;
	/** Remaining stock; Infinity = unlimited. */
	stock: number;
	consumable: boolean;
	category?: string;
	/** Ownership cap per user; Infinity = unlimited. */
	maxPerUser: number;
	meta: Record<string, unknown>;
}

export interface ShopOptions {
	/** Sell-back refund fraction of the price. Default 0.5. */
	sellRate?: number;
}

export interface ShopPurchase {
	user: string;
	item: ShopItem;
	qty: number;
	paid: number;
	balance: number;
}

export interface Shop {
	addItem(item: { id: string; name: string; price: number; description?: string; stock?: number; consumable?: boolean; maxPerUser?: number; category?: string; [meta: string]: unknown }): ShopItem;
	/** Patch an item live (price/stock/…). */
	updateItem(id: string, patch: Partial<Pick<ShopItem, 'name' | 'price' | 'description' | 'stock' | 'consumable' | 'maxPerUser'>>): ShopItem;
	removeItem(id: string): boolean;
	getItem(id: string): ShopItem | null;
	getCatalog(): ShopItem[];
	/** Ready-to-send store listing. */
	renderCatalog(options?: { title?: string; category?: string }): string;
	buy(user: string, itemId: string, qty?: number): ShopPurchase;
	sellBack(user: string, itemId: string, qty?: number): { refund: number; balance: number };
	useItem(user: string, itemId: string): number;
	hasItem(user: string, itemId: string, qty?: number): boolean;
	getInventory(user: string): Array<{ id: string; name: string; qty: number }>;
	giveItem(from: string, to: string, itemId: string, qty?: number): void;
	onBuy(cb: (purchase: ShopPurchase) => void): () => void;
	onUse(cb: (info: { user: string; item: ShopItem; remaining: number }) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createShop: (economy: Economy, options?: ShopOptions) => Shop;
