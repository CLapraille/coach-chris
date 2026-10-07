# CoachChris — Journal des décisions

Source des exigences : [requirements.txt](requirements.txt).
Ce fichier garde chaque décision prise afin de ne pas reposer les questions.
Statuts : ✅ décidé · ❓ ouvert · 🔎 fait constaté.

## Faits constatés (environnement)

- 🔎 Poste Windows 11, antivirus AVG qui intercepte le HTTPS (`uv --system-certs`, `truststore` en Python, retirer `SSLKEYLOGFILE`).
- 🔎 Outils installés : Docker Desktop, Node.js + npm, uv, Python, git. **Azure CLI absent.** pnpm absent.
- 🔎 Dossier projet `C:\Users\lapra\src\CoachChris` : contient seulement `requirements.txt`, pas encore de dépôt git.
- 🔎 MCP Garmin : `garmin-mcp.exe` (paquet `garmin_mcp`), jetons dans `C:\Users\lapra\.garminconnect`. Transport `streamable-http` possible (`GARMIN_MCP_TRANSPORT/HOST/PORT`), filtrage d'outils via `GARMIN_ENABLED_TOOLS` / `GARMIN_DISABLED_TOOLS`. Pas d'auth HTTP intégrée. Expose aussi des outils d'écriture (workouts, poids, nourriture, suppression…).
- 🔎 MCP Campus Coach : `campus-coach-mcp.exe` (code de l'utilisateur), 9 outils en lecture seule, API privée `api.campus.coach`, JWT ~15 min + refresh token tournant, jetons dans `C:\Users\lapra\.campuscoach\tokens.json` (`CAMPUS_COACH_TOKEN_DIR`). Transport HTTP `CAMPUS_MCP_TRANSPORT/HOST/PORT` (8001 par défaut). Reconnexion : `campus-coach-auth.exe` + snippet dans la console de app.campus.coach.
- 🔎 Projet parallèle évoqué : déployer les deux MCP sur Azure (Container Apps + Azure Files) pour claude.ai.

- 🔎 Dépôt `https://github.com/CLapraille/coach-chris` : non lisible sans authentification (privé ou inexistant). `gh` non installé, aucun `credential.helper` git global → il faudra que l'utilisateur s'authentifie pour pousser.

## Décisions

### Tour 1 (2026-10-06)

- ✅ **D1 Hébergement** : développement et validation en local d'abord ; cible finale = **Azure Container Apps**. Tout est conteneurisé (Docker) et configuré par variables d'environnement dès le départ.
- ✅ **D2 Accès aux MCP** : un **BFF** Node/TypeScript est le seul client MCP (SDK MCP officiel, transport streamable-http). Il porte la data layer, le cache, la synchro incrémentale et expose une API REST typée au front. Le navigateur ne parle jamais directement aux MCP.
- ✅ **D3 Écriture** : les actions d'écriture sont **autorisées dès la V1** (périmètre exact : voir tour 2).
- ✅ **D4 Persistance** : **Azure Cosmos DB** pour les données propres à l'app (routines, profil mobilité, tests, validations de matching…).
- ✅ **D5 Stack** : monorepo npm workspaces (`web/`, `server/`, `domain/`), Vite + React + TypeScript, TanStack Query, Recharts, Tailwind, Vitest. Pas de Next.js.
- ✅ **D6 Langue/unités** : UI en français, métrique, allure min/km, semaine du lundi, fuseau Europe/Paris. Code et identifiants en anglais.
- ✅ **D7 Bibliothèque mobilité** : rédigée par Claude (~30 exercices, métadonnées complètes, catégories mobilité/activation/récupération/renforcement), fichier de données typé versionné, marqué « à valider » jusqu'à relecture par l'utilisateur.
- ✅ **D8 Git** : dépôt distant `https://github.com/CLapraille/coach-chris`.
- ✅ **D9 Méthode** : **valider l'orientation du front avant de générer le code de l'application.** (L'orientation pourra évoluer ensuite.)

### Tour 2 (2026-10-06)

- ✅ **D10 Validation du front** : maquette statique cliquable HTML publiée en artefact privé (PC + mobile). D'abord 2 variantes de direction visuelle pour « Aujourd'hui », puis les autres écrans (Calendrier semaine/mois, Détail séance planifié vs réalisé, Mobilité, Charge/Récupération) dans la variante retenue. Pas de code React jetable.
- ✅ **D11 Données de la maquette** : audit des MCP d'abord, puis maquette alimentée par un **instantané réel** des données ; ce qui manque est affiché « Donnée indisponible ». Instantané non versionné.
- ✅ **D12 Direction visuelle** : **sombre par défaut**, thème clair disponible. Une couleur sobre par sport (course, vélo, renforcement, mobilité, repos) ; intensité encodée par la saturation.
- ✅ **D13 Écritures V1** : (a) pousser une séance Campus vers Garmin (créer + planifier le workout) ; (b) annoter une activité Garmin (nom, description, RPE, ressenti) ; suppression limitée aux workouts créés par l'app. Pas de poids/hydratation/nutrition. Toute écriture = confirmation explicite avec aperçu + liste blanche d'outils dans le BFF. **Souhait** : valider une séance dans Coach Campus si possible (voir tour 3).
- ✅ **D14 Cosmos en dev** : **vrai compte Azure Cosmos DB (free tier) dès le dev local**, API NoSQL. Nécessite abonnement Azure + Azure CLI dès maintenant.
- ✅ **D15 Cache** : Cosmos sert aussi de cache persistant des données MCP normalisées (synchro incrémentale, reprise rapide après scale-to-zero, ménage le rate-limit Garmin).
- ✅ **D16 Topologie Azure** : chaque MCP = son propre Container App (réutilisé comme connecteur claude.ai, entrée publique protégée) ; le BFF les appelle via l'URL interne de l'environnement. Jetons Garmin/Campus sur Azure Files.
- ✅ **D17 Auth en ligne** : Easy Auth (auth intégrée Container Apps), seule l'adresse de l'utilisateur autorisée. Pas d'auth en local.

🔎 Le MCP Campus actuel n'appelle que des GET (+ le refresh de jeton). Les séances ont déjà un statut (todo/done/skipped…) et `/logged-sessions` liste des activités « synchronisées depuis une montre ou saisies ». L'endpoint d'écriture pour valider une séance est inconnu.

### Tour 3 (2026-10-06)

- ✅ **D18 Validation Campus** : Campus ne valide **pas** automatiquement (l'utilisateur valide chaque séance à la main) → la fonction est utile. L'utilisateur capturera une fois la requête de validation (F12 › Réseau › « Copy as cURL »/HAR, jeton masqué) ; Claude ajoutera un outil d'écriture au MCP `campus-coach-mcp`. Capture à faire pendant l'étape d'audit.
- ✅ **D19 Azure** : compte **Azure gratuit**, rien n'existe encore. Objectif : **rester gratuit autant que possible**. Installation d'Azure CLI acceptée ; création des ressources via script lancé par l'utilisateur (`az login` fait par l'utilisateur).
- ✅ **D20 Région / nommage** : région **West Europe**. Resource group unique **`rg-coach-chris`**. Toute autre ressource : `<abréviation 3 lettres>-cc-9we-01` (ex. `cos-cc-9we-01`). Table des abréviations : voir tour 4.
- ✅ **D21 Maquette** : publiée en artefact privé claude.ai avec les vraies données.
- ✅ **D22 Fenêtre d'audit** : 6 semaines passées + 3 semaines de plan à venir ; VO2max/records sur 1 an. Audit strictement en lecture.

### Tour 4 (2026-10-06)

- ✅ **D23 Budget** : **5 €/mois maximum**, avec alerte de budget. Le crédit gratuit Azure est déjà épuisé.
- ✅ **D24 Registre** : Azure Container Registry (Basic) — ⚠️ ~5 $/mois à lui seul, conflit avec D23 à arbitrer (tour 5).
- ✅ **D25 Front** : **Azure Static Web Apps** pour le front ; BFF dans un Container App séparé. (Conséquences auth/CORS : tour 5.)
- ✅ **D26 Nommage des conteneurs** : `aci-cc-9we-<abréviation>` (ex. front/back) — noms exacts à confirmer (tour 5).
- ✅ **D27 MCP** : V1 en ingress **interne uniquement** (joignables par le BFF seul). Exposition claude.ai = étape séparée après la V1.
- ✅ **D28 Secrets** : identité managée + RBAC Cosmos, pas de clé ; secrets résiduels dans les secrets Container Apps. Pas de Key Vault.
- ❓ CI/CD : l'utilisateur envisage Azure DevOps (tour 5).
- 🔎 Installation d'Azure CLI lancée (winget).

### Tour 5 (2026-10-06)

- ✅ **D29 Registre** : **GitHub Container Registry privé** (remplace D24/ACR). Pull par Container Apps via identifiants de registre (utilisateur GitHub + PAT `read:packages`) stockés en secret Container Apps. Images slim, rétention 2 versions. Point de vigilance : expiration/renouvellement du PAT.
- ✅ **D30 Auth** : Static Web Apps **Free** (site statique public, sans données) + **jeton Entra ID** : inscription d'app `app-cc-9we-01`, MSAL dans le front, Easy Auth du BFF valide le bearer token ; « affectation requise » → seul le compte de l'utilisateur. Pas de cookie inter-domaines.
- ✅ **D31 Noms** : `swa-cc-9we-01` (front), `aci-cc-9we-bff` (BFF), `aci-cc-9we-mcpgarmin`, `aci-cc-9we-mcpcampus`, `cae-cc-9we-01`, `cos-cc-9we-01`, `stacc9we01`, `log-cc-9we-01`, `mid-cc-9we-01`, `bud-cc-9we-01`, `app-cc-9we-01`, resource group `rg-coach-chris`. Région West Europe.
- ✅ **D32 CI/CD** : **GitHub Actions** (build images → GHCR, déploiement Azure via fédération OIDC). Azure reste nécessaire pour le calcul (BFF, MCP), Cosmos et l'auth : GitHub n'héberge ni serveur ni base.
- 🔎 Abonnement Azure : crédit épuisé, **paiement à l'usage pas encore activé** → aucune ressource créable tant que ce n'est pas fait. Azure ne propose pas de prépaiement pour un abonnement individuel ; un budget n'émet que des alertes, il ne bloque pas la dépense.
- 🔎 Azure CLI : installation échouée (code 1602, élévation UAC annulée). À relancer par l'utilisateur : `winget install -e --id Microsoft.AzureCLI --source winget`.

### Tour 6 (2026-10-06)

- ✅ **D33 Activation Azure** : paiement à l'usage activé juste avant l'étape de code (pas nécessaire pour audit/maquette). Budget `bud-cc-9we-01` = **10 €/mois**, alertes 50/80/100 %. (Un budget est un seuil mensuel d'alerte, pas un crédit : rien n'est reporté, seule la consommation réelle est facturée.)
- ✅ **D34 Réauthentification** : script local `reauth.ps1` (auth Campus/Garmin sur le PC → upload vers Azure Files). Statut des jetons visible dans Settings / Data.
- ✅ **D35 Synchro** : à l'ouverture + bouton Actualiser + **job Container Apps quotidien ~6 h** (précharge sommeil/HRV/activités de la veille, garde le jeton Campus vivant).
- ✅ **D36 Matching** : lien Campus (montre → Campus) prioritaire s'il existe ; règles propres (date, sport, horaire, durée, distance, titre) en complément ; validation manuelle si incertain.
- ✅ **D37 Profil mobilité** : limitations déclarées **hanche** et **pied** comme profil initial, affinées ensuite par 5–6 auto-tests standardisés saisis dans l'app.
- ✅ **D38 Routine matin** : cochée dans l'app (écran Aujourd'hui), rattrapage possible jusqu'à J-3 ; au-delà « non renseigné » (≠ « manqué »).
- 🔎 Montre : **Garmin fēnix 7X Pro Sapphire Solar** (nom exact renvoyé par Garmin le 2026-10-07).

### Tour 7 (2026-10-06)

- ✅ **D39 Montre** : V1 = seulement **pousser la séance Campus dans le calendrier Garmin** (nom/description portant une note courte, ex. « Seuil 55 min · ce soir : mobilité hanche ») → visible dans le rapport matinal si le firmware l'affiche (à vérifier). Routines de mobilité en workouts guidés et widget Connect IQ : **reportés**, à réévaluer à l'usage.
- ✅ **D40 Écriture calendrier Garmin** : envoi **manuel** des séances Campus (bouton, aperçu + confirmation). Tout élément créé par l'app est préfixé « CC · » ; l'app ne modifie/supprime que ceux-là. Aucun envoi automatique en V1.
- ✅ **D41 Cadrage terminé** — compréhension partagée confirmée. Suite :
  1. Audit lecture seule des deux MCP → `AUDIT.md` ; puis capture par l'utilisateur de l'appel « valider une séance » Campus (D18).
  2. Maquette : 2 variantes d'« Aujourd'hui » sur données réelles (artefact privé) → choix → autres écrans.
  3. Architecture détaillée → activation Azure (PAYG, budget, Azure CLI) → code.
  Les choix d'interface (hiérarchie, règles d'insight, seuils) se tranchent sur la maquette.

