// Fix: shop.load() buried maxPerUser + category inside `meta`, so after a
//   save/reload the per-user purchase cap silently stopped enforcing and
//   category filtering broke.
// Upgrade: restock(), getInventoryValue(), and category-patchable updateItem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy } from '../lib/Utils/economy.js';
import { createShop } from '../lib/Utils/shop.js';

const richShop = (eco, ...users) => {
    for (const u of users) eco.add(u, 1_000_000);
};

test('shop fix: maxPerUser + category survive a save/reload', () => {
    const eco = createEconomy();
    const shop = createShop(eco);
    shop.addItem({ id: 'vip', name: 'VIP', price: 10, maxPerUser: 1, category: 'premium' });
    shop.addItem({ id: 'potion', name: 'Potion', price: 5, consumable: true }); // no cap

    const snap = JSON.parse(JSON.stringify(shop.toJSON()));
    const eco2 = createEconomy();
    richShop(eco2, 'v@s');
    const shop2 = createShop(eco2);
    shop2.load(snap);

    assert.equal(shop2.getItem('vip').maxPerUser, 1, 'cap restored');
    assert.equal(shop2.getItem('vip').category, 'premium', 'category restored');
    assert.equal(shop2.getItem('potion').maxPerUser, Infinity, 'no-cap item stays Infinity');

    // cap is enforced again after reload
    shop2.buy('v@s', 'vip', 1);
    assert.throws(() => shop2.buy('v@s', 'vip', 1), /per-user limit/);

    // category filtering works again
    assert.match(shop2.renderCatalog({ category: 'premium' }), /VIP/);
});

test('shop upgrade: restock increases stock (relative), Infinity untouched', () => {
    const eco = createEconomy();
    const shop = createShop(eco);
    shop.addItem({ id: 'a', name: 'A', price: 1, stock: 2 });
    assert.equal(shop.restock('a', 3), 5);
    assert.equal(shop.getItem('a').stock, 5);

    shop.addItem({ id: 'b', name: 'B', price: 1 }); // Infinity stock
    assert.equal(shop.restock('b', 10), Infinity);
    assert.throws(() => shop.restock('a', 0), /positive integer/);
    assert.throws(() => shop.restock('missing', 1), /unknown item/);
});

test('shop upgrade: getInventoryValue sums sell-back value', () => {
    const eco = createEconomy();
    richShop(eco, 'u@s');
    const shop = createShop(eco, { sellRate: 0.5 });
    shop.addItem({ id: 'sword', name: 'Sword', price: 100 });
    shop.addItem({ id: 'shield', name: 'Shield', price: 40 });
    shop.buy('u@s', 'sword', 2); // sell value floor(100*0.5)*2 = 100
    shop.buy('u@s', 'shield', 1); // floor(40*0.5)*1 = 20
    assert.equal(shop.getInventoryValue('u@s'), 120);
    assert.equal(shop.getInventoryValue('nobody@s'), 0);
});

test('shop upgrade: updateItem can patch category', () => {
    const eco = createEconomy();
    const shop = createShop(eco);
    shop.addItem({ id: 'x', name: 'X', price: 1, category: 'old' });
    shop.updateItem('x', { category: 'new' });
    assert.equal(shop.getItem('x').category, 'new');
});
