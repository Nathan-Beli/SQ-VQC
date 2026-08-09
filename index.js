const http = require('http');
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    UserSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType
} = require('discord.js');

// --- 0. SERVEUR HTTP POUR LE HEALTH CHECK ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot Discord SQ en ligne !');
}).listen(PORT, () => {
    console.log(`Serveur HTTP en écoute sur le port ${PORT}`);
});

// --- 1. CONFIGURATION CLIENT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers
    ]
});

// --- 2. LISTE DES IDS DE RÔLES ---
const ROLES = {
    SQ: "1534277079322071060",
    DG: "1534559869959409785",
    DA: "1534559820139598035",
    INSPECTEUR_CHEF: "1534559797549076520",
    INSPECTEUR: "1534559776443207901",
    CAPITAINE: "1534559750027612291",
    LIEUTENANT: "1534559733300854794",
    SERGENT: "1534559707438649494",
    CHEF_EQUIPE: "1534559291057377290",
    AGENT: "1534559270870450319",
    CADET: "1534559249168859137",
    SUPERVISEUR: "1535988500824989757",
    
    // Subdivisions & Chefs de Subdivisions
    CHEF_GTI: "1535988386165162034",
    GTI: "1535988386165162034",
    CHEF_ENQUETEUR: "1535998948605567026",
    ENQUETEUR: "1535988422252961802",
    CHEF_DCM: "1535998994474340382",
    DCM: "1535988465274064958"
};

// Rôles de promotions attribuables selon qui exécute
const PROMOTION_MAP = [
    { executor: ROLES.SERGENT, targetRole: ROLES.AGENT, name: "Agent" },
    { executor: ROLES.LIEUTENANT, targetRole: ROLES.CHEF_EQUIPE, name: "Chef d'équipe" },
    { executor: ROLES.CAPITAINE, targetRole: ROLES.SERGENT, name: "Sergent" },
    { executor: ROLES.INSPECTEUR, targetRole: ROLES.LIEUTENANT, name: "Lieutenant" },
    { executor: ROLES.INSPECTEUR_CHEF, targetRole: ROLES.CAPITAINE, name: "Capitaine" },
    { executor: ROLES.DA, targetRole: ROLES.INSPECTEUR, name: "Inspecteur" }
];

// Subdivisions
const SUBDIVISIONS_MAP = [
    { executor: ROLES.CHEF_GTI, role: ROLES.GTI, name: "GTI" },
    { executor: ROLES.CHEF_ENQUETEUR, role: ROLES.ENQUETEUR, name: "Enquêteur" },
    { executor: ROLES.CHEF_DCM, role: ROLES.DCM, name: "DCM" }
];

// Chefs de subdivisions (gérés par DA / DG)
const CHEFS_SUBDIVISIONS = [
    { role: ROLES.CHEF_GTI, name: "Chef GTI" },
    { role: ROLES.CHEF_ENQUETEUR, name: "Chef Enquêteur" },
    { role: ROLES.CHEF_DCM, name: "Chef DCM" }
];

const CAPITAINE_PLUS = [ROLES.CAPITAINE, ROLES.INSPECTEUR, ROLES.INSPECTEUR_CHEF, ROLES.DA, ROLES.DG];
const ALL_EXECUTORS = [...new Set([...PROMOTION_MAP.map(p => p.executor), ...SUBDIVISIONS_MAP.map(s => s.executor), ROLES.DG])];

// --- 3. INITIALISATION ---
client.on('clientReady', async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    const command = new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Gérer les promotions, subdivisions et mises à pied.')
        .addUserOption(opt => opt.setName('membre').setDescription('Le membre à gérer').setRequired(true));

    try {
        await client.application.commands.set([command]);
    } catch (err) {
        console.error("Erreur enregistrement commande :", err);
    }
});

