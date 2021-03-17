
import { Module, PersistenceModule, ModuleType, CommandModule, WebhookModule, QuoteModule, ReactionModule, PersistenceResult, PersistenceTransaction } from "./module.js";
import Sequence from "../util/sequence.js";
import Path from "path";

interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export default class ModuleManager {
    private commandModules: Map<string, CommandModule>
    private webhookModules: Map<string, WebhookModule>
    private reactionModules: Map<string, ReactionModule[]>
    private quoteModules: Array<QuoteModule>
    private persistenceModule!: PersistenceModule;
    private allModules: Array<Module>;

    constructor() {
        this.commandModules = new Map();
        this.webhookModules = new Map();
        this.reactionModules = new Map();
        this.quoteModules = [];
        this.allModules = [];
    }

    async loadModules(files: string[]): Promise<void> {
        for (const file of files) {
            if (file.endsWith(".js")) {
                await Sequence(`Loading module '${file}'`, () => this.loadModule(file)).resolve();
            }
        }
    }

    async loadDefaultModules(): Promise<void> {
        const modules = [
            "../modules/config.js",
            "../modules/permissions.js"
        ];

        for (const module of modules) {
            const file = Path.dirname(import.meta.url) + "/" + module;
            await Sequence(`Loading default module '${file}'`, () => this.loadModule(file)).resolve();
        }

    }

    async initPersistenceModule(): Promise<void> {
        await Sequence("Initializing persistence", async () => {
            if (this.persistenceModule !== undefined) {
                if (this.persistenceModule.onLoad !== undefined) await this.persistenceModule.onLoad();
            } else {
                const noopCommit = async (): Promise<PersistenceResult> => {
                    return {
                        result: false,
                        message: "No persistence."
                    };
                };
                const noopTransaction = async (): Promise<PersistenceTransaction> => {
                    return {
                        data: {},
                        commit: noopCommit
                    };
                };
                this.persistenceModule = {
                    configuration: {
                        name: "Default No Persistence",
                        description: "",
                        type: [ModuleType.persistence]
                    },
                    getGlobal: noopTransaction,
                    getGuild: noopTransaction,
                    noop: noopTransaction
                };
            }
        }).resolve();
    }

    async initModules(): Promise<void> {
        await Sequence("Initializing modules", async () => {
            const init = new Set();
            for (const module of this.commandModules.values()) {
                if (!init.has(module)) {
                    init.add(await this.initModule(module));
                }
            }
            for (const module of this.webhookModules.values()) {
                if (!init.has(module)) {
                    init.add(await this.initModule(module));
                }
            }
            for (const module of this.quoteModules.values()) {
                if (!init.has(module)) {
                    init.add(await this.initModule(module));
                }
            }
            for (const modules of this.reactionModules.values()) {
                for (const module of modules) {
                    if (!init.has(module)) {
                        init.add(await this.initModule(module));
                    }
                }
            }
        }).resolve();
    }

    private async initModule(module: Module): Promise<Module> {
        if (module.onLoad !== undefined) await module.onLoad();
        return module;
    }

    get persistence(): PersistenceModule {
        return this.persistenceModule;
    }

    async shutdownModules(): Promise<void> {
        return await Sequence("Shutting down modules", async () => {
            const downed = new Set();
            for (const module of this.commandModules.values()) {
                if (!downed.has(module.configuration.name) && module.onShutdown !== undefined) {
                    await module.onShutdown();
                    downed.add(module.configuration.name);
                }
            }
            for (const module of this.webhookModules.values()) {
                if (!downed.has(module.configuration.name) && module.onShutdown !== undefined) {
                    await module.onShutdown();
                    downed.add(module.configuration.name);
                }
            }
            if (this.persistenceModule !== undefined && this.persistenceModule.onShutdown !== undefined) {
                return await this.persistenceModule.onShutdown();
            }
        }).resolve();
    }

    getCommandModule(command: string): CommandModule | undefined {
        return this.commandModules.get(command);
    }

    getCommandModules(): CommandModule[] {
        return this.allModules.filter(module => module.configuration.type.includes(ModuleType.command)) as CommandModule[];
    }

    getReactionModules(reaction?: string): ReactionModule[] {
        if (reaction) {
            return this.reactionModules.get(reaction) || [];
        } else {
            return this.allModules.filter(module => module.configuration.type.includes(ModuleType.reaction)) as ReactionModule[];
        }
    }

    getQuoteModules(): QuoteModule[] {
        return this.quoteModules;
    }

    getWebhookModule(url: string): WebhookModule | undefined {
        for (const entry of this.webhookModules.entries()) {
            if (url.startsWith(entry[0])) return entry[1];
        }
        return undefined;
    }

    getWebhookModules(): WebhookModule[] {
        return this.allModules.filter(module => module.configuration.type.includes(ModuleType.webhook)) as WebhookModule[];
    }

    hasWebhookModule(): boolean {
        return this.webhookModules.size !== 0;
    }

    getAllModules(): Module[] {
        return this.allModules;
    }

    private async loadModule(file: string): Promise<void> {
        let module: Module;
        let added = false;
        try {
            module = (await import(file)).default as unknown as Module;
            file = file.substring(file.lastIndexOf("/") + 1);
        } catch (err) {
            file = file.substring(file.lastIndexOf("/") + 1);
            console.error(`CONFIG ERROR: Could not import module '${file}'`);
            console.error(err);
            return;
        }

        const validationResult = this.validateModule(module);
        if (!validationResult.valid) {
            console.error(`CONFIG ERROR: Skipping invalid module '${file}'`);
            for (const err of validationResult.errors) {
                console.error(err);
            }
            return;
        }

        if (module.configuration.type.includes(ModuleType.command)) {
            const cmdModule = module as CommandModule;
            for (const command in cmdModule.configuration.commands) {
                if (this.commandModules.has(command)) {
                    const overlapping = this.commandModules.get(command);
                    console.error(`CONFIG ERROR: 'Skipping command '${command}' already registered by module '${overlapping?.configuration.name}'`);
                    continue;
                }
                this.commandModules.set(command, cmdModule);
                added = true;
            }
            await Sequence(`Commands: ${Object.keys(cmdModule.configuration.commands).join()}`).resolve();
        }

        if (module.configuration.type.includes(ModuleType.persistence)) {
            const persistModule = module as PersistenceModule;
            if (this.persistenceModule !== undefined) {
                console.error(`CONFIG ERROR: 'Cannot register '${persistModule.configuration.name}' as persistence module, '${this.persistenceModule.configuration.name}' is already registered`);
            } else {
                this.persistenceModule = persistModule;
                added = true;
                await Sequence("Persistence").resolve();
            }
        }

        if (module.configuration.type.includes(ModuleType.webhook)) {
            const webhookModule = module as WebhookModule;
            for (const hook of webhookModule.configuration.webhook) {
                if (this.webhookModules.has(hook)) {
                    const overlapping = this.webhookModules.get(hook);
                    console.error(`CONFIG ERROR: 'Skipping webhook '${hook}' already registered by module '${overlapping?.configuration.name}'`);
                    continue;
                }
                this.webhookModules.set(hook, webhookModule);
                added = true;
            }
            await Sequence(`Webhooks: ${webhookModule.configuration.webhook.join()}`).resolve();
        }


        if (module.configuration.type.includes(ModuleType.reaction)) {
            const reactionModule = module as ReactionModule;
            for (const reaction of reactionModule.configuration.reactions) {
                let arr = this.reactionModules.get(reaction);
                if (arr === undefined) {
                    arr = [];
                    this.reactionModules.set(reaction, arr);
                }
                arr.push(reactionModule);
                added = true;
            }
            await Sequence(`Reactions: ${reactionModule.configuration.reactions.join()}`).resolve();
        }

        if (module.configuration.type.includes(ModuleType.quote)) {
            const quoteModule = module as QuoteModule;
            this.quoteModules.push(quoteModule);
            added = true;
        }

        if (added) {
            this.allModules.push(module);
        }
    }

    private validateModule(module: Module): ValidationResult {
        const result = {
            get valid(): boolean {
                return this.errors.length === 0;
            },
            errors: [] as string[]
        };

        if (module.configuration === undefined) {
            result.errors.push("Reason: Required property 'configuration' is missing");
        }

        if (module.configuration.type === undefined) {
            result.errors.push("Reason: Required property 'configuration.type' is missing");
        }

        for (const type of module.configuration.type) {
            if (type == ModuleType.command) {
                result.errors.push(...this.validateCommandModule(module as CommandModule));
            } else if (type == ModuleType.persistence) {
                result.errors.push(...this.validatePersistenceModule(module as PersistenceModule));
            } else if (type == ModuleType.webhook) {
                result.errors.push(...this.validateWebhookModule(module as WebhookModule));
            } else if (type == ModuleType.quote) {
                result.errors.push(...this.validateQuoteModule(module as QuoteModule));
            } else if (type == ModuleType.reaction) {
                result.errors.push(...this.validateReactionModule(module as ReactionModule));
            }

        }

        return result;
    }

    private validateCommandModule(module: CommandModule): string[] {
        const errors = [];
        if (module.configuration?.commands === undefined) {
            errors.push("Reason: Required property 'configuration.commands' is missing");
        }
        if (!Array.isArray(module.configuration?.commands)) {
            errors.push("Reason: Required property 'configuration.commands' is not of type array");
        }
        if (module.onCommand === undefined) {
            errors.push("Reason: Required method 'onCommand' is missing");
        }
        return errors;
    }

    private validatePersistenceModule(module: PersistenceModule): string[] {
        const errors = [];
        if (module.getGlobal === undefined) {
            errors.push("Reason: Required method 'getGlobal' is missing");
        }
        if (module.getGuild === undefined) {
            errors.push("Reason: Required method 'getGuild' is missing");
        }
        return errors;
    }

    private validateWebhookModule(module: WebhookModule): string[] {
        const errors = [];
        if (module.configuration?.webhook === undefined || module.configuration?.webhook.length === 0) {
            errors.push("Reason: Required property 'configuration.webhook' is missing or empty");
        }
        if (module.hook === undefined) {
            errors.push("Reason: Required method 'hook' is missing");
        }
        return errors;
    }

    private validateReactionModule(module: ReactionModule): string[] {
        const errors = [];
        if (module.configuration?.reactions === undefined || module.configuration?.reactions.length === 0) {
            errors.push("Reason: Required property 'configuration.reactions' is missing or empty");
        }
        if (module.onReaction === undefined) {
            errors.push("Reason: Required method 'onReaction' is missing");
        }
        return errors;
    }

    private validateQuoteModule(module: QuoteModule): string[] {
        const errors = [];
        if (module.onQuote === undefined) {
            errors.push("Reason: Required method 'onQuote' is missing");
        }
        return errors;
    }
}