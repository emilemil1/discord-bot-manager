import { Bot } from "./bot.js";
import Discord from "discord.js";
import { Module, PersistenceModule, PersistenceTransaction } from "./module.js";
import { ObjectProxy } from "../util/proxy.js";

class GuildConfiguration {
    private config: Bot["globalConfig"][string];
    constructor(value: Bot["globalConfig"][string]) {
        this.config = value;
    }

    get prefix() {
        return this.config.prefix || botUtils.config.global.defaultPrefix;
    }

    set prefix(prefix: string) {
        this.config.prefix = prefix;
    }
}

class GlobalConfiguration {
    private config: Bot["config"];
    public readonly values: Bot["config"]["values"];

    constructor(value: Bot["config"]) {
        this.config = value;
        this.values = new Proxy(value.values, new ObjectProxy<string>((t, k) => t[k])) as Bot["config"]["values"];
    }

    get defaultPrefix() {
        return this.config.prefix;
    }
}

class GlobalPersistence {
    private persistence: PersistenceModule;

    constructor(persistence: PersistenceModule) {
        this.persistence = persistence;
    }

    async get(id: string): Promise<PersistenceTransaction> {
        return this.persistence.getGlobal(id);
    }
}

class GuildPersistence {
    private persistence: PersistenceModule;
    private key?: string;

    constructor(persistence: PersistenceModule, key?: string) {
        this.persistence = persistence;
        this.key = key;
    }

    async get(id: string): Promise<PersistenceTransaction> {
        if (this.key) return this.persistence.getGuild(this.key, id);
        return this.persistence.noop();

    }
}

class BotUtils {
    private static botUtils: BotUtils;
    private bot!: Bot;
    private _config!: {
        guild?: Record<string, GuildConfiguration>;
        forGuild: (id?: string) => GuildConfiguration;
        global?: GlobalConfiguration;
    }
    private _persistence!: {
        guild?: Record<string, GuildPersistence>;
        forGuild: (id?: string) => GuildPersistence;
        global?: GlobalPersistence;
    }

    constructor() {
        BotUtils.botUtils = this;
    }

    public static initialize(bot: Bot): void {
        this.botUtils.bot = bot;
        this.botUtils._config = {
            global: new GlobalConfiguration(bot.config),
            guild: new Proxy(bot.globalConfig, new ObjectProxy<GuildConfiguration>((t, k) => new GuildConfiguration(t[k]))) as Record<string, GuildConfiguration>,
            forGuild: (id?: string) => {
                if (id === undefined) return new GuildConfiguration({});
                return new GuildConfiguration(bot.globalConfig[id]);
            }
        };
        Object.freeze(this.botUtils._config);
        this.botUtils._persistence = {
            global: new GlobalPersistence(bot.moduleManager.persistence),
            guild: new Proxy({}, new ObjectProxy<GuildPersistence>((t, k) => new GuildPersistence(bot.moduleManager.persistence, k))) as Record<string, GuildPersistence>,
            forGuild: (id?: string) => {
                if (id === undefined) return new GuildPersistence(bot.moduleManager.persistence, undefined);
                return new GuildPersistence(bot.moduleManager.persistence, id);
            }
        };
        Object.freeze(this.botUtils._persistence);
    }

    get config(): Readonly<Required<BotUtils["_config"]>> {
        return this._config as Required<BotUtils["_config"]>;
    }

    get discordClient(): Readonly<Discord.Client> {
        return this.bot.client;
    }

    get storage(): Readonly<Required<BotUtils["_persistence"]>> {
        return this._persistence as Required<BotUtils["_persistence"]>;
    }

    get modules(): Readonly<Module[]> {
        return this.bot.moduleManager.getAllModules();
    }
}

export { BotUtils as SetupBotUtils };
const botUtils = new BotUtils;
export { botUtils as BotUtils };