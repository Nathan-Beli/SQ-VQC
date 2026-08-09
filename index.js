const http = require('http');
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
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
    
    // Subdivisions & Chefs
    CHEF_GTI: "1535998738311422075",
    GTI: "1535988386165162034",
    CHEF_ENQUETEUR: "1535998948605567026",
    ENQUETEUR: "1535988422252961802",
    CHEF_DCM: "1535998994474340382",
    DCM: "1535988465274064958"
};

// Liste de TOUS les grades hiérarchiques (utilisée pour remplacer automatiquement l'ancien grade)
const ALL_GRADES = [
    ROLES.CADET,
    ROLES.AGENT,
    ROLES.CHEF_EQUIPE,
    ROLES.SERGENT,
    ROLES.LIEUTENANT,
    ROLES.CAPITAINE,
    ROLES.INSPECTEUR,
    ROLES.INSPECTEUR_CHEF,
    ROLES.DA,
    ROLES.DG
];

// Matrice des autorisations de promotion
const PROMOTION_MAP = [
    { executor: ROLES.SERGENT, targetRole: ROLES.AGENT, label: "Agent" },
    { executor: ROLES.LIEUTENANT, targetRole: ROLES.CHEF_EQUIPE, label: "Chef d'équipe" },
    { executor: ROLES.CAPITAINE, targetRole: ROLES.SERGENT, label: "Sergent" },
    { executor: ROLES.INSPECTEUR, targetRole: ROLES.LIEUTENANT, label: "Lieutenant" },
    { executor: ROLES.INSPECTEUR_CHEF, targetRole: ROLES.CAPITAINE, label: "Capitaine" },
    { executor: ROLES.DA, targetRole: ROLES.INSPECTEUR, label: "Inspecteur" }
];

const SUBDIVISIONS_MAP = [
    { executor: ROLES.CHEF_GTI, role: ROLES.GTI, label: "Sub. GTI" },
    { executor: ROLES.CHEF_ENQUETEUR, role: ROLES.ENQUETEUR, label: "Sub. Enquêteur" },
    { executor: ROLES.CHEF_DCM, role: ROLES.DCM, label: "Sub. DCM" }
];

const CHEFS_SUBDIVISIONS = [
    { role: ROLES.CHEF_GTI, label: "Chef GTI" },
    { role: ROLES.CHEF_ENQUETEUR, label: "Chef Enquêteur" },
    { role: ROLES.CHEF_DCM, label: "Chef DCM" }
];

const CAPITAINE_PLUS = [ROLES.CAPITAINE, ROLES.INSPECTEUR, ROLES.INSPECTEUR_CHEF, ROLES.DA, ROLES.DG];
const ALL_EXECUTORS = [...new Set([...PROMOTION_MAP.map(p => p.executor), ...SUBDIVISIONS_MAP.map(s => s.executor), ROLES.DG])];

