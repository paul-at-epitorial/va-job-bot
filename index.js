require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const GUILD_ID = "1495231309788745798";
const CHANNEL_ID = "1495231313517613098"; // Replace this with your actual #job-alerts channel ID
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

// We will connect this function to your scraper logic later
async function postJobAlert(jobCategoryKey, jobTitle, jobLink) {
    const targetRoleId = roleIds[jobCategoryKey];
    if (!targetRoleId) return console.log("Invalid job category.");

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

    const pingString = pings.length > 0 ? pings.join(" ") : "*No active users to ping.*";

    const claimButton = new ButtonBuilder()
        .setCustomId(`claim_job_${Date.now()}`)
        .setLabel('Claim Job')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(claimButton);

    await channel.send({
        content: `🚨 **New Job: ${jobTitle}**\nApply here: ${jobLink}\n\n${pingString}`,
        components: [row]
    });
}

client.login(process.env.BOT_TOKEN);