import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, ComponentType } from 'discord.js';
import { serverSelectMenu } from '../interactions/serverSelect.js';
import { getServerUsage } from '../../pteroComponents/serverUsage.js'
import { sendPowerCommand } from '../../pteroComponents/serverCommands.js';
import "dotenv/config";

// Creates command in list
export const data = new SlashCommandBuilder()
    .setName('control')
    .setDescription('Control Game Server');


// Command action when executed
export async function execute(interaction) {

    // Gets serverSelectMenu dropdown
    const selectMenu = await serverSelectMenu(interaction);
    
    // Replys to command with the dropdown menu
    const serverSelect = await interaction.reply({
        content: '',
        components: [selectMenu],
        embeds: [{title: "Which server would you like to manage?"}],
        withResponse: true,
    });

    // Waits for response or timeout after 120s
	try { const selectResponse = await serverSelect.resource.message.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 120_000 });
    
    // Passes the rest of the command off to the quickControl action menu
    let selectedServer = selectResponse.values[0];
    serverActionMenu(selectResponse, selectedServer);

    // Catch error or timeout
    } catch { await interaction.editReply({ content: '', components: [], embeds: [{title: "Interaction timed out."}] })}
    
}

// Main action menu
async function serverActionMenu(interaction, selectedServer, manualState){

    // Creates reply content from functions
    let serverData = await getServerUsage(selectedServer);

    // Server state overwrite to counter the slow response of the api
    let stateOverwrite = false
    if (!manualState) {}
    else if (serverData.uptime.uptime != manualState.time) {}
    else if (manualState.state == 'stop' && serverData.status != 'offline') {
        serverData.status = 'stopping'
        stateOverwrite = true
    } 
    else if (manualState.state == 'kill' && serverData.status != 'offline') {
        serverData.status = 'offline'
        serverData.uptime.days = 0
        serverData.uptime.hours = 0
        serverData.uptime.minutes = 0
        serverData.uptime.seconds = 0
        stateOverwrite = true
    }
    else if (manualState.state == 'start' && serverData.status == 'offline') {
        serverData.status = 'starting'
        stateOverwrite = true
    } else if (manualState.state == 'restart') {
        serverData.status = 'starting'
        stateOverwrite = true
    }

    // Gets interaction components
    const actionRow = powerActionRow(serverData)
    const usageEmbed = serverUsageEmbed(serverData)

    // Replaces message with updated server action
    const serverAction = await interaction.update({
        content: ``,
        embeds: [usageEmbed],
        components: [actionRow],
        withResponse: true,
    })

    // Waits for action or timeout after 600s (10m)
    try { const actionResponse = await serverAction.resource.message.awaitMessageComponent({ time: 600_000 });
    
    // If 'menu' button > change to select menu
    if (actionResponse.customId == 'menu') { controlSelectMenu(actionResponse) } 

    // If server action button
    else if (actionResponse.customId != 'reload') {
        // Run server action
        await sendPowerCommand(selectedServer, actionResponse.customId)
        
        // Set manual server state
        let commandState = {
            state: `${actionResponse.customId}`,
            time: serverData.uptime.uptime
        }

        // Refresh action menu
        serverActionMenu(actionResponse, selectedServer, commandState); 
    }
    
    // If other button (applies to 'reload' button) only refresh menu
    else { 
        if (stateOverwrite) {serverActionMenu(actionResponse, selectedServer, manualState)} else {serverActionMenu(actionResponse, selectedServer)}
    };

    // Catch error or timeout
    } catch { await interaction.editReply({ content: '', components: [], embeds: [{title: "Interaction timed out."}] }); }

}

// Return to server select function
async function controlSelectMenu(interaction) {

    // Retrieves select menu item
    const selectMenu = await serverSelectMenu(interaction)

    // Updates the interaction with the menu
    const serverSelect = await interaction.update({
        content: '',
        components: [selectMenu],
        embeds: [{title: "Which server you would like to manage?"}],
        withResponse: true,
    });

    // Wait for response and performs action
    try { const selectResponse = await serverSelect.resource.message.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 120_000 });
        
    // Passes the rest of the command back off to the control action menu
    let selectedServer = selectResponse.values[0];
    serverActionMenu(selectResponse, selectedServer);

    // Catch error or timeout
    } catch { await interaction.editReply({ content: '', components: [], embeds: [{title: "Interaction timed out."}] }); }
}