### Tour 8 — après l'audit (2026-10-06)

Voir [AUDIT.md](AUDIT.md). Faits clés : rapprochement exact via `racingNote.externalId` (id d'activité Garmin) ; plan Campus actif = **retour de blessure** (28/09 → 22/11/2026) ; renforcement sans répétitions, charges ni muscles réalisés ; charge chronique Garmin figée → recalcul propre.

- ✅ **D42 Envoi sur la montre** : aujourd'hui l'utilisateur envoie **manuellement** chaque séance Campus vers la montre juste avant de sortir. D39 conservé : l'app pourra le faire à la place (devient indispensable après la fin de l'abonnement Campus, cf. D45).
- ✅ **D43 Douleur/gêne** : pas de suivi en V1.
- ✅ **D44 Ancien plan trail** : ignoré ; l'app ne considère que le plan actif ; l'historique avant le 28/09 vient de Garmin seul.
- ✅ **D45 Indépendance vis-à-vis de Campus** (nouvelle exigence) : l'abonnement Campus est payant ; **archiver dans Cosmos le contenu des séances et exercices Campus** pour pouvoir se passer de l'application à la fin de la souscription. Modalités : voir tour 9.
- 🔎 **Les `weekId` Campus ne sont pas stables** : la semaine du 05/10 avait l'id `6ac2aa3a…2451` à 12 h et `6ac4db9a…3600` une heure plus tard (distances prévues légèrement recalculées). Le plan « smart » est régénéré (probablement à chaque validation). → Clé interne d'une séance = date de semaine + index + nom ; l'archive doit conserver des **versions** du plan. Après la validation annoncée par l'utilisateur, aucune séance de la semaine du 05/10 n'est passée à `done`.
- 🔎 Capture de la requête de validation (D18) : l'utilisateur ne trouve pas la requête PUT/POST dans l'onglet Réseau → guide fourni au tour 9.

