import { CommandModule, BotUtils, CommandModuleConfiguration } from "../main.js";
import { Message } from "discord.js";
import dedent from "dedent";

class Config implements CommandModule {
    configuration: CommandModuleConfiguration = {
        name: "Configuration",
        description: "",
        type: ["command"],
        commands: {
            config: "owner"
        }
    }

    async onCommand(command: string[], message: Message): Promise<void> {
        if (command.length === 1) {
            this.help(message);
            return;
        }

        if (command.length > 2 && command[1] === "prefix") {
            this.setPrefix(command.slice(2).join(" "), message);
            return;
        }
    }


    help(message: Message): void {
        message.channel.send(
            dedent`
            \`\`\`
            Commands:
                ${BotUtils.config.forGuild(message.guild?.id).prefix}config prefix "[prefix]"
                    - set prefix used to access the bot
            \`\`\`
            `.trim()
        );
    }

    setPrefix(prefix: string, message: Message): void {
        if (!prefix.startsWith("\"") || !prefix.endsWith("\"")) return;
        prefix = prefix.substring(1, prefix.length - 1);
        BotUtils.config.forGuild(message.guild?.id).prefix = prefix;
        message.channel.send(`"${prefix}[command]" can now be used to access the bot.\n"${BotUtils.config.global.defaultPrefix}[command]" will still work as a fallback.`);
    }
}

export default new Config();