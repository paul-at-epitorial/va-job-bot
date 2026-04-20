require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});
const app = express();
app.use(express.json());

const GUILD_ID = "1495231309788745798";
const CHANNEL_ID = "1495231313517613098"; 
const ALERTS_OFF_ROLE = "1495319403556769856";

const roleIds = {
    "admin-va": "1495455661994283129",
    "ecom-va": "1495455854516899910",
    "creative-va": "1495455974905876531",
    "marketing-va": "1495456756716011660",
    "automations-va": "1495456880082948227",
    "tech-va": "1495457015529603142",
    "management-va": "1495457104096530464"
};

client.once('clientReady', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.members.fetch();
        console.log("Server member list cached successfully.");
    } catch (err) {
        console.error("Could not fetch members:", err);
    }
});

// The Interaction Listener (Handles all Button Clicks)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // --- 1. CLAIM JOB BUTTON (Clicked inside #job-alerts) ---
    if (interaction.customId.startsWith('claim_job_')) {
        await interaction.update({
            content: interaction.message.content + `\n\n*🔒 Claimed by <@${interaction.user.id}>*`,
            components: [] 
        });

        await interaction.message.react('✍️').catch(err => console.log("Failed to react:", err));

        // Mute the user by assigning the alerts-off role
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            await member.roles.add(ALERTS_OFF_ROLE);
        } catch (err) {
            console.log("Could not assign ALERTS_OFF_ROLE:", err);
        }

        // Auto-remove the mute role after 1 hour (3600000 ms)
        setTimeout(async () => {
            try {
                const guild = await client.guilds.fetch(GUILD_ID);
                const member = await guild.members.fetch(interaction.user.id);
                if (member.roles.cache.has(ALERTS_OFF_ROLE)) {
                    await member.roles.remove(ALERTS_OFF_ROLE);
                }
            } catch (err) {}
        }, 3600000);

        // Build the DM Buttons, embedding the channel & message ID directly into the button's data
        const appliedBtn = new ButtonBuilder()
            .setCustomId(`applied_${interaction.channelId}_${interaction.message.id}`)
            .setLabel('✅ Mark as Applied')
            .setStyle(ButtonStyle.Success);
            
        const alertsBtn = new ButtonBuilder()
            .setCustomId('alerts_on')
            .setLabel('🔔 Turn Alerts Back On')
            .setStyle(ButtonStyle.Primary);

        const dmRow = new ActionRowBuilder().addComponents(appliedBtn, alertsBtn);

        try {
            await interaction.user.send({
                content: "**You claimed a job!**\n\nI marked the original post with ✍️ and **paused your job alerts for 1 hour** so you can focus on drafting your pitch.\n\nWhen you are finished, click the buttons below to update the post and un-pause your alerts without leaving this chat.",
                components: [dmRow]
            });
        } catch (error) {
            await interaction.followUp({
                content: "You claimed the job! I added the ✍️ reaction and muted your alerts for 1 hour. I tried to DM you the shortcut buttons to mark it as Applied, but your DMs are closed. You will have to update the emojis manually in this channel.",
                ephemeral: true
            });
        }
    }

    // --- 2. MARK AS APPLIED BUTTON (Clicked inside the DM) ---
    else if (interaction.customId.startsWith('applied_')) {
        // Extract the target IDs from the button data
        const [, channelId, messageId] = interaction.customId.split('_');
        
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const channel = await guild.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            
            // Swap the drafting emoji for the applied emoji
            const draftingReaction = message.reactions.cache.get('✍️');
            if (draftingReaction) await draftingReaction.users.remove(client.user.id);
            await message.react('✅');

            // Disable the clicked button to prevent spamming
            const updatedRow = disableClickedButton(interaction);
            await interaction.update({ 
                content: interaction.message.content + "\n\n✅ *Status updated! The original post is now marked as Applied.*", 
                components: [updatedRow] 
            });
        } catch (err) {
            console.error("Could not update job post from DM:", err);
            await interaction.reply({ content: "Error: Could not find the original post. It may have been deleted.", ephemeral: true });
        }
    }

    // --- 3. TURN ALERTS ON BUTTON (Clicked inside the DM) ---
    else if (interaction.customId === 'alerts_on') {
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(interaction.user.id);
            
            await member.roles.remove(ALERTS_OFF_ROLE);

            const updatedRow = disableClickedButton(interaction);
            await interaction.update({ 
                content: interaction.message.content + "\n\n🔔 *Your job alerts are now active again.*", 
                components: [updatedRow] 
            });
        } catch (err) {
            console.error("Could not remove ALERTS_OFF_ROLE:", err);
            await interaction.reply({ content: "Error: Could not update your role.", ephemeral: true });
        }
    }
});

// Helper function to dynamically disable buttons in the DM
function disableClickedButton(interaction) {
    const updatedRow = new ActionRowBuilder();
    interaction.message.components[0].components.forEach(comp => {
        const btn = ButtonBuilder.from(comp);
        if (comp.customId === interaction.customId) btn.setDisabled(true);
        updatedRow.addComponents(btn);
    });
    return updatedRow;
}

// The Webhook Listener for your Puppeteer Scraper
app.post('/new-job', async (req, res) => {
    try {
        const { jobCategoryKey, jobTitle, jobLink } = req.body;
        if (!jobCategoryKey || !jobTitle || !jobLink) return res.status(400).send({ error: "Missing job data" });
        await postJobAlert(jobCategoryKey, jobTitle, jobLink);
        res.status(200).send({ success: true, message: "Job posted to Discord" });
    } catch (error) {
        console.error("Error posting job:", error);
        res.status(500).send({ error: "Internal bot error" });
    }
});

async function postJobAlert(jobCategoryKey, jobTitle, jobLink) {
    const targetRoleId = roleIds[jobCategoryKey];
    if (!targetRoleId) return console.log("Invalid category:", jobCategoryKey);

    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(CHANNEL_ID);
    const members = guild.members.cache;
    let pings = [];

    members.forEach(member => {
        if (member.roles.cache.has(targetRoleId) && !member.roles.cache.has(ALERTS_OFF_ROLE)) {
            pings.push(`<@${member.user.id}>`);
        }
    });

    const claimButton = new ButtonBuilder()
        .setCustomId(`claim_job_${Date.now()}`)
        .setLabel('Claim Job')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(claimButton);

    await channel.send({
        content: `🚨 **New Job: ${jobTitle}**\nApply here: ${jobLink}`,
        components: [row]
    });

    if (pings.length > 0) {
        for (let i = 0; i < pings.length; i += 80) {
            const chunk = pings.slice(i, i + 80).join(" ");
            const pingMessage = await channel.send(`*Pinging available VAs:* ${chunk}`);
            setTimeout(() => pingMessage.delete().catch(() => {}), 3000);
        }
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

client.login(process.env.BOT_TOKEN);