import { Bot } from "./bot.js";
import Discord from "discord.js";
import { Module, PersistenceModule, PersistenceTransaction } from "./module.js";
import { ObjectProxy } from "../util/proxy.js";

class GuildConfiguration {
    private config: Bot["guildConfig"][string]["persist"];
    constructor(value: Bot["guildConfig"][string]["persist"]) {
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
        this.values = ObjectProxy.create(value.values, (t, k) => t[k]);
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

    async get<T>(id: string): Promise<PersistenceTransaction<T>> {
        return this.persistence.getGlobal<T>(id);
    }
}

class GuildPersistence {
    private persistence: PersistenceModule;
    private key?: string;

    constructor(persistence: PersistenceModule, key?: string) {
        this.persistence = persistence;
        this.key = key;
    }

    async get<T>(id: string): Promise<PersistenceTransaction<T>> {
        if (this.key) return this.persistence.getGuild<T>(this.key, id);
        return this.persistence.noop<T>();

    }
}

interface BotUtilsConfig {
    guild?: Record<string, GuildConfiguration>;
    forGuild: (id?: string) => GuildConfiguration;
    global?: GlobalConfiguration;
}

interface BotUtilsPersistence {
    guild?: Record<string, GuildPersistence>;
    forGuild: (id?: string) => GuildPersistence;
    global?: GlobalPersistence;
}

class BotUtils {
    private static botUtils: BotUtils;
    private bot!: Bot;
    private _config!: BotUtilsConfig
    private _persistence!: BotUtilsPersistence

    constructor() {
        BotUtils.botUtils = this;
    }

    public static initialize(bot: Bot): void {
        this.botUtils.bot = bot;
        this.botUtils._config = {
            global: new GlobalConfiguration(bot.config),
            guild: ObjectProxy.create(bot.guildConfig, (t, k) => new GuildConfiguration(t[k].persist)),
            forGuild: (id?: string) => {
                if (id === undefined) return new GuildConfiguration({});
                return new GuildConfiguration(bot.guildConfig[id].persist);
            }
        };
        Object.freeze(this.botUtils._config);
        this.botUtils._persistence = {
            global: new GlobalPersistence(bot.moduleManager.persistence),
            guild: ObjectProxy.create(bot.moduleManager.persistence, (t, k) => new GuildPersistence(t, k)),
            forGuild: (id?: string) => {
                if (id === undefined) return new GuildPersistence(bot.moduleManager.persistence, undefined);
                return new GuildPersistence(bot.moduleManager.persistence, id);
            }
        };
        Object.freeze(this.botUtils._persistence);
    }

    get config(): Readonly<Required<BotUtilsConfig>> {
        return this._config as Required<BotUtilsConfig>;
    }

    get discordClient(): Readonly<Discord.Client> {
        return this.bot.client;
    }

    get storage(): Readonly<Required<BotUtilsPersistence>> {
        return this._persistence as Required<BotUtilsPersistence>;
    }

    get modules(): Readonly<Module[]> {
        return this.bot.moduleManager.getAllModules();
    }
}

export { BotUtils as SetupBotUtils };
const botUtils = new BotUtils;
export { botUtils as BotUtils };