// --- 3. INITIALISATION DU BOT ---
client.on('clientReady', async () => {
    console.log(`[BOT] Connecté sous : ${client.user.tag}`);
    
    const command = new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Gérer la carrière et les rôles d\'un membre.')
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
                content: "Vous n'avez pas la permission de faite cette commande", 
                ephemeral: true 
            });
        }

        // Vérification du rôle obligatoire SQ
        if (!target.roles.cache.has(ROLES.SQ)) {
            return interaction.reply({ 
                content: "❌ Cette personne doit posséder le rôle **Sûreté du Québec**.", 
                ephemeral: true 
            });
        }

        // Récupération des rôles gérables par cet exécuteur
        const buttonsToCreate = [];

        // 1. Boutons de Grades
        for (const p of PROMOTION_MAP) {
            if (executor.roles.cache.has(p.executor) || executor.roles.cache.has(ROLES.DG)) {
                buttonsToCreate.push({ label: p.label, value: p.targetRole, isGrade: true });
            }
        }

        // 2. Boutons de Subdivisions
        for (const s of SUBDIVISIONS_MAP) {
            if (executor.roles.cache.has(s.executor) || executor.roles.cache.has(ROLES.DA) || executor.roles.cache.has(ROLES.DG)) {
                buttonsToCreate.push({ label: s.label, value: s.role, isGrade: false });
            }
        }

        // 3. Boutons Chefs de Subdivisions (DA & DG)
        if (executor.roles.cache.has(ROLES.DA) || executor.roles.cache.has(ROLES.DG)) {
            for (const cs of CHEFS_SUBDIVISIONS) {
                buttonsToCreate.push({ label: cs.label, value: cs.role, isGrade: false });
            }
        }

        // 4. Bouton Superviseur (DG uniquement)
        if (executor.roles.cache.has(ROLES.DG)) {
            buttonsToCreate.push({ label: "Superviseur", value: ROLES.SUPERVISEUR, isGrade: false });
        }

        // Déduplication
        const uniqueButtons = buttonsToCreate.filter((v, i, a) => a.findIndex(t => t.value === v.value) === i);

        if (uniqueButtons.length === 0) {
            return interaction.reply({ content: "⚠️ Vous n'avez aucun rôle à attribuer à ce membre.", ephemeral: true });
        }

        // Organiser les boutons par rangées (maximum 5 boutons par rangée Discord)
        const rows = [];
        let currentRow = new ActionRowBuilder();

        uniqueButtons.forEach((b, index) => {
            const hasRole = target.roles.cache.has(b.value);
            
            // Type de bouton : Vert si la personne l'a déjà, Bleu si c'est un nouveau grade, Gris pour subdivision
            let style = ButtonStyle.Secondary;
            if (hasRole) {
                style = ButtonStyle.Success; // Vert s'il le possède actuellement
            } else if (b.isGrade) {
                style = ButtonStyle.Primary; // Bleu pour les grades
            }

            const btn = new ButtonBuilder()
                .setCustomId(`toggle_${target.id}_${b.value}_${b.isGrade ? '1' : '0'}`)
                .setLabel(`${hasRole ? '✔ ' : '+ '} ${b.label}`)
                .setStyle(style);

            currentRow.addComponents(btn);

            if (currentRow.components.length === 5 || index === uniqueButtons.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });

        // Bouton de Mise à Pied si Capitaine+
        const isCapitainePlus = CAPITAINE_PLUS.some(roleId => executor.roles.cache.has(roleId));
        if (isCapitainePlus) {
            const btnMap = new ButtonBuilder()
                .setCustomId(`btn_map_${target.id}`)
                .setLabel('🚨 Mise à pied')
                .setStyle(ButtonStyle.Danger);
            
            // Ajouter la mise à pied sur une nouvelle rangée
            rows.push(new ActionRowBuilder().addComponents(btnMap));
        }

        const embed = new EmbedBuilder()
            .setColor(0x0055A5)
            .setTitle("🛡️ Gestion de Carrière")
            .setDescription(`Cliquez sur un bouton ci-dessous pour gérer les rôles de ${target}.\n\n🟢 **Vert** = Rôle qu'il possède déjà\n🔵 **Bleu** = Grade hiérarchique (remplacera automatiquement son ancien grade)`)
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            components: rows,
            ephemeral: true
        });
    }

    // --- ACTION DES BOUTONS DE RÔLES / GRADES ---
    if (interaction.isButton() && interaction.customId.startsWith('toggle_')) {
        const [_, targetId, roleId, isGradeStr] = interaction.customId.split('_');
        const isGrade = isGradeStr === '1';
        const targetMember = await interaction.guild.members.fetch(targetId);

        if (!targetMember) {
            return interaction.reply({ content: "⚠️ Membre introuvable.", ephemeral: true });
        }

        const hasRole = targetMember.roles.cache.has(roleId);

        if (hasRole) {
            // S'il l'a déjà, on lui enleve
            await targetMember.roles.remove(roleId);
            return interaction.reply({
                content: `➖ Le rôle <@&${roleId}> a été **retiré** à ${targetMember}.`,
                ephemeral: true
            });
        } else {
            // Si c'est un GRADE, on enlève d'abord tous ses anciens grades (SANS toucher aux subdivisions)
            if (isGrade) {
                const oldGrades = targetMember.roles.cache.filter(role => ALL_GRADES.includes(role.id));
                for (const [id] of oldGrades) {
                    await targetMember.roles.remove(id);
                }
            }

            // On ajoute le nouveau rôle / grade
            await targetMember.roles.add(roleId);

            return interaction.reply({
                content: `✅ Le rôle/grade <@&${roleId}> a été **attribué** à ${targetMember}.${isGrade ? ' (L\'ancien grade a été supprimé automatiqument).' : ''}`,
                ephemeral: true
            });
        }
    }

    // --- ACTION BOUTON MISE À PIED ---
    if (interaction.isButton() && interaction.customId.startsWith('btn_map_')) {
        const targetId = interaction.customId.split('_')[2];

        const userSelectRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`confirm_map_${targetId}`)
                .setPlaceholder('Sélectionnez le membre à mettre à pied...')
        );

        await interaction.reply({
            content: "🚨 **Sélectionnez la personne à qui vous souhaitez retirer TOUS les rôles :**",
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
            // Retrait de TOUS les rôles personnalisés
            const rolesToRemove = targetMember.roles.cache.filter(role => role.id !== interaction.guild.id);
            await targetMember.roles.remove(rolesToRemove);

            await interaction.reply({
                content: `💥 **Mise à pied effectuée** : Tous les rôles ont été retirés à ${targetMember}.`,
                ephemeral: true
            });

            // Publication de l'annonce publique
            const publicAnnounce = new EmbedBuilder()
                .setColor(0x992D22)
                .setTitle("📢 Avis Officiel - Mise à Pied")
                .setDescription(`Le membre **${targetMember.user.tag}** a subi une mise à pied administrative. Ses accès et rôles ont été révoqués par ${interaction.member}.`)
                .setTimestamp();

            await interaction.channel.send({ embeds: [publicAnnounce] });

        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "❌ Impossible de procéder à la mise à pied. Assurez-vous que le rôle du bot se situe au-dessus des autres rôles dans les paramètres Discord.",
                ephemeral: true
            });
        }
    }
});

// --- 5. CONNEXION DU BOT ---
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
if (!token) {
    console.error("❌ ERREUR: Aucun token trouvé dans DISCORD_TOKEN ou BOT_TOKEN.");
    process.exit(1);
}

client.login(token);
