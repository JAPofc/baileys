import { Boom } from '@hapi/boom';
import { createHash } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString } from '../WABinary/index.js';
import { generateMessageIDV2 } from './generics.js';
import logger from './logger.js';
import { getStream, getUrlFromDirectPath } from './messages-media.js';
export const parseCatalogNode = (node) => {
    const catalogNode = getBinaryNodeChild(node, 'product_catalog');
    const products = getBinaryNodeChildren(catalogNode, 'product').map(parseProductNode);
    const paging = getBinaryNodeChild(catalogNode, 'paging');
    return {
        products,
        nextPageCursor: paging ? getBinaryNodeChildString(paging, 'after') : undefined
    };
};
export const parseCollectionsNode = (node) => {
    const collectionsNode = getBinaryNodeChild(node, 'collections');
    const collections = getBinaryNodeChildren(collectionsNode, 'collection').map(collectionNode => {
        const id = getBinaryNodeChildString(collectionNode, 'id');
        const name = getBinaryNodeChildString(collectionNode, 'name');
        const products = getBinaryNodeChildren(collectionNode, 'product').map(parseProductNode);
        return {
            id,
            name,
            products,
            status: parseStatusInfo(collectionNode)
        };
    });
    return {
        collections
    };
};
export const parseOrderDetailsNode = (node) => {
    const orderNode = getBinaryNodeChild(node, 'order');
    const products = getBinaryNodeChildren(orderNode, 'product').map(productNode => {
        const imageNode = getBinaryNodeChild(productNode, 'image');
        return {
            id: getBinaryNodeChildString(productNode, 'id'),
            name: getBinaryNodeChildString(productNode, 'name'),
            imageUrl: getBinaryNodeChildString(imageNode, 'url'),
            price: numberFromChild(productNode, 'price'),
            currency: getBinaryNodeChildString(productNode, 'currency'),
            quantity: numberFromChild(productNode, 'quantity')
        };
    });
    const priceNode = getBinaryNodeChild(orderNode, 'price');
    const orderDetails = {
        price: {
            total: numberFromChild(priceNode, 'total'),
            currency: getBinaryNodeChildString(priceNode, 'currency')
        },
        products
    };
    return orderDetails;
};
export const toProductNode = (productId, product) => {
    const attrs = {};
    const content = [];
    if (typeof productId !== 'undefined') {
        content.push({
            tag: 'id',
            attrs: {},
            content: Buffer.from(productId)
        });
    }
    if (typeof product.name !== 'undefined') {
        content.push({
            tag: 'name',
            attrs: {},
            content: Buffer.from(product.name)
        });
    }
    if (typeof product.description !== 'undefined') {
        content.push({
            tag: 'description',
            attrs: {},
            content: Buffer.from(product.description)
        });
    }
    if (typeof product.retailerId !== 'undefined') {
        content.push({
            tag: 'retailer_id',
            attrs: {},
            content: Buffer.from(product.retailerId)
        });
    }
    if (product.images.length) {
        content.push({
            tag: 'media',
            attrs: {},
            content: product.images.map(img => {
                if (!('url' in img)) {
                    throw new Boom('Expected img for product to already be uploaded', { statusCode: 400 });
                }
                return {
                    tag: 'image',
                    attrs: {},
                    content: [
                        {
                            tag: 'url',
                            attrs: {},
                            content: Buffer.from(img.url.toString())
                        }
                    ]
                };
            })
        });
    }
    if (typeof product.price !== 'undefined') {
        content.push({
            tag: 'price',
            attrs: {},
            content: Buffer.from(product.price.toString())
        });
    }
    if (typeof product.currency !== 'undefined') {
        content.push({
            tag: 'currency',
            attrs: {},
            content: Buffer.from(product.currency)
        });
    }
    if ('originCountryCode' in product) {
        if (typeof product.originCountryCode === 'undefined') {
            attrs['compliance_category'] = 'COUNTRY_ORIGIN_EXEMPT';
        }
        else {
            content.push({
                tag: 'compliance_info',
                attrs: {},
                content: [
                    {
                        tag: 'country_code_origin',
                        attrs: {},
                        content: Buffer.from(product.originCountryCode)
                    }
                ]
            });
        }
    }
    if (typeof product.isHidden !== 'undefined') {
        attrs['is_hidden'] = product.isHidden.toString();
    }
    const node = {
        tag: 'product',
        attrs,
        content
    };
    return node;
};
/**
 * JAP@Fix (§2.115): `+getBinaryNodeChildString(...)` is `NaN` whenever the node is absent, and
 * WhatsApp omits `<price>` for "price on request" listings and `<quantity>` for some orders.
 * A `NaN` price serialises to `null`, breaks every comparison, and silently poisons any total
 * computed from it. Missing numbers are `undefined` now.
 */
