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
    EmbedBuilder 
} = require('discord.js');

// --- 0. SERVEUR HTTP POUR LE HEALTH CHECK DE L'HÉBERGEUR ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot SQ en ligne !');
}).listen(PORT, () => console.log(`[HTTP] Serveur web en écoute sur le port ${PORT}`));

// --- 1. CLIENT DISCORD ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// --- 2. BASE DE DONNÉES DES RÔLES ET IDENTIFIANTS ---
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
    
    // Subdivisions & Chefs
    CHEF_GTI: "1535998738311422075",
    GTI: "1535988386165162034",
    CHEF_ENQUETEUR: "1535998948605567026",
    ENQUETEUR: "1535988422252961802",
    CHEF_DCM: "1535998994474340382",
    DCM: "1535988465274064958"
};

// Matrice des autorisations de promotion
const PROMOTION_MAP = [
    { executor: ROLES.SERGENT, targetRole: ROLES.AGENT, name: "Agent" },
    { executor: ROLES.LIEUTENANT, targetRole: ROLES.CHEF_EQUIPE, name: "Chef d'équipe" },
    { executor: ROLES.CAPITAINE, targetRole: ROLES.SERGENT, name: "Sergent" },
    { executor: ROLES.INSPECTEUR, targetRole: ROLES.LIEUTENANT, name: "Lieutenant" },
    { executor: ROLES.INSPECTEUR_CHEF, targetRole: ROLES.CAPITAINE, name: "Capitaine" },
    { executor: ROLES.DA, targetRole: ROLES.INSPECTEUR, name: "Inspecteur" }
];

const SUBDIVISIONS_MAP = [
    { executor: ROLES.CHEF_GTI, role: ROLES.GTI, name: "GTI" },
    { executor: ROLES.CHEF_ENQUETEUR, role: ROLES.ENQUETEUR, name: "Enquêteur" },
    { executor: ROLES.CHEF_DCM, role: ROLES.DCM, name: "DCM (Crimes Majeurs)" }
];

const CHEFS_SUBDIVISIONS = [
    { role: ROLES.CHEF_GTI, name: "Chef GTI" },
    { role: ROLES.CHEF_ENQUETEUR, name: "Chef Enquêteur" },
    { role: ROLES.CHEF_DCM, name: "Chef DCM" }
];

const CAPITAINE_PLUS = [ROLES.CAPITAINE, ROLES.INSPECTEUR, ROLES.INSPECTEUR_CHEF, ROLES.DA, ROLES.DG];
const ALL_EXECUTORS = [...new Set([...PROMOTION_MAP.map(p => p.executor), ...SUBDIVISIONS_MAP.map(s => s.executor), ROLES.DG])];

// --- 3. DÉMARRAGE ET ENREGISTREMENT DU COMMAND ---
client.on('clientReady', async () => {
    console.log(`[BOT] Bot connecté sous : ${client.user.tag}`);
    
    const command = new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Ouvre le panneau de gestion de carrière et hiérarchie.')
        .addUserOption(opt => opt.setName('membre').setDescription('Le membre à gérer').setRequired(true));

    try {
        await client.application.commands.set([command]);
        console.log('[BOT] Commande /promotion enregistrée.');
    } catch (err) {
        console.error('[ERREUR] Enregistrement de la commande :', err);
    }
});

