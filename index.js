require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

const GOOGLE_SHEET_WEB_APP = "https://script.google.com/macros/s/AKfycbz4XegBGQS31wmMsG8Ux-jPnfdSHHiZCAH250d_E0ZOKwjBk5BiQn1x-RoE4Dk8RHvI/exec";

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

// GLOBAL FLAG FOR COLD START
let isBotFullyReady = false;

async function checkExpiredMutes() {
    try {
        const res = await fetch(GOOGLE_SHEET_WEB_APP, {
            method: 'POST',
            body: JSON.stringify({ action: 'get_expired_mutes', currentTime: Date.now() }),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        
        if (data.status === 'success' && data.expiredUsers.length > 0) {
            const guild = await client.guilds.fetch(GUILD_ID);
            for (let userId of data.expiredUsers) {
                try {
                    const member = await guild.members.fetch(userId);
                    if (member.roles.cache.has(ALERTS_OFF_ROLE)) {
                        await member.roles.remove(ALERTS_OFF_ROLE);
                        console.log(`Automatically unmuted user: ${member.user.tag}`);
                    }
                } catch (e) {
                    console.log(`Could not unmute user ${userId}. They may have left the server.`);
                }
            }
        }
    } catch (err) {
        console.error("Failed to check expired mutes:", err);
    }
}

client.once('clientReady', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.members.fetch();
        console.log("Server member list cached successfully.");
        
        await checkExpiredMutes();
        setInterval(checkExpiredMutes, 5 * 60 * 1000);
    } catch (err) {
        console.error("Could not fetch members:", err);
    } finally {
        isBotFullyReady = true; 
        console.log("Bot is fully awake and ready for interactions.");
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('apply_job_')) {
        const originalContent = interaction.message.content;
        
        // Extract the URL and strip the text line entirely
        const urlMatch = originalContent.match(/Job Link:\s*<([^>]+)>/);
        const extractedUrl = urlMatch ? urlMatch[1] : null;
        
        let newContent = originalContent.replace(/\n*Job Link:\s*<[^>]+>/, '').trim();
        newContent += `\n\n*🔒 Applying: <@${interaction.user.id}>*`;

        // Update the buttons on the main post
        const disabledApplyBtn = new ButtonBuilder()
            .setCustomId(interaction.customId)
            .setLabel('Apply Now')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);

        const componentsArray = [disabledApplyBtn];

        if (extractedUrl) {
            const readMoreBtn = new ButtonBuilder()
                .setLabel('Read More ↗')
                .setStyle(ButtonStyle.Link)
                .setURL(extractedUrl);
            componentsArray.push(readMoreBtn);
        }

        const updatedRow = new ActionRowBuilder().addComponents(componentsArray);

        await interaction.update({
            content: newContent,
            components: [updatedRow] 
        });

        await interaction.message.react('✍️').catch(err => console.log("Failed to react:", err));

        let wasAlreadyMuted = false;
        let dmContent = "";

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            wasAlreadyMuted = member.roles.cache.has(ALERTS_OFF_ROLE);

            if (!wasAlreadyMuted) {
                await member.roles.add(ALERTS_OFF_ROLE);
                await fetch(GOOGLE_SHEET_WEB_APP, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'add_mute',
                        userId: interaction.user.id,
                        unmuteTime: Date.now() + 3600000 
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });
                
                dmContent = "**You are applying for this job!**\n\nI marked the original post with ✍️ and **paused your job alerts for 1 hour** so you can focus on drafting your pitch.\n\nWhen you are finished, click the buttons below to update the post and un-pause your alerts without leaving this chat.";
            } else {
                dmContent = "**You are applying for this job!**\n\nI marked the original post with ✍️ so you can focus on drafting your pitch.\n\n*(Note: Your alerts are already muted, so I didn't change your settings or restart any timers!)*\n\nWhen you are finished, click the buttons below to update the post.";
            }
        } catch (err) {
            console.log("Could not assign ALERTS_OFF_ROLE or save timer:", err);
            dmContent = "**You are applying for this job!**\n\nI marked the original post with ✍️.\n\nWhen you are finished, click the buttons below to update the post.";
        }

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
                content: dmContent,
                components: [dmRow]
            });
        } catch (error) {
            let fallbackMsg = !wasAlreadyMuted 
                ? "You are applying for the job! I added the ✍️ reaction and muted your alerts for 1 hour. I tried to DM you the shortcut buttons to mark it as Applied, but your DMs are closed."
                : "You are applying for the job! I added the ✍️ reaction. Your alerts are already muted, so I left your settings alone. I tried to DM you the shortcut buttons, but your DMs are closed.";
                
            await interaction.followUp({
                content: fallbackMsg,
                ephemeral: true
            });
        }
    }

    else if (interaction.customId.startsWith('applied_')) {
        const [, channelId, messageId] = interaction.customId.split('_');
        
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const channel = await guild.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            
            const draftingReaction = message.reactions.cache.get('✍️');
            if (draftingReaction) await draftingReaction.users.remove(client.user.id);
            await message.react('✅');

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

    else if (interaction.customId === 'alerts_on') {
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(interaction.user.id);
            await member.roles.remove(ALERTS_OFF_ROLE);

            await fetch(GOOGLE_SHEET_WEB_APP, {
                method: 'POST',
                body: JSON.stringify({ action: 'remove_mute', userId: interaction.user.id }),
                headers: { 'Content-Type': 'application/json' }
            });

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

function disableClickedButton(interaction) {
    const updatedRow = new ActionRowBuilder();
    interaction.message.components[0].components.forEach(comp => {
        const btn = ButtonBuilder.from(comp);
        if (comp.customId === interaction.customId) btn.setDisabled(true);
        updatedRow.addComponents(btn);
    });
    return updatedRow;
}

app.post('/new-job', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== "SECRET_KEY_12345") {
        return res.status(403).send({ error: "Unauthorized access" });
    }

    let retries = 0;
    while (!isBotFullyReady && retries < 15) {
        await new Promise(r => setTimeout(r, 1000));
        retries++;
    }

    try {
        const { jobCategoryKey, jobTitle, jobLink } = req.body;
        if (!jobCategoryKey || !jobTitle || !jobLink) return res.status(400).send({ error: "Missing job data" });
        
        await checkExpiredMutes();
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

    const applyButton = new ButtonBuilder()
        .setCustomId(`apply_job_${Date.now()}`)
        .setLabel('Apply Now')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(applyButton);

    await channel.send({
        content: `🚨 ${jobTitle}\nJob Link: ${jobLink}`,
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