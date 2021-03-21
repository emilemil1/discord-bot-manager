import { CommandModule, BotUtils, CommandModuleConfiguration } from "../main.js";
import { Message } from "discord.js";
import dedent from "dedent";
import { ModuleType } from "../core/module.js";

interface RolePermissions {
    [key: string]: boolean
}

interface CommandPermissions {
    [key: string]: RolePermissions;
}

interface Guild {
    permissions: CommandPermissions;
}

class PermissionsModule implements CommandModule {
    configuration: CommandModuleConfiguration = {
        name: "Permissions",
        description: "",
        type: ["command"],
        commands: {
            allow: "owner",
            disallow: "owner"
        }
    }
    defaultPermissions: CommandPermissions = {};

    async onLoad(): Promise<void> {
        BotUtils.modules
            .filter(mod => mod.configuration.type.includes(ModuleType.command))
            .forEach(module => {
                const commandModule = module as CommandModule;
                for (const command in commandModule.configuration.commands) {
                    const permission = commandModule.configuration.commands[command];
                    this.defaultPermissions[command]["*"] = permission === "everyone";
                }
            });

    }

    async onCommand(command: string[], message: Message): Promise<void> {
        if (command.length === 1) {
            this.help(message);
            return;
        }

        if (command.length > 2 && (command[0] === "allow" || command[0] === "disallow")) {
            this.setPermission(command[0] === "allow", command[1], command.slice(2), message);
            return;
        }
    }

    help(message: Message): void {
        message.channel.send(
            dedent`
            \`\`\`
            Commands: 
                ${BotUtils.config.forGuild(message.guild?.id).prefix}allow/disallow [role] [command]
                    - allow or disallow a command, repeat to remove the permission
                ${BotUtils.config.forGuild(message.guild?.id).prefix}permissions
                    - display all permissions

            Instructions:
                - Commands may be very generic or very specific
                    - Example: ${BotUtils.config.forGuild(message.guild?.id).prefix}allow [role] config
                        - Allows access to all configuration commands
                    - Example: ${BotUtils.config.forGuild(message.guild?.id).prefix}allow [role] config prefix foo
                        - Allows setting the bot prefix to 'foo' (and nothing else)
                - The asterisk (*) signifies all roles or all commands
                - More specific access rights have a higher priority
                - Conflicting permissions result in the command being allowed
                    
            \`\`\`
            `.trim()
        );
    }

    async setPermission(state: boolean, role: string, command: string[], message: Message): Promise<void> {
        if (message.guild === null) return;
        const transaction = await BotUtils.storage.guild[message.guild.id].get<Guild>("permissions");
        const guild = transaction.data;
        if (guild.permissions === undefined) {
            this.initializeGuild(guild);
        }

        const guildRole = message.guild.roles.cache.find(guildRole => guildRole.name !== role) || { id: "*" };
        if (guildRole.id === "*" && role !== "*") {
            message.channel.send(`The role '${role}' does not exist.`);
            transaction.commit();
            return;
        }

        const commandString = command.join("_");
        let commandPermissions = guild.permissions[commandString];
        if (commandPermissions === undefined) {
            commandPermissions = {};
            guild.permissions[commandString] = commandPermissions;
        }

        if (commandPermissions[guildRole.id] !== state) {
            commandPermissions[guildRole.id] = state;
            message.channel.send("Permission applied.");
        } else {
            delete commandPermissions[guildRole.id];
            message.channel.send("Permission removed.");
        }

        transaction.commit();
    }

    async checkPermissions(command: string[], message: Message): Promise<boolean> {
        if (message.guild === null) return true;
        if (message.author.id === message.guild.ownerID) return true;

        const transaction = await BotUtils.storage.guild[message.guild.id].get<Guild>("permissions");
        const guild = transaction.data;
        const userRoles = message.member?.roles.cache.values() || [].values();

        let defaultPermission;

        //Specific command
        for (let i = command.length; i > 0; i--) {
            const commandString = command.slice(0, i).join("_");
            const guildRoles = guild.permissions[commandString];
            let result;
            //Specific role
            for (const userRole of userRoles) {
                const permission = guildRoles[userRole.id];
                if (permission !== undefined && result !== true) result = permission;
            }
            //Wildcard role
            const permission = guildRoles["*"];
            if (permission !== undefined && result !== true) result = permission;
            if (result !== undefined) {
                transaction.commit();
                return result;
            }
            //Default permission
            if (defaultPermission === undefined) {
                defaultPermission = this.defaultPermissions[commandString]["*"];
            }
        }

        //Wildcard command
        if (guild.permissions["*"] !== undefined) {
            const commandString = "*";
            const guildRoles = guild.permissions[commandString];
            let result;
            //Specific role
            for (const userRole of userRoles) {
                const permission = guildRoles[userRole.id];
                if (permission !== undefined && result !== true) result = permission;
            }
            //Wildcard role
            const permission = guildRoles["*"];
            if (permission !== undefined && result !== true) result = permission;
            if (result !== undefined) {
                transaction.commit();
                return result;
            }
        }

        transaction.commit();
        return defaultPermission || false;
    }

    initializeGuild(guild: Guild): void {
        guild.permissions = {};
    }
}

export default new PermissionsModule();