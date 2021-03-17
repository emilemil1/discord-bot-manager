
type ReturnType<T> = T extends Sequence<infer ST> ? ST : T;
type ResolveType<T, R> = R extends Record<string, unknown> | string | number | boolean ? R : T;

class Sequence<T> {
    private static depth = 0;
    private chain: Promise<T>

    constructor() {
        this.chain = new Promise<void>((res) => {res();}) as unknown as Promise<T>;
    }

    step<R>(title: string, func: (value: T) => R | Promise<R>): Sequence<ReturnType<R>> {
        this.chain = this.chain.then(async (val) => {
            Sequence.depth++;
            console.log("|" + "".padEnd(Sequence.depth * 2, "-") + " " + title);
            let returnValue: R | Promise<R> = await func(val);
            if (returnValue instanceof Sequence) {
                returnValue = await returnValue.resolve();
            }
            Sequence.depth--;
            return returnValue;
        }) as Promise<T>;
        return this as unknown as Sequence<ReturnType<R>>;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async resolve<R>(func?: (value: T) => R): Promise<ResolveType<T,R>> {
        if (func) {
            return this.chain.then(val => func(val as T)) as Promise<ResolveType<T,R>>;
        } else {
            return this.chain as Promise<ResolveType<T,R>>;
        }
        
    }
}

export default function<R>(title: string, func?: () => R | Promise<R>): Sequence<ResolveType<void,ReturnType<R>>> {
    if (func === undefined) {
        return new Sequence().step(title, () => {
            return;
        }) as Sequence<ResolveType<void,ReturnType<R>>>;
    }
    return new Sequence().step(title, func) as Sequence<ResolveType<void,ReturnType<R>>>;
}