// Generates the JSON for the server usage embed
function serverUsageEmbed(serverData) {
    let color = 0xB3B3B3;
    switch(serverData.status) { 
        case 'running': 
            color = 0x1DB522; 
            break; 
        case 'offline': 
            color = 0xB3B3B3; 
            break;
        case 'stopping':
            color = 0xE03A3A; 
            break;
        case 'starting':
            color = 0x3A45E0; 
            break;
        default:
            break;
    }

    let uptime = ''
    uptime += serverData.uptime.days > 0 ? `${serverData.uptime.days}d ` : ``
    uptime += serverData.uptime.hours > 0 ? `${serverData.uptime.hours}h ` : ``
    uptime += serverData.uptime.minutes > 0 ? `${serverData.uptime.minutes}m ` : ``
    uptime += serverData.uptime.seconds > 0 ? `${serverData.uptime.seconds}s` : ``
    if (uptime.length == 0) {
        uptime = 'Offline'
    }

    const usageEmbed = {
        color: color,
        title: `${((serverData.name).length > 27) ? `${(serverData.name).slice(0,26)}...` : `${serverData.name}`}`,
        description: `--------------------------------------`,
        url: `${process.env.pteroURL}/server/${serverData.serverID}`,
        fields: [
            {
                name: `State`,
                value: `${serverData.status.replace(/^./, char => char.toUpperCase())}`,
                inline: true,
            },
            {
                name: `Uptime`,
                value: `${uptime}`,
                inline: true,
            },
            {
                name: `CPU - ${serverData.cpu.percent}%`,
                value: `\`\`\`${hardwareUsageBar((serverData.cpu.percent + 2))}\`\`\``,
                inline: false,
            },
            {
                name: `RAM - ${serverData.memory.used}MB/${(serverData.memory.limit < 1 ? 'Unlimited' : `${serverData.memory.limit}MB`)}`,
                value: `\`\`\`${hardwareUsageBar(serverData.memory.percent)}\`\`\``,
                inline: false,
            }
        ],
    }

    return usageEmbed
}

// Makes the hardware usage bar for use in the embed
function hardwareUsageBar(percent) {
    let fill = Math.round((percent / 100) * 22) > 22 ? 22 : Math.round((percent / 100) * 22)
    let bar = '['
    for (let i = 0; i < fill; i++) {
        bar += '■'
    }
    for (let i = 22; i > fill; i--) {
        bar +=' '
    }
    bar += ']'

    return bar
}

// Constructs the power button row depeding on server state
function powerActionRow(serverData) {
    const start = new ButtonBuilder()
    if (serverData.status == 'offline' || serverData.locked == true) {
        start.setCustomId('start')
        start.setLabel('Start')
        start.setStyle(ButtonStyle.Success)
        start.setDisabled(serverData.locked)
    } else {
        start.setCustomId('restart')
        start.setLabel('Restart')
        start.setStyle(ButtonStyle.Success)
    }

    const stop = new ButtonBuilder()
    if (serverData.status != 'stopping') {
        stop.setCustomId('stop')
        stop.setLabel('Stop')
        stop.setStyle(ButtonStyle.Danger)
        stop.setDisabled(serverData.locked)
    } else {
        stop.setCustomId('kill')
        stop.setLabel('Kill')
        stop.setStyle(ButtonStyle.Danger)
    }

    const reload = new ButtonBuilder()
        .setCustomId('reload')
        .setLabel('Reload')
        .setStyle(ButtonStyle.Primary)

    const menu = new ButtonBuilder()
        .setCustomId('menu')
        .setLabel('Menu')
        .setStyle(ButtonStyle.Secondary)

    // Creates action row
    const actionRow = new ActionRowBuilder()
        .addComponents(start, stop, reload, menu)

    return actionRow
}