# Audit des MCP — Garmin & Campus Coach

Date : 2026-10-06. Audit **strictement en lecture** (aucun outil d'écriture appelé).
Fenêtre : 2026-08-24 → 2026-10-27 (6 sem. passées + 3 sem. à venir), cf. [DECISIONS.md](DECISIONS.md) D22.

## 1. Contexte révélé par les données

- **Plan Campus actif : « Retour de blessure »** (`goalType: back-from-injury`), 8 semaines du **28/09 au 22/11/2026**, 5 séances/sem. = 3 courses route + 2 renforcements (PPG). Fin de plan : test 1500 m pour redéfinir les allures.
  Semaine 1 : 5/5 séances faites. Course reprise en alternance course/marche (1'/1'), intensités réintroduites en semaine 5.
- Plan précédent : préparation trail (27 km / 1500 m D+, course prévue le **07/09**). Depuis le 25/08, les séances de ce plan sont restées `todo`/`skip` : elles n'ont jamais été clôturées.
- Pratique réelle (Garmin, 44 jours) : course (route + tapis), **Zwift** (vélo virtuel), vélo électrique, rameur, renforcement, randonnée, et **beaucoup de marches courtes** (trajets quotidiens, 2–3 par jour).

➡️ Conséquence produit : la phase actuelle est une **reprise après blessure**. Les insights doivent s'appuyer sur la progressivité du plan de reprise. Par exemple, une ACWR « basse » est normale ici et ne doit pas être signalée comme une alerte.

## 2. Campus Coach (9 outils, lecture seule)

| Outil | Données | Type |
|---|---|---|
| `get_active_goal` | objectif, dates, type, nb semaines, séances/sem., stats (prévues/faites, km, temps) | état actuel |
| `get_goal_history` | blocs/objectifs passés et futurs | historique + prévisionnel |
| `get_training_plan(start,end)` | semaines → séances : `weekId`, `sessionIndex`, nom, `trainingType` (EF, EF_LD, Intensity, SL, PPG, Special, Competition), `trainingCategory`, sport (`road`, `trailV2`, `ppg`), **statut** (`todo`/`done`/`skip`), difficulté 1–5, `importance`, durée/distance/D+ prévues ; par semaine : prévu vs réel (distance, durée), thème de cycle | historique + **prévisionnel** |
| `get_session_details(weekId, idx)` | description, conseil du coach, **blocs d'exercices** (répétitions, durée, allure cible en s/km, zone Z1–Z5/RECOVER, échauffement/retour au calme), `paceZones` à plat, **racingNote** (réalisé) | à la demande |
| `get_training_logs(start,end)` | séances faites + racingNote + commentaire/ressenti | historique |
| `get_logged_sessions` | activités importées (montre ou saisie manuelle) | historique |
| `get_paces` | allures EF / seuil 30 / seuil 60 / VMA, prédictions 5k→marathon, projections trail | état actuel |
| `get_stats_summary`, `get_running_diary` | totaux carrière, carnet d'objectifs | historique |

**Identifiants** : une séance est identifiée par `weekId` + `sessionIndex` (aucun identifiant de séance propre).

**Lien avec Garmin (clé du rapprochement)** : la `racingNote` d'une séance de course faite contient `source: "garmin"` et `externalId` = **identifiant de l'activité Garmin**, ainsi que distance, temps, allure, FC moyenne, cadence et D+.
→ Le rapprochement est **exact** dès que la séance est validée dans Campus. Les règles heuristiques ne servent que pour les séances pas encore validées.

**Renforcement (PPG)** :
- ✅ Disponible : nom de séance, description, conseil, blocs × répétitions, exercices (nom, **durée** par exercice, difficulté, matériel, variantes simplifiée/standard/avancée avec vidéos), récupération.
- ❌ Absent : **répétitions et charges réalisées**, groupes musculaires, exercices non faits. La validation est `source: "auto"` et ne porte que le temps total.
- → Le planifié vs réalisé du renforcement se limite à **fait / non fait + durée**. Les **groupes musculaires** viendront d'une table de correspondance nom d'exercice → muscles maintenue par l'app (par exemple « Chaise » → quadriceps/fessiers), marquée « à valider ». La progression en charge est **impossible** avec les données actuelles.

**Autres** : recommandations de nutrition par séance (non retenues en V1). Le vélo **n'est pas** dans le plan Campus : il apparaît uniquement côté Garmin, comme activité hors plan.

**Écriture** : aucune. Valider une séance passe probablement par l'association de l'`externalId` Garmin à la séance. L'appel exact reste à capturer (D18).

## 3. Garmin (~130 outils, dont ~40 d'écriture)

### Activités
| Outil | Données utiles |
|---|---|
| `get_activities_by_date` | id, nom, **type** (`running`, `treadmill_running`, `virtual_ride`, `e_bike_fitness`, `indoor_rowing`, `strength_training`, `walking`, `hiking`…), début, durée, distance, FC moy/max, calories, D+/D- |
| `get_activity(id)` | + vitesse moy/max, durée en mouvement, **puissance** (moy/max/NP, course comprise), cadence, foulée, temps de contact au sol, oscillation verticale, **Training Effect aérobie/anaérobie + label**, **training_load**, minutes d'intensité, impact Body Battery, **ressenti (`workout_feel`) et RPE**, nombre de tours |
| `get_activity_splits(id)` | tours avec durée, distance, vitesse, FC, cadence, puissance, `intensity_type` (ACTIVE/REST) et **`workout_step_index`** → comparaison intervalle par intervalle avec la séance Campus |
| `get_activity_hr_in_timezones(id)` | temps passé dans chaque zone FC |
| `get_activity_exercise_sets(id)` | ⚠️ inutilisable en pratique : catégorie `UNKNOWN`, sans nom ni charge |
| `get_activity_weather`, `get_activity_fit_data`… | disponibles, à la demande (V2) |

### Santé et récupération (par jour)
| Outil | Données |
|---|---|
| `get_training_readiness` | score 0–100, niveau, facteurs (sommeil, récupération, charge aiguë, VFC, stress, historique de sommeil) ; plusieurs instantanés par jour |
| `get_hrv_data` | VFC moyenne de la nuit, moyenne sur 7 j, **zone de base** (basse/haute), statut (BALANCED/UNBALANCED…) |
| `get_sleep_summary_range` | score, durée, phases, éveils, stress nocturne, VFC (≤ 90 nuits par appel) |
| `get_body_battery` | rechargé/consommé, événements (sommeil, activité, repos) |
| `get_stress_summary` | stress moyen/max, répartition repos/bas/moyen/élevé |
| `get_rhr_day`, `get_heart_rates` | FC de repos |
| `get_training_status` | statut (PRODUCTIVE, RECOVERY…), **charge aiguë/chronique, ACWR**, plage optimale, VO2max course **48,6** / vélo 48, répartition de la charge sur 4 sem. (aérobie basse/haute/anaérobie) |
| `get_training_load_trend` | série quotidienne ATL/CTL/TSB/ACWR (≤ 90 j) |
| `get_vo2max_trend` | VO2max quotidienne (≤ 90 j) |
| `get_race_predictions`, `get_personal_record` | prédictions 5k–marathon ; records (⚠️ `date` toujours vide, seul l'id d'activité est fourni) |
| `get_heart_rate_zones` | zones FC par sport (méthode réserve cardiaque, FC max 194, seuil 171) |
| `get_lactate_threshold`, `get_endurance_score`, `get_hill_score` | disponibles (non testés, V2 Progression) |

### Calendrier et écriture
- `get_scheduled_workouts` : **aucun workout planifié** dans le calendrier Garmin sur la période. Pourtant les tours portent un `workout_step_index`, ce qui veut dire que les séances Campus arrivent sur la montre par un autre canal (probablement l'API Training de Campus).
  → À vérifier avant D39/D40 : pousser la séance depuis l'app risque de **créer un doublon** sur la montre.
- Écriture disponible : `create_run_workout`, `create_run_interval_workout`, `upload_workout`, `schedule_workout`, `set_activity_name`, `set_activity_description`, `set_perceived_effort`, `set_activity_feel`, `delete_workout`… (+ poids, nutrition, hydratation : exclus en V1).

### Limites constatées
- ❌ `get_running_tolerance` : « Your device does not support this metric. »
- ⚠️ Charge chronique Garmin **figée à 219 pendant 44 jours**, alors que la charge aiguë varie de 104 à 307. La valeur semble gelée ou recalculée rarement. → On ne l'utilise pas telle quelle : l'app recalcule sa propre charge à partir du `training_load` de chaque activité, en affichant sa méthode.
- ⚠️ Nuits manquantes (ex. 05/10 absente : 7 nuits sur 8 renvoyées).
- ⚠️ Certaines activités Zwift ont **FC = 0** (capteur non relié) → charge cardio inconnue pour ces sorties, affichée comme « donnée indisponible ».
- ⚠️ Les marches quotidiennes (≈ 2–3 par jour) sont des activités Garmin : à exclure des listes d'entraînement et de la charge par défaut, et à compter à part.
- ⚠️ RPE et ressenti (`workout_rpe: 10`, `workout_feel: 50`) : l'échelle est à confirmer (RPE 10 sur une course de récupération à 120 bpm paraît incohérent, probablement une valeur par défaut ou ×10).

## 4. Synthèse : disponible vs manquant pour les exigences

| Exigence | Statut |
|---|---|
| Séance du jour, structure, intervalles, allures cibles, consignes | ✅ Campus |
| Planifié vs réalisé course (durée, distance, allure, FC) | ✅ rapprochement exact via `externalId` |
| Respect des intervalles | ✅ splits Garmin (`workout_step_index`) ↔ blocs Campus |
| FC cible prévue | ❌ Campus donne des **allures**, pas de FC → comparaison FC = zones Garmin seulement |
| Puissance prévue | ❌ (puissance réalisée ✅) |
| Renforcement : exercices prévus | ✅ ; réalisé détaillé (séries, répétitions, charge) ❌ |
| Groupes musculaires | ❌ source → table de correspondance propre à l'app |
| Vélo planifié | ❌ (hors plan Campus) ; vélo réalisé ✅ (Zwift) |
| Charge, statut, ACWR | ✅ Garmin (avec réserve sur la charge chronique) + recalcul propre |
| Sommeil, VFC, Body Battery, stress, FC repos, readiness | ✅ |
| VO2max, prédictions, records | ✅ (records sans date) |
| Mobilité, routines | ❌ aucune source → Cosmos (données propres à l'app) |
| Douleurs / blessure | ❌ aucune source. Le plan indique une reprise après blessure, sans localisation |

## 5. Questions ouvertes issues de l'audit

1. Campus pousse-t-il déjà ses séances sur la montre ? Si oui, D39 (pousser la séance vers Garmin) est redondant.
2. Faut-il intégrer un suivi douleur/gêne (zone + 0–10) puisqu'on est en reprise après blessure ? (Les exigences le prévoient en option, §26.)
3. L'ancien plan trail (séances `todo` depuis fin août) : à ignorer, ou à afficher comme non réalisé ?