const numberFromChild = (node, tag) => {
    const raw = getBinaryNodeChildString(node, tag);
    if (raw === undefined || raw === null || raw === '') {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
};
export const parseProductNode = (productNode) => {
    const isHidden = productNode.attrs.is_hidden === 'true';
    const id = getBinaryNodeChildString(productNode, 'id');
    const mediaNode = getBinaryNodeChild(productNode, 'media');
    const statusInfoNode = getBinaryNodeChild(productNode, 'status_info');
    const product = {
        id,
        imageUrls: parseImageUrls(mediaNode),
        reviewStatus: {
            whatsapp: getBinaryNodeChildString(statusInfoNode, 'status')
        },
        // JAP@Fix (§2.115): this was hard-coded to 'in stock', so a product the seller had
        // marked out of stock was still reported as available -- `<availability>` is right
        // there in the node.
        availability: getBinaryNodeChildString(productNode, 'availability') || 'in stock',
        name: getBinaryNodeChildString(productNode, 'name'),
        retailerId: getBinaryNodeChildString(productNode, 'retailer_id'),
        url: getBinaryNodeChildString(productNode, 'url'),
        description: getBinaryNodeChildString(productNode, 'description'),
        price: numberFromChild(productNode, 'price'),
        currency: getBinaryNodeChildString(productNode, 'currency'),
        isHidden
    };
    return product;
};
/**
 * Uploads images not already uploaded to WA's servers
 */
export async function uploadingNecessaryImagesOfProduct(product, waUploadToServer, timeoutMs = 30000) {
    product = {
        ...product,
        images: product.images
            ? await uploadingNecessaryImages(product.images, waUploadToServer, timeoutMs)
            : product.images
    };
    return product;
}
/**
 * Uploads images not already uploaded to WA's servers
 */
export const uploadingNecessaryImages = async (images, waUploadToServer, timeoutMs = 30000) => {
    const results = await Promise.all(images.map(async (img) => {
        if ('url' in img) {
            const url = img.url.toString();
            if (url.includes('.whatsapp.net')) {
                return { url };
            }
        }
        const { stream } = await getStream(img);
        const hasher = createHash('sha256');
        const filePath = join(tmpdir(), 'img' + generateMessageIDV2());
        const encFileWriteStream = createWriteStream(filePath);
        // JAP@Fix (bug 61): no 'error' listener meant a write failure (e.g. disk
        // full) would surface as an unhandled 'error' event instead of rejecting
        // this promise; and the stream was never closed before unlink() below.
        const writeStreamError = new Promise((_, reject) => encFileWriteStream.on('error', reject));
        // JAP@Fix (§2.116): the temp file was only removed on the happy path. A failed or
        // timed-out upload -- and an upload that never started because the source stream
        // broke -- left a full-size copy of every catalogue image behind in os.tmpdir(),
        // for the lifetime of the machine. Cleanup is in a `finally` now. The writes also
        // ignored back-pressure, buffering a whole image in memory on a slow disk.
        try {
            for await (const block of stream) {
                hasher.update(block);
                if (!encFileWriteStream.write(block)) {
                    await Promise.race([
                        new Promise(resolve => encFileWriteStream.once('drain', resolve)),
                        writeStreamError
                    ]);
                }
            }
            await Promise.race([
                new Promise((resolve) => encFileWriteStream.end(resolve)),
                writeStreamError
            ]);
            const sha = hasher.digest('base64');
            const { directPath } = await waUploadToServer(filePath, {
                mediaType: 'product-catalog-image',
                fileEncSha256B64: sha,
                timeoutMs
            });
            return { url: getUrlFromDirectPath(directPath) };
        }
        finally {
            encFileWriteStream.destroy();
            await fs.unlink(filePath).catch(err => logger.warn({ err, filePath }, 'error deleting temp catalogue image'));
        }
    }));
    return results;
};
const parseImageUrls = (mediaNode) => {
    const imgNode = getBinaryNodeChild(mediaNode, 'image');
    return {
        requested: getBinaryNodeChildString(imgNode, 'request_image_url'),
        original: getBinaryNodeChildString(imgNode, 'original_image_url')
    };
};
const parseStatusInfo = (mediaNode) => {
    const node = getBinaryNodeChild(mediaNode, 'status_info');
    return {
        status: getBinaryNodeChildString(node, 'status'),
        canAppeal: getBinaryNodeChildString(node, 'can_appeal') === 'true'
    };
};
