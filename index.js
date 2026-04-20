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

// The Button Click Listener
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('claim_job_')) {
        // 1. Delete the button and append the locked tag
        await interaction.update({
            content: interaction.message.content + `\n\n*🔒 Claimed by <@${interaction.user.id}>*`,
            components: [] 
        });

        // 2. Automatically apply the 'Drafting' emoji to the post
        await interaction.message.react('✍️').catch(err => console.log("Failed to react to message:", err));

        // 3. Send the updated DM rules
        try {
            await interaction.user.send(
                "**You claimed a job!**\n\n" +
                "I have automatically marked the post with ✍️ to show everyone you are currently drafting a pitch.\n\n" +
                "**As a reminder, here is the server rule for updating your status:**\n" +
                "✅ = Applied\n" +
                "❌ = Bad lead (scam/lowball/bad link)\n\n" +
                "Please go back to `#job-alerts` and update your emoji status as soon as you finish. Good luck!"
            );
        } catch (error) {
            console.log(`Could not send DM to ${interaction.user.tag} -- DMs are closed.`);
            
            // 4. Fallback warning
            await interaction.followUp({
                content: "You claimed the job! I automatically added the ✍️ reaction for you. I tried to DM you the rules, but your privacy settings blocked it. Remember to update the post with ✅ (Applied) or ❌ (Bad lead) when you finish!",
                ephemeral: true
            });
        }
    }
});

// The Webhook Listener for your Puppeteer Scraper
app.post('/new-job', async (req, res) => {
    try {
        const { jobCategoryKey, jobTitle, jobLink } = req.body;
        
        if (!jobCategoryKey || !jobTitle || !jobLink) {
            return res.status(400).send({ error: "Missing job data" });
        }

        await postJobAlert(jobCategoryKey, jobTitle, jobLink);
        res.status(200).send({ success: true, message: "Job posted to Discord" });
        
    } catch (error) {
        console.error("Error posting job:", error);
        res.status(500).send({ error: "Internal bot error" });
    }
});

async function postJobAlert(jobCategoryKey, jobTitle, jobLink) {
    const targetRoleId = roleIds[jobCategoryKey];
    if (!targetRoleId) return console.log("Invalid job category:", jobCategoryKey);

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