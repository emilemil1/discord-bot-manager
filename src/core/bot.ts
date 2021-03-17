import Discord, { Message, MessageReaction, User, PartialUser, Guild } from "discord.js";
import ModuleManager from "./modulemanager.js";
import PermissionsModule from "../modules/permissions.js";
import Sequence from "../util/sequence.js";
import { WebhookMessage } from "./module.js";
import http, { IncomingMessage } from "http";
import { Readable } from "stream";
import { SetupBotUtils } from "./botutils.js";

export interface BotConfigInterface {
    modules?: string[];
    values: {
        [key: string]: string;
    };
    prefix: string;
}

interface FleetingConfig {
    [key: string]: {
        prefixMatch?: RegExp;
    }
}

interface GlobalConfig {
    [key: string]: {
        prefix?: string;
    }
}

export class Bot {
    public readonly client: Discord.Client;
    public readonly config: BotConfigInterface;
    public readonly fleetingConfig: FleetingConfig;
    public readonly globalConfig: GlobalConfig;
    public readonly moduleManager: ModuleManager;
    public readonly permissionsModule?: typeof PermissionsModule;

    public readonly defaultPrefix: string;
    public readonly defaultPrefixMatch: RegExp;

    constructor(config: BotConfigInterface) {
        this.client = new Discord.Client({
            partials: ["MESSAGE", "REACTION"]
        });
        this.config = config;
        this.fleetingConfig = {};
        this.globalConfig = {};
        this.moduleManager = new ModuleManager();

        this.defaultPrefix = this.config.prefix;
        this.defaultPrefixMatch = this.makePrefixMatch(this.defaultPrefix);

        this.client.on("message", message => this.onMessage(message));
        this.client.on("messageReactionAdd", (reaction, user) => this.onReaction(reaction, user));
        this.client.on("guildCreate", guild => this.instantiateGuild(guild));
    }

    async init(files: string[]): Promise<void> {
        SetupBotUtils.initialize(this);
        await this.moduleManager.loadDefaultModules();
        await this.moduleManager.loadModules(files);
        await this.moduleManager.initPersistenceModule();
        await this.loadGlobalConfig();
        await this.moduleManager.initModules();
    }

    async login(): Promise<void> {
        await Sequence("Connecting to Discord servers", () => this.client.login(this.config.values.loginToken))
            .step("Starting webhook", () => this.startWebhook())
            .resolve();
    }

    async shutdown(): Promise<void> {
        await this.moduleManager.shutdownModules();
        return this.client.destroy();
    }

    private makePrefixMatch(regex: string): RegExp {
        return new RegExp(`(?<=^${regex.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&")})[^\\s]+`);
    }

    private async loadGlobalConfig(): Promise<void> {
        for (const guild of this.client.guilds.cache.values()) {
            await this.instantiateGuild(guild);
        }
    }

    private async instantiateGuild(guild: Guild): Promise<void> {
        const gConfig = await this.moduleManager.persistence?.getGuild(guild.id, "config");
        this.globalConfig[guild.id] = gConfig?.data || {};
        if (gConfig !== undefined) {
            this.fleetingConfig[guild.id] = {};
        }
    }

    private getFleetingConfig(guildId: string): FleetingConfig[string] {
        return this.fleetingConfig[guildId];
    }

    private startWebhook(): void {
        http.createServer(async (req, res) => {
            if (!req.url?.includes("/webhook/")) {
                res.statusCode = 404;
                res.end();
                return;
            }

            this.streamToString(req).then(async msg => {
                const module = this.moduleManager.getWebhookModule(req.url?.substring(req.url.indexOf("/webhook") + 8) || "");
                if (module === undefined) {
                    res.write("Received, but no handler registered");
                    res.statusCode = 200;
                    res.end();
                    return;
                }

                let response;
                try {
                    response = await module.hook(this.packageMessage(req, msg));
                } catch (e) {
                    console.error(e);
                    res.statusCode = 500;
                    res.end();
                    return;
                }
                res.statusCode = response.code;
                if (response.headers !== undefined) {
                    for (const header in response.headers) {
                        res.setHeader(header, response.headers[header]);
                    }
                }
                if (response.body !== undefined) {
                    res.write(response.body);
                }
                res.end();
            });
        }).listen(process.env.PORT || this.config.values.webhookPort);
    }

    private packageMessage(req: IncomingMessage, msg: string): WebhookMessage {
        return {
            webhook: req.url?.substring(req.url.indexOf("/webhook") + 8) || "",
            headers: req.headers as WebhookMessage["headers"],
            body: msg
        };
    }

    private streamToString(stream: Readable): Promise<string> {
        const chunks: Uint8Array[] = [];
        return new Promise((resolve, reject) => {
            stream.on("data", chunk => chunks.push(chunk));
            stream.on("error", reject);
            stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
    }

    private async onMessage(message: Message): Promise<void> {
        if (message.author.id === this.client.user?.id) return;
        let match = message.content.match(this.getGuildPrefixMatch(message.guild?.id));
        if (match === null) {
            match = message.content.match(this.defaultPrefixMatch);
        }
        if (match === null) {
            if (message.content.startsWith("> ") && !message.content.includes("\n")) {
                this.onQuote(message);
                return;
            }
        }
        if (match === null || match[0].length === 0) return;

        const module = this.moduleManager.getCommandModule(match[0]);
        if (module === undefined) return;
        const splitCommand = message.content.substring(match[0].length).split(" ");

        try {
            const hasPermission = await this.permissionsModule?.checkPermissions(splitCommand, message);
            if (!hasPermission) return;
            await module.onCommand(splitCommand, message);
        } catch (e) {
            console.error(e);
        }
    }

    private async onQuote(message: Message): Promise<void> {
        try {
            this.moduleManager.getQuoteModules().forEach(mod => mod.onQuote(message));
        } catch (e) {
            console.error(e);
        }
    }

    private async onReaction(reaction: MessageReaction, user: User | PartialUser): Promise<void> {
        const modules = this.moduleManager.getReactionModules(reaction.emoji.name);
        if (modules.length === 0) return;
        if (reaction.partial || user.partial) {
            const promises: Promise<unknown>[] = [];
            if (reaction.partial) promises.push(reaction.fetch());
            if (user.partial) promises.push(user.fetch());
            await Promise.all(promises);
        }
        for (const module of modules) {
            module.onReaction(reaction, user as User);
        }
    }

    private getGuildPrefix(guildId?: string): string {
        if (guildId === undefined) return this.defaultPrefix;
        return this.globalConfig[guildId].prefix || this.defaultPrefix;
    }

    private getGuildPrefixMatch(guildId?: string): RegExp {
        if (guildId === undefined) return this.defaultPrefixMatch;
        const fConfig = this.getFleetingConfig(guildId);
        let match = fConfig.prefixMatch;
        if (match === undefined) {
            const prefix = this.globalConfig[guildId].prefix;
            if (prefix === undefined) {
                return this.defaultPrefixMatch;
            }
            match = this.makePrefixMatch(prefix);
            fConfig.prefixMatch = match;
        }
        return match;
    }
}