// --- 4. GESTION DU COMMAND /PROMOTION ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'promotion') {
        const executor = interaction.member;
        const target = interaction.options.getMember('membre');

        if (!target) {
            return interaction.reply({ content: "⚠️ Membre introuvable sur le serveur.", ephemeral: true });
        }

        // Vérification permission de base
        const hasPermission = ALL_EXECUTORS.some(roleId => executor.roles.cache.has(roleId));
        if (!hasPermission) {
            return interaction.reply({ 
                content: "Vous n'avez pas la permission de faite cette commande", 
                ephemeral: true 
            });
        }

        // Vérification rôle Sûreté du Québec
        if (!target.roles.cache.has(ROLES.SQ)) {
            return interaction.reply({ 
                content: "❌ Cette personne doit posséder le rôle **Sûreté du Québec**.", 
                ephemeral: true 
            });
        }

        // Construction des options de rôles que l'exécuteur A LE DROIT d'ajouter ou enlever
        const availableRoles = [];

        // 1. Grades hiérarchiques autorisés
        for (const p of PROMOTION_MAP) {
            if (executor.roles.cache.has(p.executor) || executor.roles.cache.has(ROLES.DG)) {
                availableRoles.push({ label: `Grade: ${p.name}`, value: p.targetRole });
            }
        }

        // 2. Subdivisions autorisées
        for (const s of SUBDIVISIONS_MAP) {
            if (executor.roles.cache.has(s.executor) || executor.roles.cache.has(ROLES.DA) || executor.roles.cache.has(ROLES.DG)) {
                availableRoles.push({ label: `Subdivision: ${s.name}`, value: s.role });
            }
        }

        // 3. Chefs de Subdivisions (DA & DG)
        if (executor.roles.cache.has(ROLES.DA) || executor.roles.cache.has(ROLES.DG)) {
            for (const cs of CHEFS_SUBDIVISIONS) {
                availableRoles.push({ label: `Poste: ${cs.name}`, value: cs.role });
            }
        }

        // 4. Superviseur (DG uniquement)
        if (executor.roles.cache.has(ROLES.DG)) {
            availableRoles.push({ label: `Poste: Superviseur`, value: ROLES.SUPERVISEUR });
        }

        // Dédoublonner les options
        const uniqueRoles = availableRoles.filter((v, i, a) => a.findIndex(t => t.value === v.value) === i);

        if (uniqueRoles.length === 0) {
            return interaction.reply({ content: "⚠️ Vous n'avez aucun rôle à gérer pour ce membre.", ephemeral: true });
        }

        // Création des composants de l'interface (Menu + Bouton Mise à pied si Capitaine+)
        const components = [];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_role_${target.id}`)
            .setPlaceholder('Choisissez le rôle à ajouter ou enlever')
            .addOptions(uniqueRoles.map(r => ({
                label: r.label,
                description: target.roles.cache.has(r.value) ? '▶ Actuellement POSSÉDÉ (Cliquer pour ENLEVER)' : '▶ Actuellement NON POSSÉDÉ (Cliquer pour AJOUTER)',
                value: r.value
            })));

        components.push(new ActionRowBuilder().addComponents(selectMenu));

        // Bouton mise à pied
        const isCapitainePlus = CAPITAINE_PLUS.some(roleId => executor.roles.cache.has(roleId));
        if (isCapitainePlus) {
            const btn = new ButtonBuilder()
                .setCustomId(`btn_map_${target.id}`)
                .setLabel('Mise à pied')
                .setStyle(ButtonStyle.Danger);
            components.push(new ActionRowBuilder().addComponents(btn));
        }

        // Tout le message est ÉPHÉMÈRE (privé)
        await interaction.reply({
            content: `⚙️ **Gestion des rôles pour ${target} :**\nChoisissez une action dans le menu ci-dessous.`,
            components: components,
            ephemeral: true
        });
    }

    // --- 5. ACTION MENU DÉROULANT : AJOUTER / ENLEVER LE RÔLE SELECTIONNÉ ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_role_')) {
        const targetId = interaction.customId.split('_')[2];
        const selectedRoleId = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId);

        if (!targetMember) {
            return interaction.reply({ content: "⚠️ Membre introuvable.", ephemeral: true });
        }

        if (targetMember.roles.cache.has(selectedRoleId)) {
            // Retirer le rôle
            await targetMember.roles.remove(selectedRoleId);
            await interaction.reply({
                content: `✅ Le rôle <@&${selectedRoleId}> a été **retiré** à ${targetMember}.`,
                ephemeral: true
            });
        } else {
            // Ajouter le rôle
            await targetMember.roles.add(selectedRoleId);
            await interaction.reply({
                content: `✅ Le rôle <@&${selectedRoleId}> a été **ajouté** à ${targetMember}.`,
                ephemeral: true
            });
        }
    }

    // --- 6. ACTION BOUTON MISE À PIED ---
    if (interaction.isButton() && interaction.customId.startsWith('btn_map_')) {
        const targetId = interaction.customId.split('_')[2];
        
        const userSelectRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`confirm_map_${targetId}`)
                .setPlaceholder('Sélectionnez la personne à mettre à pied')
        );

        await interaction.reply({
            content: "🚨 **Sélectionnez la personne à qui retirer TOUS les rôles :**",
            components: [userSelectRow],
            ephemeral: true
        });
    }

    // --- 7. ACTION CONFIRMATION MISE À PIED ---
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('confirm_map_')) {
        const selectedUserId = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(selectedUserId);

        if (!targetMember) {
            return interaction.reply({ content: "⚠️ Membre introuvable.", ephemeral: true });
        }

        try {
            const rolesToRemove = targetMember.roles.cache.filter(role => role.id !== interaction.guild.id);
            await targetMember.roles.remove(rolesToRemove);

            await interaction.reply({
                content: `💥 **Mise à pied effectuée** : Tous les rôles ont été retirés à ${targetMember}.`,
                ephemeral: true
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "❌ Impossible de retirer les rôles (Vérifiez la hauteur du rôle du Bot sur Discord).",
                ephemeral: true
            });
        }
    }
});

// --- 8. CONNEXION ---
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
if (!token) {
    console.error("❌ ERREUR: Aucun token trouvé dans DISCORD_TOKEN ou BOT_TOKEN.");
    process.exit(1);
}

client.login(token);