### Tour 9 (2026-10-06)

- ✅ **D46 Archive Campus** : archiver dans Cosmos (a) chaque séance attribuée, complète, **versionnée** à chaque régénération ; (b) une bibliothèque dédoublonnée des exercices de renforcement (variantes, matériel) ; (c) l'historique des allures de référence ; (d) rattrapage des plans passés encore accessibles. Limite : uniquement le contenu attribué à l'utilisateur, pas le catalogue Campus.
- ✅ **D47 Vidéos** : conserver uniquement liens + miniatures + une description texte rédigée par Claude (« à valider ») ; « vidéo indisponible » si le lien ne répond plus. Pas de téléchargement.
- ✅ **D48 Modèle de plan** : séance planifiée **indépendante de la source** (`source: campus | app`). V1 : alimentée par Campus seul. V2 : éditeur de plan dans l'app (séances archivées comme modèles), génération assistée éventuelle. Fin d'abonnement Campus : **23 juin 2027** → l'éditeur de plan (V2) doit être prêt avant cette date.
- 🔎 **Endpoint de validation Campus (D18) capturé** :
  `PUT https://api.campus.coach/smart-training/session/{weekId}/{sessionIndex}/complete`
  En-têtes : `Authorization: Bearer <atk>`, `Content-Type: application/json`, `X-Platform: WEB`, `X-TimeZone: Europe/Paris`.
  Corps : `{"racingNote": {"_t": "SmartTrailV2RacingNoteForm", "completionDate": <epoch ms>, "distance": <km>, "time": <s>, "pace": <s/km>, "source": "garmin", "sessionRating": 0, "sessionComment": "", "sessionConditions": null, "activeCalories", "averageHeartRateInBeatsPerMinute", "averageRunCadenceInStepsPerMinute", "totalElevationGainInMeters", "totalElevationLossInMeters", "externalId": "<id activité Garmin>", "name", "deviceName"}}`
  → Le corps se construit **entièrement à partir de l'activité Garmin**. `_t` dépend du sport (`SmartTrailV2RacingNoteForm` pour `trailV2` ; variantes route/PPG à confirmer, probablement `SmartRacingNoteForm` / `SmartPPGRacingNoteForm`). Comme les `weekId` changent, l'outil d'écriture doit relire le plan juste avant l'appel. Capture faite sur une séance de l'ancien plan (semaine du 21/09, index 2, activité 24509488613).

