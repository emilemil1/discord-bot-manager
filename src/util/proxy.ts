export class ObjectProxy<T> {
    private callback: (target: Record<string, T>, key: string) => T;

    constructor(callback: ObjectProxy<T>["callback"]) {
        this.callback = callback;
    }

    get(target: Record<string, T>, key: string): T {
        return this.callback(target, key);
    }
}