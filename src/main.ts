
import * as fs from "fs";
import { Bot, BotConfigInterface } from "./core/bot.js";
import rl, { ReadLine } from "readline";
import Sequence from "./util/sequence.js";

let shutdown = false;

function abort(msg: unknown): never {
    console.error();
    console.error(msg);
    process.exit();
}

class BotConfig implements BotConfigInterface {
    public readonly modules: BotConfigInterface["modules"];
    public readonly values: BotConfigInterface["values"];
    public readonly prefix: BotConfigInterface["prefix"];

    constructor(config: BotConfigInterface) {
        this.values = this.getValues(config.values);
        this.modules = this.getModules(config.modules);
        this.prefix = this.getPrefix(config.prefix);
    }

    getValues(values: BotConfigInterface["values"]): BotConfigInterface["values"] {
        if (values === undefined) {
            return {};
        }

        for (const val in values) {
            const remapped = new Map();
            const matchResult = /\$\{.*\}/g.exec(values[val]);
            if (matchResult === null) continue;
            for (const match of matchResult) {
                const env = process.env[match.substring(2, match.length - 1)];
                if (env === undefined) {
                    abort(`CONFIG ERROR: Failed to parse value '${val}: ${values[val]}'. '${match.substring(2, match.length - 1)} is not an environment variable.'`);
                }
                remapped.set(match, env);
            }
            for (const remap of remapped.entries()) {
                values[val] = values[val].replace(remap[0], remap[1]);
            }
        }

        if (values.loginToken === undefined) {
            abort("CONFIG ERROR: Required configuration 'values.loginToken' has not been set.");
        }

        if (values.webhookPort === undefined) {
            values.webhookPort = "3030";
        }

        if (values.url === undefined) {
            values.url = "localhost";
        }

        return values;
    }

    getModules(modules: BotConfigInterface["modules"]): BotConfigInterface["modules"] {
        if (modules === undefined || !(modules instanceof Array)) {
            return [];
        }

        return modules;
    }

    getPrefix(prefix: BotConfigInterface["prefix"]): BotConfigInterface["prefix"] {
        if (prefix === undefined) {
            prefix = ".";
        }

        return prefix;
    }
}

export default class BotManager {
    private botConfig!: BotConfigInterface;
    private bot!: Bot;
    private readline?: ReadLine;
    private setup: Promise<void>;

    constructor(config?: BotConfigInterface) {
        console.log();
        console.log("=== Discord Bot Manager ===");

        this.setup = Sequence("Initializing", () => {
            return Sequence("Reading configuration", () => {
                if (config !== undefined) {
                    this.botConfig = config;
                } else if (fs.existsSync("dbmconfig.json")) {
                    const json = JSON.parse(fs.readFileSync("dbmconfig.json").toString()) as BotConfigInterface;
                    this.botConfig = new BotConfig(json);
                } else {
                    abort("CONFIG ERROR: No configuration object provided and 'dbmconfig.json' was not found in the working directory.");
                }
                this.bot = new Bot(this.botConfig);
            }).step("Loading modules", async () => {
                await this.loadModules();
            });
        }).resolve();
    }

    async start(): Promise<void> {
        await this.setup;

        await Sequence("Starting", () => this.bot.login()).resolve();


        const shut = async (): Promise<void> => {
            if (shutdown === false) {
                shutdown = true;
                await this.shutdown();
                setTimeout(() => {
                    process.exit();
                }, 30000).unref();
            }

        };
        process.on("SIGTERM", shut);
        process.on("SIGINT", shut);

        await Sequence("Ready!").resolve();
        this.awaitCommands();
    }

    async consoleCommand(command: string): Promise<void> {
        switch (command) {
            case "":
                break;
            case "exit":
                await this.shutdown();
                break;
            default:
                console.log("Unknown command: " + command);
        }

        process.stdout.write("DBM > ");
    }

    async shutdown(): Promise<void> {
        return await Sequence("Exiting")
            .step("Terminating bot", async () => {
                const result = await this.bot.shutdown();
                this.readline?.close();
                return result;
            })
            .resolve()
            .then(() => {
                process.exit();
            });
    }

    private awaitCommands(): void {
        try {
            if (process.stdin.isTTY !== true) {
                return;
            }

            if (this.readline === undefined) {
                this.readline = rl.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
            }

            process.stdout.write("DBM > ");
            this.readline.on("line", command => {
                this.consoleCommand(command);
            });
        } catch (e) {
            console.error(e);
        }
    }

    private async loadModules(): Promise<void> {
        if (this.botConfig.modules === undefined) return;
        for (const moduleDir of this.botConfig.modules) {
            await this.bot.init(fs.readdirSync(moduleDir)
                .map(file => "file:///" + process.cwd() + "/" + moduleDir + "/" + file)
                .map(file => file.replace(/\\/g, "/").replace("/./", "/")));
        }
    }
}

export * from "./core/module.js";
export * from "./core/botutils.js";