### Tour 10 — maquette (2026-10-06)

Maquette : https://claude.ai/artifact/Be7xmuX9zrK782vmzbzCX1 (artefact privé).
- ✅ **D49 Variante** : **A · Cockpit** retenue, mais **trop chargée** → version allégée : au-dessus de la ligne de flottaison seulement Séance + Forme ; puis Semaine, Mobilité (compacte), 3 signaux max. Le tableau planifié vs réalisé va dans le détail de séance, le graphe de volume dans la page Charge (une ligne de résumé reste sur Aujourd'hui).
- 🔎 Campus fixe l'**ordre** des séances d'une semaine, **pas leur jour** (question Q49 : placement des séances sur des jours).

- ✅ **D50 Jours des séances** : dans Campus, les séances d'une semaine se font **dans n'importe quel ordre**. L'app **propose un placement jour par jour** (règles explicites, ex. pas deux courses consécutives, renforcement entre deux courses, séance clé loin d'un renforcement jambes) ; l'utilisateur peut **déplacer** chaque séance. Placements stockés dans Cosmos.
- ↩️ **D49 révisé** : l'utilisateur demande de **revenir à la version 1** de la maquette (A + B) pour détailler lui-même ce qui va / ne va pas. La version allégée est mise de côté.

- ✅ **D51 Écran Aujourd'hui (variante A, ordre validé)** :
  1. **Forme ce matin** (en haut à gauche) — visuel validé ;
  2. **Volume par semaine (minutes)** — visuel validé ;
  3. **Prochaine séance** — visuel jugé chargé → nouvelle proposition : titre + durée, barre segmentée d'une série (× N), une ligne de résumé, « Ensuite » sur une ligne ;
  4. **Cette semaine** — visuel validé ;
  5. **Mobilité** — **une seule case à cocher pour la routine du matin, une seule pour le soir** (+ régularité 7 j) ;
  6. **Signaux** — visuel validé.
  En-tête : **date + état de la synchro uniquement**. L'objectif Campus actif a sa **carte « Objectif en cours » dédiée** (D52) : nom, description, J-N, barre des semaines (faites / en cours / intensités / test), stats du plan (séances faites/prévues, km, temps). **Ordre final validé** : 1 Objectif du jour · 2 Prochaine séance · 3 Forme · 4 Volume · 5 Cette semaine · 6 Mobilité · 7 Signaux (pleine largeur). Grille : (Objectif 5/12 + Séance 7/12), (Forme 7/12 + Volume 5/12), (Semaine 6/12 + Mobilité 6/12), (Signaux 12/12).
  « Semaine 1 · prévu vs réalisé » **retiré** de l'écran Aujourd'hui (ira dans le détail de séance / calendrier).

