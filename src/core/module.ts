import { Message, MessageReaction, User } from "discord.js";

//Config

export enum ModuleType {
    command = "command",
    persistence = "persistence",
    webhook = "webhook",
    quote = "quote",
    reaction = "reaction"
}

export enum Permission {
    owner = "owner",
    everyone = "everyone"
}

interface ModuleConfig {
    readonly name: string;
    readonly description: string;
    readonly type: `${ModuleType}`[];
}

interface Commands {
    [key: string]: `${Permission}`
}

export interface CommandModuleConfiguration extends ModuleConfig {
    readonly commands: Commands;
}

export interface WebhookModuleConfiguration extends ModuleConfig {
    readonly webhook: readonly string[];
}

export interface ReactionModuleConfiguration extends ModuleConfig {
    readonly reactions: readonly string[];
}

//Persistence

type PersistenceDataType = string | boolean | number | null | undefined;

interface PersistenceDataMap {
    [key: string]: PersistenceData;
}

export type PersistenceData = PersistenceDataType | PersistenceDataType[] | PersistenceDataMap;

export interface PersistenceResult {
    result: boolean;
    message: string;
}

export interface PersistenceTransaction<T> {
    data: T;
    commit: () => Promise<PersistenceResult>
}

//Webhook

export interface WebhookMessage {
    webhook: string;
    headers: {
        [key: string]: string;
    };
    body: string;
}

export interface WebhookResponse {
    code: number;
    headers?: {
        [key: string]: string;
    };
    body?: string;
}

//Modules

export interface Module {
    configuration: ModuleConfig;
    onLoad?: () => Promise<void>;
    onShutdown?: () => Promise<void>;
}

export interface CommandModule extends Module {
    configuration: CommandModuleConfiguration;
    onCommand: (command: string[], message: Message) => Promise<void>;
}

export interface PersistenceModule extends Module {
    getOld: (id: string) => Promise<PersistenceData>;
    getGlobal: <T>(id: string) => Promise<PersistenceTransaction<T>>;
    getGuild: <T>(guildId: string, id: string) => Promise<PersistenceTransaction<T>>;
    noop: <T>() => Promise<PersistenceTransaction<T>>
}

export interface WebhookModule extends Module {
    configuration: WebhookModuleConfiguration;
    hook: (message: WebhookMessage) => Promise<WebhookResponse>;
}

export interface ReactionModule extends Module {
    configuration: ReactionModuleConfiguration;
    onReaction: (reaction: MessageReaction, user: User) => Promise<void>;
}

export interface QuoteModule extends Module {
    configuration: ModuleConfig;
    onQuote: (message: Message) => Promise<void>;
}