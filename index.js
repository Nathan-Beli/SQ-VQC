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
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- 2. LISTE DES IDS DE RÔLES ---
const ROLES = {
    SQ: "1534277079322071060",               // @Sûreté du Québec
    DG: "1534559869959409785",               // @Directeur Général
    DA: "1534559820139598035",               // @Directeur Adjoint
    INSPECTEUR_CHEF: "1534559797549076520",  // @Inspecteur-Chef
    INSPECTEUR: "1534559776443207901",       // @Inspecteur
    CAPITAINE: "1534559750027612291",        // @Capitaine
    LIEUTENANT: "1534559733300854794",       // @Lieutenant
    SERGENT: "1534559707438649494",          // @Sergent
    CHEF_EQUIPE: "1534559291057377290",      // @Chef d'équipe
    AGENT: "1534559270870450319",            // @Agent
    CADET: "1534559249168859137",            // @Cadet
    SUPERVISEUR: "1535988500824989757",       // @Superviseur
    
    // Subdivisions & Chefs
    CHEF_GTI: "1535998738311422075",         // @Chef GTI
    GTI: "1535988386165162034",              // @GTI
    CHEF_ENQUETEUR: "1535998948605567026",   // @Chef Enqueteur
    ENQUETEUR: "1535988422252961802",        // @Enqueteur
    CHEF_DCM: "1535998994474340382",         // @Chef DCM
    DCM: "1535988465274064958"               // @DCM (Division Crimes Majeurs)
};

// Hiérarchie des grades (du plus BAS au plus HAUT) pour comparer les rangs
const GRADE_HIERARCHY = [
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

// Matrice des promotions : Chaque exécuteur autorise la promotion vers son niveau direct ET tous les niveaux inférieurs autorisés
const PROMOTION_RULES = [
    { executor: ROLES.SERGENT, maxTargetRole: ROLES.AGENT },
    { executor: ROLES.LIEUTENANT, maxTargetRole: ROLES.CHEF_EQUIPE },
    { executor: ROLES.CAPITAINE, maxTargetRole: ROLES.SERGENT },
    { executor: ROLES.INSPECTEUR, maxTargetRole: ROLES.LIEUTENANT },
    { executor: ROLES.INSPECTEUR_CHEF, maxTargetRole: ROLES.CAPITAINE },
    { executor: ROLES.DA, maxTargetRole: ROLES.INSPECTEUR },
    { executor: ROLES.DG, maxTargetRole: ROLES.INSPECTEUR_CHEF }
];

// Libellés lisibles pour chaque grade
const GRADE_LABELS = {
    [ROLES.CADET]: "Cadet",
    [ROLES.AGENT]: "Agent",
    [ROLES.CHEF_EQUIPE]: "Chef d'équipe",
    [ROLES.SERGENT]: "Sergent",
    [ROLES.LIEUTENANT]: "Lieutenant",
    [ROLES.CAPITAINE]: "Capitaine",
    [ROLES.INSPECTEUR]: "Inspecteur",
    [ROLES.INSPECTEUR_CHEF]: "Inspecteur-Chef",
    [ROLES.DA]: "Directeur Adjoint",
    [ROLES.DG]: "Directeur Général"
};

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
const ALL_EXECUTORS = [...new Set([...PROMOTION_RULES.map(p => p.executor), ...SUBDIVISIONS_MAP.map(s => s.executor), ROLES.DG])];

// Fonction d'aide pour obtenir l'indice du grade le plus élevé d'un membre
function getMemberGradeRank(member) {
    let highestRank = -1;
    for (let i = 0; i < GRADE_HIERARCHY.length; i++) {
        if (member.roles.cache.has(GRADE_HIERARCHY[i])) {
            highestRank = i; // Retient le rang le plus haut trouvé
        }
    }
    return highestRank;
}

// Fonction pour récupérer la liste de tous les grades qu'un membre peut attribuer
function getAllowedGradePromotions(executorMember) {
    if (executorMember.roles.cache.has(ROLES.DG)) {
        return GRADE_HIERARCHY.slice(1, GRADE_HIERARCHY.indexOf(ROLES.DG)).map(roleId => ({
            value: roleId,
            label: GRADE_LABELS[roleId] || "Grade"
        }));
    }

    let maxTargetRankIndex = -1;

    for (const rule of PROMOTION_RULES) {
        if (executorMember.roles.cache.has(rule.executor)) {
            const ruleTargetIndex = GRADE_HIERARCHY.indexOf(rule.maxTargetRole);
            if (ruleTargetIndex > maxTargetRankIndex) {
                maxTargetRankIndex = ruleTargetIndex;
            }
        }
    }

    if (maxTargetRankIndex === -1) return [];

    const minRankIndex = GRADE_HIERARCHY.indexOf(ROLES.AGENT);
    const allowedRoles = [];

    for (let i = minRankIndex; i <= maxTargetRankIndex; i++) {
        const roleId = GRADE_HIERARCHY[i];
        allowedRoles.push({
            value: roleId,
            label: GRADE_LABELS[roleId] || "Grade"
        });
    }

    return allowedRoles;
}

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

// --- 4. GESTION DES MESSAGES TEXTUELS (!ID) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.toLowerCase() === '!id') {
        if (message.deletable) {
            await message.delete().catch(() => {});
        }

        const hasPermission = ALL_EXECUTORS.some(roleId => message.member.roles.cache.has(roleId));
        if (!hasPermission) {
            const reply = await message.channel.send(`❌ <@${message.author.id}>, vous n'avez pas la permission de consulter la liste des IDs.`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        let formattedList = "🆔 **Liste des IDs de Rôles de la SQ**\n\n";
        for (const [key, value] of Object.entries(ROLES)) {
            formattedList += `• **${key}** : \`${value}\` (<@&${value}>)\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x0055A5)
            .setTitle("📋 Configuration des IDs de Rôles")
            .setDescription(formattedList)
            .setTimestamp();

        const tempMsg = await message.channel.send({
            content: `📑 <@${message.author.id}>, voici la liste des IDs (ce message s'autodétruira dans 15s) :`,
            embeds: [embed]
        });

        setTimeout(() => {
            tempMsg.delete().catch(() => {});
        }, 15000);
    }
});

