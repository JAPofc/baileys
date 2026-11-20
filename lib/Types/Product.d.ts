import type { WAMediaUpload } from './Message.js';
export type CatalogResult = {
    data: {
        paging: {
            cursors: {
                before: string;
                after: string;
            };
        };
        data: any[];
    };
};
export type ProductCreateResult = {
    data: {
        product: {};
    };
};
export type CatalogStatus = {
    status: string;
    canAppeal: boolean;
};
export type CatalogCollection = {
    id: string;
    name: string;
    products: Product[];
    status: CatalogStatus;
};
export type ProductAvailability = 'in stock' | 'out of stock' | 'unknown' | (string & {});
export type ProductBase = {
    name: string;
    retailerId?: string;
    url?: string;
    description: string;
    price: number;
    currency: string;
    isHidden?: boolean;
};
export type ProductCreate = ProductBase & {
    /** ISO country code for product origin. Set to undefined for no country */
    originCountryCode: string | undefined;
    /** images of the product */
    images: WAMediaUpload[];
};
export type ProductUpdate = Omit<ProductCreate, 'originCountryCode'>;
export type Product = Omit<ProductBase, 'price'> & {
    id: string;
    /** `undefined` for "price on request" listings — WhatsApp omits the node. */
    price?: number;
    imageUrls: {
        [_: string]: string;
    };
    reviewStatus: {
        [_: string]: string;
    };
    availability: ProductAvailability;
};
export type OrderPrice = {
    currency: string;
    /** `undefined` when the server omits the total. */
    total?: number;
};
export type OrderProduct = {
    id: string;
    imageUrl: string;
    name: string;
    /** `undefined` when the server omits it. */
    quantity?: number;
    currency: string;
    /** `undefined` when the server omits it. */
    price?: number;
};
export type OrderDetails = {
    price: OrderPrice;
    products: OrderProduct[];
};
export type CatalogCursor = string;
export type GetCatalogOptions = {
    /** cursor to start from */
    cursor?: CatalogCursor;
    /** number of products to fetch */
    limit?: number;
    jid?: string;
};
//# sourceMappingURL=Product.d.ts.map