- ⛔ **D54 Note du jour abandonnée** (remplace D53) : pas de texte généré, **pas d'API Anthropic, pas de clé à gérer**. La carte redevient « Objectif en cours ». Ancienne spécification pour mémoire :
- ✅ **D55 Forme ce matin** : graphique VFC de taille intermédiaire (largeur max 480 px, ~ 100 px de haut) — ni l'original pleine largeur (trop gros) ni la version 340 px (trop petite). Si l'intermédiaire ne convient pas, revenir au format original.
- ✅ **D56 Volume par semaine** : couleurs **pastel** propres au graphique (`--p-run`, `--p-bike`, `--p-str`, déclinées en thème sombre et clair), distinctes des couleurs de sport saturées utilisées ailleurs. Graphique en taille intermédiaire (largeur max 520 px, centré ; 400 et 460 px jugés trop petits).
- ~~**D53 Note du jour (récap + motivation)**~~ : intégrée **dans la carte Objectif** (rebaptisée « Objectif du jour »), **en bas de carte** (sous la barre des semaines et les stats), au lieu d'une bulle séparée.
  - **Génération** : Claude (API Anthropic, modèle Haiku) une fois par jour lors de la synchro de 6 h, à partir **uniquement des faits calculés par l'app** (forme, séance, écarts, signaux) ; consignes : rien d'inventé, aucun propos médical. **Secours** : modèles de phrases remplis avec les données si l'API échoue. Clé API Anthropic dans les secrets Container Apps. Coût estimé : quelques centimes/mois. Chaque note est historisée dans Cosmos.
  - **Ton** : tutoiement, coach bienveillant mais direct ; **2 à 4 phrases** ; donnée absente = dit simplement, jamais comblée. La note peut évoluer dans la journée (ex. après la séance : « Séance faite. Ce soir : 8 min de mobilité hanche et pied »).

- ✅ **D57 Écran « Aujourd'hui » VALIDÉ** (maquette v17, https://claude.ai/artifact/Be7xmuX9zrK782vmzbzCX1). Référence visuelle pour les autres écrans : sombre par défaut, Barlow Semi Condensed (titres/chiffres) + IBM Plex Sans (texte) + IBM Plex Mono (données), cartes à bord fin, étiquettes de source (Garmin / Campus / Calculé / CoachChris), couleurs de sport sobres, pastel pour les graphiques de volume.

### Tour 12 — Calendrier (2026-10-06)

- ✅ **D58 Vue par défaut** : semaine (lun → dim), bascule vers la vue mois.
- ✅ **D59 Contenu d'un jour (vue semaine)** : séances prévues (couleur sport, titre court, durée, statut à faire/fait/sauté) ; activités Garmin réalisées rattachées ou « hors plan » ; 2 coches mobilité (matin/soir) ; disponibilité du matin ; marches masquées par défaut (bouton pour les afficher) ; écart prévu/réalisé en repère compact (« +29 % » orange), détail au clic.
- ✅ **D60 Placement** : règles (1) pas deux courses consécutives, (2) renforcement entre deux courses, (3) pas de renforcement jambes la veille d'une intensité, (4) au moins un jour vide par semaine, (5) ordre Campus par défaut. Aucun jour fixe : l'utilisateur doit pouvoir **déplacer une séance librement** et **intervertir deux séances** ; les règles enfreintes après déplacement s'affichent en avertissement, sans bloquer.
- ✅ **D61 Semaines non publiées** : affichées vides (« contenu pas encore publié par Campus »). ⚠️ Prévoir dès la conception la **bascule de source quand Campus ne sera plus disponible (23/06/2027) vers une source « Claude »** (cf. D48) — modalités à préciser (V2).
- ✅ **D62 Vue mois** : pastilles de sport par jour + total hebdomadaire (minutes course / vélo / renfo) en bout de ligne.

- ✅ **D63 Source après Campus** : décision reportée ; en V1 le modèle prévoit `source: campus | claude | manuel`. **Vision cible** : l'utilisateur donne son objectif, Claude l'aide à construire un plan pour y arriver, avec des **séances qui s'adaptent aux séances réalisées** (plan adaptatif, comme le « smart plan » Campus). Échéance : avant le 23/06/2027.
- ✅ **D64 Calendrier, fait vs à faire** : séance réalisée = **fond teinté de la couleur du sport** ; séance à faire = **fond transparent + contour fin** ; **pas d'icône** (coche/cercle retirés, le fond suffit) ; l'écart reste dans le libellé de statut (« +29 % » orange) ; hors plan = contour pointillé. Maquette Calendrier : https://claude.ai/artifact/P18yNKbSyv8L6kP7Jh7wNW

- ✅ **D65 Écran « Calendrier » VALIDÉ** (maquette v3).

- 🔎 **Analyse de la sortie du 04/10 (S1-3)** : prévu 8 × (2′ course + 1′ marche) = 24 min. Les 16 premiers tours Garmin portent `workout_step_index` 0/1 et durent **exactement** 120 s / 60 s → séance exécutée à la lettre. Les tours 17-18 (5:20 + 1:35 ≈ **6:55**, marche, FC ~105) sont **après la fin du workout** (sans `workout_step_index`). Le signal « +29 % » de la maquette était donc **trompeur** : l'écart vient d'un retour au calme marché. Autres constats : tour 16 (« marche ») en réalité couru (2,24 m/s, cadence 160, FC 146) ; tour 12 (« marche ») surtout à l'arrêt. Données disponibles : tours avec durée, distance, vitesse, FC, cadence, puissance, D+ ; courbes à la seconde via le FIT (`include_records`, volumineux) ; courbe de puissance (5 s → 20 min).