// --- 5. GESTION DES INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    
    // --- COMMAND /PROMOTION ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'promotion') {
        const executor = interaction.member;
        const target = interaction.options.getMember('membre');

        if (!target) {
            return interaction.reply({ content: "⚠️ Membre introuvable sur le serveur.", ephemeral: true });
        }

        // 🛑 SÉCURITÉ 1 : Interdiction sur soi-même
        if (executor.id === target.id) {
            return interaction.reply({ 
                content: "❌ **Vous ne pouvez pas vous attribuer une promotion à vous-même !**", 
                ephemeral: true 
            });
        }

        // Vérification des permissions
        const hasPermission = ALL_EXECUTORS.some(roleId => executor.roles.cache.has(roleId));
        if (!hasPermission) {
            return interaction.reply({ 
                content: "Vous n'avez pas la permission de faite cette commande", 
                ephemeral: true 
            });
        }

        // 🛑 SÉCURITÉ 2 : Interdiction d'agir sur un membre de grade ÉGAL ou SUPÉRIEUR
        const executorRank = getMemberGradeRank(executor);
        const targetRank = getMemberGradeRank(target);

        if (!executor.roles.cache.has(ROLES.DG) && targetRank >= executorRank && targetRank !== -1) {
            return interaction.reply({ 
                content: "❌ **Vous ne pouvez pas modifier les rôles d'un membre ayant un grade égal ou supérieur au vôtre.**", 
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

        const buttonsToCreate = [];

        // 1. Boutons de Grades en cascade
        const allowedGradePromotions = getAllowedGradePromotions(executor);
        for (const gradeOption of allowedGradePromotions) {
            buttonsToCreate.push({ label: gradeOption.label, value: gradeOption.value, isGrade: true });
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

        // Organiser les boutons
        const rows = [];
        let currentRow = new ActionRowBuilder();

        uniqueButtons.forEach((b, index) => {
            const hasRole = target.roles.cache.has(b.value);
            
            let style = ButtonStyle.Secondary;
            if (hasRole) {
                style = ButtonStyle.Success; // Vert
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
            
            rows.push(new ActionRowBuilder().addComponents(btnMap));
        }

        const embed = new EmbedBuilder()
            .setColor(0x0055A5)
            .setTitle("🛡️ Gestion de Carrière")
            .setDescription(`Cliquez sur un bouton ci-dessous pour gérer les rôles de ${target}.\n\n🟢 **Vert** = Rôle actuellement possédé\n🔵 **Bleu** = Grade hiérarchique (remplacera l'ancien)`)
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

        if (interaction.member.id === targetMember.id) {
            return interaction.reply({ content: "❌ Action impossible sur vous-même.", ephemeral: true });
        }

        const hasRole = targetMember.roles.cache.has(roleId);

        if (hasRole) {
            await targetMember.roles.remove(roleId);
            return interaction.reply({
                content: `➖ Le rôle <@&${roleId}> a été **retiré** à ${targetMember}.`,
                ephemeral: true
            });
        } else {
            if (isGrade) {
                const oldGrades = targetMember.roles.cache.filter(role => GRADE_HIERARCHY.includes(role.id));
                for (const [id] of oldGrades) {
                    await targetMember.roles.remove(id);
                }
            }

            await targetMember.roles.add(roleId);

            return interaction.reply({
                content: `✅ Le rôle/grade <@&${roleId}> a été **attribué** à ${targetMember}.${isGrade ? ' (L\'ancien grade a été remplacé).' : ''}`,
                ephemeral: true
            });
        }
    }

    // --- ACTION BOUTON MISE À PIED ---
    if (interaction.isButton() && interaction.customId.startsWith('btn_map_')) {
        const targetId = interaction.customId.split('_')[2];

        if (interaction.member.id === targetId) {
            return interaction.reply({ content: "❌ Vous ne pouvez pas vous mettre à pied vous-même !", ephemeral: true });
        }

        const userSelectRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`confirm_map_${targetId}`)
                .setPlaceholder('Sélectionnez le membre à mettre à pied...')
        );

        await interaction.reply({
            content: "🚨 **Sélectionnez la personne à qui vous souhaitez retirer TOUS les rôles SQ :**",
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

        if (interaction.member.id === targetMember.id) {
            return interaction.reply({ content: "❌ Vous ne pouvez pas vous mettre à pied vous-même !", ephemeral: true });
        }

        try {
            // Extraction de tous les IDs figurant dans l'objet ROLES
            const sqRoleIds = Object.values(ROLES);

            // Filtrage : supprime uniquement les rôles appartement à la SQ
            const rolesToRemove = targetMember.roles.cache.filter(role => sqRoleIds.includes(role.id));
            
            await targetMember.roles.remove(rolesToRemove);

            await interaction.reply({
                content: `💥 **Mise à pied effectuée** : Tous les rôles **SQ** ont été retirés à ${targetMember}.`,
                ephemeral: true
            });

            const publicAnnounce = new EmbedBuilder()
                .setColor(0x992D22)
                .setTitle("📢 Avis Officiel - Mise à Pied")
                .setDescription(`Le membre **${targetMember.user.tag}** a subi une mise à pied administrative. Ses accès et rôles SQ ont été révoqués par ${interaction.member}.`)
                .setTimestamp();

            await interaction.channel.send({ embeds: [publicAnnounce] });

        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "❌ Impossible de procéder à la mise à pied. Vérifiez la hiérarchie des rôles du Bot sur Discord.",
                ephemeral: true
            });
        }
    }
});

// --- 6. CONNEXION DU BOT ---
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
if (!token) {
    console.error("❌ ERREUR: Aucun token trouvé dans DISCORD_TOKEN ou BOT_TOKEN.");
    process.exit(1);
}

client.login(token);
