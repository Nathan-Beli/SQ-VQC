const http = require('http');
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    UserSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType
} = require('discord.js');

// --- 0. SERVEUR HTTP POUR LE HEALTH CHECK DE L'HÉBERGEUR ---
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

// Matrice des promotions standards
const PROMOTION_RULES = [
    { executor: ROLES.SERGENT, from: ROLES.CADET, to: ROLES.AGENT },
    { executor: ROLES.LIEUTENANT, from: ROLES.AGENT, to: ROLES.CHEF_EQUIPE },
    { executor: ROLES.CAPITAINE, from: ROLES.CHEF_EQUIPE, to: ROLES.SERGENT },
    { executor: ROLES.INSPECTEUR, from: ROLES.SERGENT, to: ROLES.LIEUTENANT },
    { executor: ROLES.INSPECTEUR_CHEF, from: ROLES.LIEUTENANT, to: ROLES.CAPITAINE },
    { executor: ROLES.DA, from: ROLES.CAPITAINE, to: ROLES.INSPECTEUR }
];

// Subdivisions managées par leurs Chefs respectifs, le Directeur Adjoint et le Directeur Général
const SUBDIVISIONS = [
    { chef: ROLES.CHEF_GTI, role: ROLES.GTI, chefRole: ROLES.CHEF_GTI },
    { chef: ROLES.CHEF_ENQUETEUR, role: ROLES.ENQUETEUR, chefRole: ROLES.CHEF_ENQUETEUR },
    { chef: ROLES.CHEF_DCM, role: ROLES.DCM, chefRole: ROLES.CHEF_DCM }
];

// Hiérarchie Capitaine et plus (pour le bouton Mise à Pied)
const CAPITAINE_PLUS = [
    ROLES.CAPITAINE,
    ROLES.INSPECTEUR,
    ROLES.INSPECTEUR_CHEF,
    ROLES.DA,
    ROLES.DG
];

// Tous les rôles qui ont le droit de taper /promotion
const PROMOTION_EXECUTORS = [
    ROLES.SERGENT,
    ROLES.LIEUTENANT,
    ROLES.CAPITAINE,
    ROLES.INSPECTEUR,
    ROLES.INSPECTEUR_CHEF,
    ROLES.DA,
    ROLES.DG,
    ROLES.CHEF_GTI,
    ROLES.CHEF_ENQUETEUR,
    ROLES.CHEF_DCM
];

// --- 3. ÉVÉNEMENT INITIALISATION DU BOT ---
client.on('clientReady', async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);

    // Enregistrement de la commande slash /promotion
    const command = new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Gérer les promotions, subdivisions et mises à pied.')
        .addUserOption(opt => 
            opt.setName('membre')
               .setDescription('Le membre à promouvoir ou gérer')
               .setRequired(true)
        );

    try {
        await client.application.commands.set([command]);
        console.log("Commande /promotion enregistrée avec succès.");
    } catch (err) {
        console.error("Erreur lors de l'enregistrement de la commande :", err);
    }
});

