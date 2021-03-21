// eslint-disable-next-line @typescript-eslint/ban-types
export class ObjectProxy<F extends object, T> {
    public proxy: F;
    private callback: (target: F, key: string) => T;

    constructor(target: F, callback: (target: F, key: string) => T) {
        this.callback = callback;
        this.proxy = new Proxy<F>(target, this);
    }

    get(target: F, key: string): T {
        return this.callback(target, key);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public static create<F extends object, T>(target: F, callback: (target: F, key: string) => T): Record<string, T> {
        return new ObjectProxy(target, callback).proxy as Record<string, T>;
    }
}