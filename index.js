require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});
const app = express();
app.use(express.json());

const GUILD_ID = "1495231309788745798";
const CHANNEL_ID = "1495231313517613098"; // Your actual ID is locked in here
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

client.once('clientReady', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
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

    const members = await guild.members.fetch();
    let pings = [];

    // Filter for users who have the job role BUT NOT the alerts-off role
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

    // Send the Job Card first
    await channel.send({
        content: `🚨 **New Job: ${jobTitle}**\nApply here: ${jobLink}`,
        components: [row]
    });

    // Send the pings separately to bypass Discord length limits
    if (pings.length > 0) {
        // Chunk pings into safe groups of 80 users
        for (let i = 0; i < pings.length; i += 80) {
            const chunk = pings.slice(i, i + 80).join(" ");
            const pingMessage = await channel.send(`*Pinging available VAs:* ${chunk}`);
            
            // Pro-trick: Delete the ping message so it doesn't clutter the chat
            // Phones still receive the push notification even if deleted instantly
            setTimeout(() => pingMessage.delete().catch(() => {}), 3000);
        }
    }
}

// Start the web server and the Discord bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

client.login(process.env.BOT_TOKEN);