// --- 4. ÉVÉNEMENT GESTION DES INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'promotion') {
        const executor = interaction.member;
        const target = interaction.options.getMember('membre');

        if (!target) {
            return interaction.reply({ content: "⚠️ Membre introuvable sur le serveur.", ephemeral: true });
        }

        // 1. Vérification si l'exécuteur a un rôle autorisé à promouvoir/gérer
        const hasPermission = PROMOTION_EXECUTORS.some(roleId => executor.roles.cache.has(roleId));

        if (!hasPermission) {
            return interaction.reply({ 
                content: "Vous n'avez pas la permission de faite cette commande", 
                ephemeral: true 
            });
        }

        // 2. Vérification de la présence du rôle "Sûreté du Québec" chez la personne ciblée
        if (!target.roles.cache.has(ROLES.SQ)) {
            return interaction.reply({ 
                content: "❌ Cette personne doit posséder le rôle **Sûreté du Québec** pour recevoir des actions hiérarchiques.", 
                ephemeral: true 
            });
        }

        let actionsDone = [];

        // --- 3. PROMOTIONS STANDARDS ---
        for (const rule of PROMOTION_RULES) {
            if (executor.roles.cache.has(rule.executor) || executor.roles.cache.has(ROLES.DG)) {
                if (target.roles.cache.has(rule.from)) {
                    await target.roles.remove(rule.from);
                    await target.roles.add(rule.to);
                    actionsDone.push(`• Promu au grade supérieur : <@&${rule.to}>`);
                    break;
                }
            }
        }

        // --- 4. GESTION DES SUBDIVISIONS ET LEURS CHEFS (Chefs de Sub, DA, DG) ---
        for (const sub of SUBDIVISIONS) {
            const canManage = executor.roles.cache.has(sub.chef) || 
                              executor.roles.cache.has(ROLES.DA) || 
                              executor.roles.cache.has(ROLES.DG);

            if (canManage) {
                // Basculer le rôle de subdivision (Ajout si absent, Retrait si présent)
                if (target.roles.cache.has(sub.role)) {
                    await target.roles.remove(sub.role);
                    actionsDone.push(`• Retrait du rôle de subdivision <@&${sub.role}>`);
                } else {
                    await target.roles.add(sub.role);
                    actionsDone.push(`• Ajout du rôle de subdivision <@&${sub.role}>`);
                }

                // Le DG et le DA peuvent également attribuer/retirer les rôles de Chefs de subdivision
                if (executor.roles.cache.has(ROLES.DG) || executor.roles.cache.has(ROLES.DA)) {
                    if (target.roles.cache.has(sub.chefRole)) {
                        await target.roles.remove(sub.chefRole);
                        actionsDone.push(`• Retrait du rôle Chef de subdivision <@&${sub.chefRole}>`);
                    } else {
                        await target.roles.add(sub.chefRole);
                        actionsDone.push(`• Ajout du rôle Chef de subdivision <@&${sub.chefRole}>`);
                    }
                }
            }
        }

        // --- 5. ATTRIBUTION SUPERVISEUR (Directeur Général seulement) ---
        if (executor.roles.cache.has(ROLES.DG)) {
            if (!target.roles.cache.has(ROLES.SUPERVISEUR)) {
                await target.roles.add(ROLES.SUPERVISEUR);
                actionsDone.push(`• Attribution du rôle <@&${ROLES.SUPERVISEUR}> (Superviseur)`);
            }
        }

        // --- 6. BOUTON MISE À PIED (Capitaine+) ---
        const isCapitainePlus = CAPITAINE_PLUS.some(roleId => executor.roles.cache.has(roleId));
        const components = [];

        if (isCapitainePlus) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_mise_a_pied')
                    .setLabel('Mise à pied')
                    .setStyle(ButtonStyle.Danger)
            );
            components.push(row);
        }

        let responseText = actionsDone.length > 0 
            ? `✅ **Action(s) effectuée(s) sur ${target} :**\n` + actionsDone.join('\n')
            : `ℹ️ Aucune promotion automatique ou modification de subdivision n'a été appliquée à ${target}.`;

        const responseMessage = await interaction.reply({
            content: responseText,
            components: components,
            fetchReply: true
        });

        // Collecteur pour le bouton Mise à pied
        if (isCapitainePlus) {
            const collector = responseMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async buttonInteraction => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    return buttonInteraction.reply({ content: "Vous ne pouvez pas utiliser ce bouton.", ephemeral: true });
                }

                const userSelectRow = new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId('select_mise_a_pied')
                        .setPlaceholder('Sélectionnez la personne à mettre à pied')
                );

                await buttonInteraction.reply({
                    content: "🚨 **Sélectionnez la personne à qui vous souhaitez retirer TOUS les rôles :**",
                    components: [userSelectRow],
                    ephemeral: true
                });
            });
        }
    }

    // --- 5. GESTION DU MENU DÉROULANT DE MISE À PIED ---
    if (interaction.isUserSelectMenu() && interaction.customId === 'select_mise_a_pied') {
        const targetId = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId);

        if (!targetMember) {
            return interaction.reply({ content: "⚠️ Membre introuvable.", ephemeral: true });
        }

        try {
            // Retrait de tous les rôles du membre sauf le rôle par défaut (@everyone)
            const rolesToRemove = targetMember.roles.cache.filter(role => role.id !== interaction.guild.id);
            await targetMember.roles.remove(rolesToRemove);

            await interaction.reply({
                content: `💥 **Mise à pied effectuée** : Tous les rôles ont été retirés à ${targetMember}.`,
                ephemeral: false
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "❌ Impossible de retirer les rôles. Assurez-vous que le rôle du bot soit positionné au-dessus de tous les autres rôles dans les paramètres de votre serveur.",
                ephemeral: true
            });
        }
    }
});

// --- 6. CONNEXION ---
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;

if (!token) {
    console.error("❌ ERREUR: Aucun token trouvé dans les variables d'environnement. Veuillez définir DISCORD_TOKEN ou BOT_TOKEN.");
    process.exit(1);
}

client.login(token);