### Tour 13 — Détail de séance (2026-10-06)

- ✅ **D66 Écart au plan** : comparaison **étape par étape** (tours Garmin portant `workout_step_index`). Ce qui suit la dernière étape = « après la séance » (affiché à part, pas un écart). Le signal « +29 % » de la maquette Aujourd'hui est à corriger.
- ✅ **D67 Intensité d'un intervalle** : course = FC ≤ haut de la Z2 Garmin (151) + cadence de course ; marche = cadence < 130 pas/min ; durée ±10 %. Séances d'intensité : zones Campus (Z3, Z5…) ramenées aux zones FC Garmin. Règles visibles (« Règle » dépliable).
- ✅ **D68 Ordre de la page** : en-tête → prévu vs réalisé → respect des intervalles (barre prévue / barre réalisée tour par tour) → courbes → zones FC → conseil du coach (dépliable) → actions (Valider dans Campus, Annoter dans Garmin, avec aperçu + confirmation).
- ✅ **D70 Courbes à la seconde (FIT)** : **pas en V1** — le détail utilise les moyennes par tour (FC, vitesse, cadence, puissance). Courbes détaillées (FIT téléchargé à la 1re ouverture + cache Cosmos) en V2, utiles pour les séances d'intensité/côtes.
- ✅ **D69 Détail renforcement** : blocs prévus, muscles, conseil, statut + durée, bouton « Valider dans Campus ». Pas de saisie des séries en V1.

- ✅ **D71 Périmètre V1 réduit** : seuls les onglets **Aujourd'hui**, **Calendrier** et **Mobilité** sont nécessaires en V1. Charge, Récupération, Progression, Activités, Insights (pages dédiées) → plus tard. Maquette « Détail de séance » produite (https://claude.ai/artifact/Br2gCgjFojb1nsSsXm3LN4) : statut en V1 à confirmer (tour 14). Signal « +29 % » de la maquette Aujourd'hui corrigé en « récupération courue » (D66).

### Tour 14 — Mobilité et périmètre V1 (2026-10-06)

- ✅ **D72 Détail de séance** : **gardé en V1** comme sous-page (ouverte depuis Calendrier / Aujourd'hui), maquette https://claude.ai/artifact/Br2gCgjFojb1nsSsXm3LN4.
- ✅ **D73 Écran « Données »** : **gardé en V1** (état des connexions Garmin/Campus, dernière synchro, erreurs, jeton expiré → action `reauth.ps1`). V1 = 4 onglets : Aujourd'hui, Calendrier, Mobilité, Données (+ sous-page Détail de séance).
- ✅ **D74 Onglet Mobilité V1** : (1) Aujourd'hui : routine matin fixe + soir générée, détail des exercices ; (2) Mes priorités (statut bon / à surveiller / faible / priorité) ; (3) Régularité matin/soir 7-28-90 j + série, sans gamification ; (4) Auto-tests (5–6) qui font évoluer les priorités. Bibliothèque consultable depuis chaque exercice (pas d'écran dédié).
- ✅ **D75 Génération du soir** : règles explicites (priorités, séance du jour et du lendemain, renforcement récent, exercices des 3 derniers soirs) ; 3–5 exercices, ≤ 8 min ; bouton « Changer cet exercice » ; la règle de choix est affichée sous chaque exercice.
- ✅ **D76 Mode guidé** : plein écran (nom, consigne courte, compte à rebours), pour le matin et le soir. **Pas de passage automatique** : un bouton **« Valider »** fait passer à l'exercice suivant. Routine cochée à la fin.
- ✅ **D77 Bibliothèque** : rédigée dans [mobility-library.md](mobility-library.md), **relue par l'utilisateur avant la maquette Mobilité**.