// --- 4. GESTION DES INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    
    // --- COMMAND /PROMOTION ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'promotion') {
        const executor = interaction.member;
        const target = interaction.options.getMember('membre');

        if (!target) {
            return interaction.reply({ content: "⚠️ Membre introuvable sur le serveur.", ephemeral: true });
        }

        // Vérification des permissions
        const hasPermission = ALL_EXECUTORS.some(roleId => executor.roles.cache.has(roleId));
        if (!hasPermission) {
            return interaction.reply({ 
                content: "❌ **Vous n'avez pas la permission de faire cette commande.**", 
                ephemeral: true 
            });
        }

        // Vérification du rôle obligatoire SQ
        if (!target.roles.cache.has(ROLES.SQ)) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Accès Refusé")
                .setDescription(`Le membre ${target} doit posséder le rôle <@&${ROLES.SQ}> pour recevoir une promotion ou modification de subdivision.`);
            
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        // Filtrage des rôles attribuables
        const availableRoles = [];

        // Grades hiérarchiques
        for (const p of PROMOTION_MAP) {
            if (executor.roles.cache.has(p.executor) || executor.roles.cache.has(ROLES.DG)) {
                availableRoles.push({ label: `Grade: ${p.name}`, value: p.targetRole });
            }
        }

        // Subdivisions
        for (const s of SUBDIVISIONS_MAP) {
            if (executor.roles.cache.has(s.executor) || executor.roles.cache.has(ROLES.DA) || executor.roles.cache.has(ROLES.DG)) {
                availableRoles.push({ label: `Subdivision: ${s.name}`, value: s.role });
            }
        }

        // Chefs de subdivisions (DA & DG)
        if (executor.roles.cache.has(ROLES.DA) || executor.roles.cache.has(ROLES.DG)) {
            for (const cs of CHEFS_SUBDIVISIONS) {
                availableRoles.push({ label: `Poste: ${cs.name}`, value: cs.role });
            }
        }

        // Superviseur (DG uniquement)
        if (executor.roles.cache.has(ROLES.DG)) {
            availableRoles.push({ label: `Poste: Superviseur`, value: ROLES.SUPERVISEUR });
        }

        const uniqueRoles = availableRoles.filter((v, i, a) => a.findIndex(t => t.value === v.value) === i);

        if (uniqueRoles.length === 0) {
            return interaction.reply({ content: "⚠️ Vous n'avez aucun rôle à gérer pour ce membre.", ephemeral: true });
        }

        // Construction du menu moderne
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_role_${target.id}`)
            .setPlaceholder('Cliquez ici pour sélectionner un rôle à attribuer / enlever...')
            .addOptions(uniqueRoles.map(r => ({
                label: r.label,
                description: target.roles.cache.has(r.value) ? 'Status: POSSÉDÉ (Cliquer pour RETIRER)' : 'Status: NON POSSÉDÉ (Cliquer pour AJOUTER)',
                value: r.value,
                emoji: target.roles.cache.has(r.value) ? '➖' : '➕'
            })));

        const components = [new ActionRowBuilder().addComponents(selectMenu)];

        // Ajout du Bouton "Mise à pied" si Capitaine+
        const isCapitainePlus = CAPITAINE_PLUS.some(roleId => executor.roles.cache.has(roleId));
        if (isCapitainePlus) {
            const btnMap = new ButtonBuilder()
                .setCustomId(`btn_map_${target.id}`)
                .setLabel('Mise à pied')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⚠️');
            
            components.push(new ActionRowBuilder().addComponents(btnMap));
        }

        // Embed principal interactif
        const mainEmbed = new EmbedBuilder()
            .setColor(0x0055A5) // Bleu Sûreté du Québec
            .setTitle("🛡️ Panneau de Gestion Hiérarchique")
            .setDescription(`Gestion du dossier de la personne suivante : ${target}`)
            .addFields(
                { name: "Sûreté du Québec", value: "✅ Validé", inline: true },
                { name: "Opérateur", value: `${executor}`, inline: true }
            )
            .setFooter({ text: "Sûreté du Québec • Système RH Éphémère" })
            .setTimestamp();

        await interaction.reply({
            embeds: [mainEmbed],
            components: components,
            ephemeral: true
        });
    }

    // --- ACTION MENU DÉROULANT : AJOUTER OU RETIRER UN RÔLE ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_role_')) {
        const targetId = interaction.customId.split('_')[2];
        const selectedRoleId = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId);

        if (!targetMember) {
            return interaction.reply({ content: "⚠️ Membre introuvable sur le serveur.", ephemeral: true });
        }

        const embedResult = new EmbedBuilder().setTimestamp();

        if (targetMember.roles.cache.has(selectedRoleId)) {
            // Retirer le rôle
            await targetMember.roles.remove(selectedRoleId);
            embedResult
                .setColor(0xE67E22)
                .setTitle("Rôle Retiré")
                .setDescription(`Le rôle <@&${selectedRoleId}> a été **retiré** avec succès à ${targetMember}.`);
        } else {
            // Ajouter le rôle
            await targetMember.roles.add(selectedRoleId);
            embedResult
                .setColor(0x57F287)
                .setTitle("Rôle Attribué")
                .setDescription(`Le rôle <@&${selectedRoleId}> a été **ajouté** avec succès à ${targetMember}.`);
        }

        await interaction.reply({ embeds: [embedResult], ephemeral: true });
    }

    // --- ACTION BOUTON MISE À PIED ---
    if (interaction.isButton() && interaction.customId.startsWith('btn_map_')) {
        const targetId = interaction.customId.split('_')[2];

        const userSelectRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`confirm_map_${targetId}`)
                .setPlaceholder('Sélectionnez la personne à mettre à pied...')
        );

        const mapEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("🚨 Procédure de Mise à Pied")
            .setDescription("Veuillez sélectionner ci-dessous l'agent concerné pour confirmer le retrait de l'ensemble de ses rôles.");

        await interaction.reply({
            embeds: [mapEmbed],
            components: [userSelectRow],
            ephemeral: true
        });
    }

    // --- CONFIRMATION DE MISE À PIED ---
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('confirm_map_')) {
        const selectedUserId = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(selectedUserId);

        if (!targetMember) {
            return interaction.reply({ content: "⚠️ Membre introuvable.", ephemeral: true });
        }

        try {
            // Retrait de tous les rôles personnalisés
            const rolesToRemove = targetMember.roles.cache.filter(role => role.id !== interaction.guild.id);
            await targetMember.roles.remove(rolesToRemove);

            const confirmEmbed = new EmbedBuilder()
                .setColor(0x992D22)
                .setTitle("💥 Mise à pied Confirmée")
                .setDescription(`La totalité des rôles a été retirée au membre ${targetMember}.`)
                .setTimestamp();

            await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

            // Publication d'une annonce publique dans le salon courant
            const publicAnnounce = new EmbedBuilder()
                .setColor(0x992D22)
                .setTitle("📢 Avis Officiel - Mise à Pied")
                .setDescription(`Le membre **${targetMember.user.tag}** a subit une mise à pied administrative. Ses accès et rôles ont été révoqués par ${interaction.member}.`)
                .setTimestamp();

            await interaction.channel.send({ embeds: [publicAnnounce] });

        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "❌ Impossible de procéder à la mise à pied. Assurez-vous que le rôle du bot se situe au-dessus de tous les rôles de l'agent dans les paramètres du serveur.",
                ephemeral: true
            });
        }
    }
});

// --- 5. CONNEXION DU BOT ---
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;

if (!token) {
    console.error("❌ ERREUR: Aucun token trouvé dans la variable DISCORD_TOKEN ou BOT_TOKEN.");
    process.exit(1);
}

client.login(token);
