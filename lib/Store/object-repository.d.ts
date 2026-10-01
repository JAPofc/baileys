/** A small id-keyed entity store (used for chat labels). */
export declare class ObjectRepository<T extends { id?: string } = any> {
    entityMap: Map<string, T>;
    /** Accepts either a `{ id: entity }` map or an array of entities (v2.4.7, §2.55). */
    constructor(entities?: Record<string, T> | T[]);
    /** Merge entities from either shape; entries without a usable id are skipped. */
    load(entities: Record<string, T> | T[] | null | undefined): this;
    findById(id: string): T | undefined;
    findAll(): T[];
    upsertById(id: string, entity: T): Map<string, T>;
    deleteById(id: string): boolean;
    count(): number;
    /** Whether an entity with this id is stored (v2.4.7). */
    hasId(id: string): boolean;
    /** Drop every entity (v2.4.7). */
    clear(): this;
    toJSON(): T[];
    /** Rebuild a repository from whatever `toJSON()` produced (v2.4.7). */
    static fromJSON<E extends { id?: string } = any>(json: Record<string, E> | E[] | null | undefined): ObjectRepository<E>;
}