- ✅ **D78 Routine du soir pilotée par les tests** (remplace la génération quotidienne de D75) :
  - **Bloc de 2 semaines** (nouveaux tests en début de S3, S5, S7 du plan de reprise).
  - **Socle fixe** : 3 exercices (~6 min) choisis d'après les résultats des tests, identiques tous les soirs du bloc ; **+ 1 exercice variable** (~2 min) choisi selon le contexte du jour (renforcement récent, séance du lendemain, repos) — règles de contexte de D75 appliquées à ce seul créneau.
  - **Fin de bloc** : refaire seulement les tests des zones travaillées ; les 6 tests complets tous les 2 mois.
  - **Transition** : zone qui progresse sans atteindre le repère → exercice gardé ; repère atteint → variante plus difficile ou autre zone prioritaire ; stagnation 2 blocs → variante. **Validation obligatoire de l'utilisateur** avant le démarrage de chaque bloc.
  - **Démarrage** : les 6 tests une première fois (~10 min, guidés dans l'app), puis proposition du bloc 1.

- ✅ **D79 Bibliothèque de mobilité validée** (v1.0) : routine du matin, 30 exercices, 6 auto-tests et règles du soir de [mobility-library.md](mobility-library.md) acceptés tels quels.

- ✅ **D80 Démonstration des exercices** : **mannequin 2D articulé en SVG** (silhouette sobre, animation en boucle position de départ ↔ position d'arrivée, zone travaillée en couleur mobilité), affiché dans le mode guidé (au-dessus du compte à rebours) et dans une carte « Démonstrations » de l'onglet Mobilité (liste par zone + grande vue avec fiche, consigne, précaution et angle de vue). Lien vidéo externe possible en complément. Style validé sur le prototype H2/C1 (2026-10-06), **les 30 exercices sont dessinés** (maquette https://claude.ai/artifact/CbwDFZoLAtervp8XUoq5nF, moteur `mannequin.js` : cinématique directe + IK 2 segments, vues de profil / de face, gros plans pour P2, P3 et T2). Le moteur sera repris tel quel dans le front React. Démos des 30 exercices revues par l'utilisateur le 2026-10-07 (« jusqu'ici ça m'a l'air bien ») après correctif d'affichage (1er horodatage rAF négatif). Maquette Mobilité considérée validée, ajustable à l'usage.

### Tour 16 — Écran Données (2026-10-07)

- ✅ **D81 Données · contenu par source** : une carte Garmin et une carte Campus : état (OK / jeton expiré / erreur), dernière synchro réussie, âge du jeton (Campus : refresh token tournant), dernière erreur en clair.
- ✅ **D82 Données · actions** : bouton « Actualiser maintenant » par source ; jeton expiré → commande `reauth.ps1` affichée avec bouton « Copier » (le navigateur ne peut pas lancer de script local).
- ✅ **D83 Données · journal** : 10 dernières synchros, **compact** (origine job 6 h / ouverture / bouton, heure, durée, résultat).
- ✅ **D84 Données · fraîcheur** : tableau par type (sommeil, VFC, activités, plan Campus) avec dernière date disponible et manques signalés (ex. « nuit du 2/10 absente »).
- ✅ **D85 Coût Azure** : pas affiché dans l'app en V1 ; les alertes e-mail du budget `bud-cc-9we-01` suffisent.
- ✅ **D86 Export / suppression des données Cosmos** : plus tard, pas en V1.
- ✅ **D87 Navigation des maquettes** alignée sur le périmètre V1 (D71/D73) : 4 onglets Aujourd'hui, Calendrier, Mobilité, Données (barre latérale et barre mobile), sur toutes les maquettes.
- ✅ **D88 Poids dans « Forme ce matin »** : dernière pesée Garmin (balance Index) + flèche d'évolution vs la pesée précédente : **flèche verte = prise de poids, flèche rouge = perte de poids** (choix explicite de l'utilisateur). La date de la pesée est toujours affichée (les pesées ne sont pas quotidiennes : dernière le 29/09, précédente le 14/09).
- ✅ **D89 « Cette semaine » jour par jour** : les 7 jours (lun → dim) avec la séance placée selon les règles D50/D60 (même placement que le Calendrier), « Repos » les jours vides, jour courant mis en avant, jours passés grisés. Sous chaque jour, la piste de la routine du soir déduite du contexte (règles du créneau du jour, D78). Pied de carte : règles respectées ou avertissements, lien « Ajuster dans le Calendrier ». Maquette v20, à valider.
- ✅ **D90 Repère de volume** (carte « Volume par semaine ») : sous le graphe, « Repère pour cette semaine » = **1,3 × moyenne des 4 semaines complètes précédentes** (ratio charge aiguë / chronique), calculé pour la **course** et pour le **total** (course + vélo + renforcement, marches exclues). Barre « prévu » + trait du repère, statut sous / au-dessus ; trait « max » pointillé sur la semaine en cours du graphe. Le plan Campus prime : un dépassement est un point d'attention, pas une interdiction ; règle détaillée dans « Règle ». Instantané : course ≤ 64 min (prévu 86, au-dessus), total ≤ 234 min (prévu 146). Maquette v21, à valider.
- ✅ **D91 Carte Mobilité en liste** : une case par routine (D51 inchangé) + liste des exercices avec durée ; l'exercice du jour du soir est mis en avant avec sa raison (« après le renforcement »). Pistes du soir de la carte Semaine alignées (« + quadriceps debout », « + soléaire genou plié »…). Maquette v21, à valider.
- ✅ **D89–D91 validés** le 2026-10-07 (« voilà c'est bon ») ; repère de course gardé tel quel (semaines sans course incluses dans la moyenne). **Écran Aujourd'hui validé (maquette v21).**
- ✅ **D92 Maquette Données** (https://claude.ai/artifact/P2PfCEnDaCrdLKTpVfnEhA) : 2 cartes source (Garmin, Campus), fraîcheur des données (6 types, 14 derniers jours), journal compact. Bascule « État réel » (relevé MCP du 07/10 21:58 ; journal vide car app non déployée) / « Exemple » (jeton Campus expiré + journal inventé, marqués EXEMPLE). Commande proposée : `.\reauth.ps1 -Source campus` (paramètre `-Source garmin|campus`). Journal présenté en tableau (Date · Origine · Résultat · Durée alignée à droite). **Validé le 2026-10-07**, commande comprise. **Toutes les maquettes V1 sont validées** (Aujourd'hui, Calendrier, Mobilité, Données, Détail de séance).

### Tour 17 — Architecture (2026-10-07)

- ✅ **D93 Infrastructure as code** : **Bicep** (`infra/main.bicep`, modules, portée resource group), rejoué par GitHub Actions ; ce que Bicep gère mal (inscription Entra, fédération OIDC, dépôt initial des jetons) dans `infra/bootstrap.ps1`. Terraform et script CLI seul écartés.
- 🔄 **D94 Architecture V1** : brouillon [ARCHITECTURE.md](ARCHITECTURE.md) (monorepo, modules `domain/`, conteneurs Cosmos, API du BFF, synchro, liste blanche MCP, protocole aperçu → confirmation, sécurité, Bicep, coûts, CI/CD, dev local, jalons M0–M6, 7 questions ouvertes). À relire.
- ✅ **D95 BFF** : framework HTTP **Fastify** (+ zod).
- ✅ **D96 Source de `campus-coach-mcp`** : reprise dans **`mcp/campus`** du monorepo (copie identique de `C:Userslapracampus-coach-mcp` faite le 2026-10-07 : `pyproject.toml`, `uv.lock`, `src/campus_coach_mcp/` ; `uv sync` OK, 9 outils exposés). Le dossier d'origine n'est pas un dépôt git ; Claude Desktop pointe encore vers son `.venv` (à rebasculer quand `mcp/campus` deviendra la référence). ⚠️ `campus-coach-auth` écoute sur le port **8765**, le même que le serveur local de prévisualisation des maquettes : ne pas lancer les deux en même temps.
- ✅ **D97 Job de synchro** : cron à **heure UTC fixe** (≈ 6 h l'été, 5 h l'hiver, heure de Paris).
- 🔎 **Azure vérifié** le 2026-10-07 : `Azure subscription 1`, état Enabled, `quotaId: PayAsYouGo_2014-09-01`, plafond de dépense désactivé. Aucun compte Cosmos existant (free tier disponible). Ressources préexistantes hors projet : 2 plans App Service **F1 (gratuits)** + un espace Log Analytics par défaut.
- 🔎 **AVG et Azure CLI** : le CLI (Python) rejette le certificat d'AVG. Racine AVG exportée dans `C:Userslapra.certsavg-root.pem` et bundle combiné (certifi du CLI + AVG) dans `C:Userslapra.certsca-bundle.pem` → `REQUESTS_CA_BUNDLE` pointant dessus. Pour Node 24 : `NODE_OPTIONS=--use-system-ca` (vérifié avec npm). Résout la question ouverte n° 6 de l'architecture.
- ✅ **D98 M0 livré** : branche `m0-socle` poussée sur GitHub (commit `19e47cf`). Node 24, TypeScript exécuté nativement par Node (pas de build serveur), `erasableSyntaxOnly`. Vérifié en local : lint, types, 6 tests, build web, `/api/health` répond.

### Tour 18 — M1 domaine (2026-10-07)

- ✅ **D99 Règle (2) « renforcement entre deux courses »** : traitée comme une **préférence** du placement proposé, pas comme un avertissement (comme dans la maquette Calendrier validée, qui ne vérifiait que les règles 1, 3, 4 et « deux séances le même jour »). Les avertissements ne portent que sur des situations qui touchent une séance encore modifiable : le passé n'est pas signalé.
- ✅ **D100 Proposition de placement** : recherche exhaustive qui minimise, dans l'ordre, les avertissements, la préférence (2), l'écart à l'ordre Campus, puis place au plus tôt. Résultats sur la vraie semaine S2 : au 07/10 au soir (S2-1 course faite mardi, renfo S2-1 fait mercredi) → course S2-2 jeudi, renfo S2-2 vendredi, course S2-3 samedi. En début de semaine (mardi, rien de fait) → course, renfo, course, renfo, course de mardi à samedi : l'ordre Campus cède devant la préférence (2), ce qui diffère de la maquette (illustrative).
- ✅ **D101 Jambes d'un renforcement** : déduites des noms d'exercices Campus (chaise, mollet, fente, squat…) ; sans le détail, on **suppose** un renforcement jambes (cas prudent pour la règle 3) et on l'indique (`legsFrom: assumed`).
- 🔎 Le renforcement S2-1 a été validé dans Campus le 07/10 à 20:40 (heure de Paris) **sans activité Garmin** (`source: auto`) : le jour de validation fait foi pour le rapprochement.

## Actions en attente côté utilisateur

- ~~Installer Azure CLI~~ ✅ (2.91.0).
- ~~Activer le paiement à l'usage~~ ✅ vérifié.
- ~~Capturer la requête « valider une séance »~~ ✅ fait (tour 9).
- ~~S'authentifier sur GitHub~~ ✅ (premier push fait).
