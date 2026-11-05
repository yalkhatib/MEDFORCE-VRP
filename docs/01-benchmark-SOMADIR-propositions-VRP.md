# MEDFORCE VRP – Propositions d'amélioration inspirées du CDC SOMADIR (SFA/CRM)

| | |
|---|---|
| **Sources** | CDC Cooper Pharma « Informatisation de la Promotion Pharmaceutique » · Synthèse des ateliers / Gap Analysis v3.2 · CDC et RC SOMADIR/SICAL SFA & CRM (version finale du 09/04/2024) · Écrans MedForce VM (web et tablette) |
| **Objet** | Identifier dans le CDC SOMADIR les fonctionnalités absentes ou moins abouties dans le périmètre Cooper, puis les adapter au métier de la promotion pharmaceutique (RP en pharmacie, ventes passant par la plateforme commandes et Sage X3) |
| **Statut** | Proposition à arbitrer avec Cooper Pharma |

---

## 1. Lecture comparative rapide

| Dimension | Cooper Pharma (VRP) | SOMADIR (FMCG) | À retenir pour MEDFORCE VRP |
|---|---|---|---|
| Modèle de vente | Prise de commande par le RP, traitement par les téléphonistes, transfert vers X3 | Vente en tournée par camion (cash ou crédit), prévente, livraison, GMS | **Pas de vente en tournée par camion.** On garde la logique de prévente, de contrôle et de workflow de dérogation |
| Moteur commercial | Très riche (packs, Core/Obligatoire/Reste, UG, condition clé) | Plus simple, avec des règles de ciblage et d'exclusion plus fines | Ajouter le ciblage, les exclusions, les répétitions maximales et la **dérogation par workflow** |
| Contrôles terrain | Peu de contrôles explicites | GPS, itinéraire, motif de non-respect, check-list de début de journée, clôture de journée | **Fort intérêt** : fiabiliser l'activité déclarée et alimenter les notes de frais |
| Crédit et recouvrement | Consultation de l'état de recouvrement, saisie des règlements | Encours commercial et financier, plafonds, balance âgée, relances multicanal, tâches de recouvrement envoyées vers le mobile | **Fort intérêt** |
| Réclamations | Workflow et e-mails | SLA, routage, escalade, notification du client, enquête de satisfaction | Intérêt moyen à fort |
| Marketing | Merchandising simple, événements | Enquêtes dynamiques, merchandising photo, campagnes, fidélisation | Enquêtes et merchandising : **fort**. Campagnes et fidélisation : phase 2 |
| Pilotage | KPI à définir sur maquettes | Catalogue de KPI très complet (couverture, succès, attrition, DSO…) | Reprendre et adapter le catalogue (§ 4) |
| Exigences techniques | Offline, SQL Server/PostgreSQL, sources livrées | Workflows et notifications, audit au champ, profils fins, dictionnaire de données, impression mobile, code-barres | Reprendre en exigences non fonctionnelles (§ 5) |

**Hors périmètre volontaire** (spécifique au FMCG ou peu pertinent pour Cooper) : stock camion et magasin mobile, bon de chargement et bouclage de stock véhicule, vente au comptant avec dotation vendeur, frais de timbre espèces, flux GMS (dépôt de liasses, planning des livreurs), veille des réseaux sociaux, analyse de share of voice.

---

## 2. Propositions fonctionnelles

Légende :
- **Priorité.** P1 : à intégrer au périmètre V1 ; P2 : lot 2 ; P3 : option.
- **Offline.** ✅ fonctionne hors connexion ; ⚠️ fonctionne hors connexion en mode dégradé, avec une file d'attente ; ❌ connexion requise.
- **Réf. SOMADIR** : numéros des exigences dans la grille SOMADIR.

### 2.1 Exécution terrain et contrôle de l'activité

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| T1 | **Check-in et check-out GPS de la visite** | Horodatage et position GPS au début et à la fin du rapport de visite. Rayon paramétrable autour des coordonnées de la pharmacie. Le contrôle peut être activé ou désactivé, par RP ou au niveau global. Un check-in hors zone est autorisé avec un motif, et la visite reçoit un flag « hors zone » | P1 | ✅ | 117, 122, C3 |
| T2 | **Géolocalisation de la pharmacie à la première visite** | Capture assistée des coordonnées GPS (champ « Localisation GPS » modifiable). Toute modification ultérieure passe par le workflow de validation de la fiche client | P1 | ✅ | 36 |
| T3 | **Carte des clients et tournée du jour ordonnancée** | Vue carte et liste ordonnée des pharmacies planifiées dans la journée (visites obligatoires en couleur), avec les pharmacies « à proximité » dans un rayon de X km. Navigation vers Google Maps ou Waze | P1 | ✅ (cartes en cache) | 96, 102, 361 |
| T4 | **Motif de non-respect du plan de tournée** | Si le RP visite des sous-secteurs non planifiés dans la journée, il saisit un motif codé (client prioritaire, optimisation de l'itinéraire, urgence, autre avec texte libre). Ce motif complète le flag « hors plan » demandé dans la Gap Analysis | P1 | ✅ | 163-164 |
| T5 | **Démarrage et clôture de journée** | *Début de journée* : check-list paramétrable (ex. tablette synchronisée, conditions commerciales à jour, KM compteur de départ). *Fin de journée* : KM d'arrivée et synthèse (visites, commandes, montant, règlements collectés, réclamations). Le KM compteur sert à **contrôler les KM déclarés dans la note de frais** (urbain et ville à ville, comme dans MedForce) | P1 | ✅ | 112-115, 167, 178 |
| T6 | **Photo liée à la visite** | Photos de vitrine, de linéaire ou de document, rattachées au rapport. Compression et envoi différé | P1 | ✅ | 118 |
| T7 | **Suivi en temps réel des RP par le responsable** | Carte au back-office avec la dernière position synchronisée, le % de réalisation de la journée et le nombre de visites. Strictement encadré par les profils, avec information du personnel (CNDP, loi 09-08) | P2 | ❌ | 106, 213 |
| T8 | **Proposition automatique d'itinéraire** | Ordre de passage optimisé à partir des coordonnées GPS des pharmacies planifiées, modifiable manuellement | P3 | ⚠️ | 97-99 |

### 2.2 Prise de commande et moteur commercial

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| C1 | **Suggestion automatique des packs applicables** | À l'ouverture d'une commande, ou à la confirmation, le système propose les packs éligibles pour le client et les produits saisis (« Vous êtes à 300 DH du palier suivant »). Les packs dont les conditions ne sont plus remplies après modification sont **retirés automatiquement**, avec un message | P1 | ✅ | 131, 154-156 |
| C2 | **Dérogation commerciale par workflow** | Le RP peut demander une remise, une UG, un dépassement de palier ou un mode de règlement hors politique. *En ligne* : validation en temps réel par le responsable (notification push). *Hors ligne* : la commande passe au statut « En attente de dérogation » et la demande part à la synchronisation. Le motif de déblocage (tarif, plafond, délai, mode de règlement, quantité) est **tracé et transmis à X3** | P1 | ⚠️ | 126-127, 145-147 |
| C3 | **Ciblage fin des packs** | Ciblage des packs par catégorie client, potentiel, politique commerciale, sous-secteur ou client, **avec une liste d'exclusions** et un **nombre maximal d'applications par client** sur la période de validité | P1 | ✅ | 71 |
| C4 | **Contrôle du plafond d'encours** | Plafond d'encours par client, importé de X3. Contrôle à la confirmation de la commande : l'encours commercial (commandes non facturées et factures non réglées) plus la commande en cours est comparé au plafond. En cas de dépassement, alerte et workflow de dérogation (C2). Le blocage X3 interdit la commande | P1 | ✅ (encours de la dernière synchronisation) | 143-145, 170, 341-344 |
| C5 | **Statuts et annulation de commande** | Cycle de vie explicite : Brouillon, Confirmée RP, Saisie, En cours, Validée, Transférée X3, Livrée (partiellement), Facturée, Annulée. L'annulation est soumise à un droit et à une validation, avec un motif | P1 | ✅ | 136-138 |
| C6 | **Numérotation hors connexion** | Séquence numérique **par terminal** (préfixe RP ou tablette) pour les commandes, les reçus et les réclamations, afin d'éviter les collisions hors ligne. Le numéro définitif est attribué par le back-office à la synchronisation | P1 | ✅ | 139, 148 |
| C7 | **Signature du pharmacien sur la tablette** | Signature électronique sur le bon de commande, le reçu de règlement, l'accusé de réception d'échantillons ou de matériel promotionnel et l'accusé de réception d'avantage. Le document PDF est généré et envoyé par e-mail après synchronisation | P2 | ✅ | 200 |
| C8 | **Impression mobile** | Impression Bluetooth (format 80 mm) du reçu de règlement ou du bon de commande, à la demande | P3 | ✅ | 201.5 |
| C9 | **Alertes produits prioritaires et ruptures** | Badges sur les produits prioritaires (champ « Priorité produit ») et tri par priorité. Alerte rupture ou stock insuffisant sans bloquer la saisie (stock X3 de la dernière synchronisation) | P1 | ✅ | 59, 123-125 |
| C10 | **Commandes multi-sociétés** | Si Cooper commercialise des produits de plusieurs entités juridiques, la commande est éclatée en plusieurs commandes X3 (une par société). **À confirmer avec Cooper** | P3 | ✅ | 122, 101.1 |

### 2.3 Recouvrement et risque client

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| R1 | **Tâches de relance envoyées au RP** | Le responsable ou l'équipe finance crée des tâches de recouvrement par client (facture, montant, échéance). Ces tâches apparaissent sur le mobile, et **un rappel s'affiche à l'ouverture de la visite** chez ce client | P1 | ✅ | 241-242, R1 |
| R2 | **Reçu de règlement numéroté et non modifiable** | Le reçu comporte : n°, date, client, factures lettrées, mode, n° de chèque ou d'effet, échéance, photo de la pièce. Un règlement validé ne peut plus être ni modifié ni supprimé | P1 | ✅ | 142, 148-152 |
| R3 | **Bordereau de remise des règlements** | Le RP regroupe les règlements collectés sur un bordereau de remise au siège ou à l'agence. Le contrôle compare les règlements saisis aux règlements remis, et tout écart est saisi avec un motif | P2 | ✅ | 177, 228 |
| R4 | **Balance âgée et encours** | Balance âgée (0-30, 31-60, 61-90, plus de 90 jours) par RP, secteur, région et client. Distinction entre encours commercial et encours financier. Délai moyen de règlement (DSO) | P1 | ❌ (BO) / ⚠️ (mobile, données synchronisées) | 216, 223, 229 |
| R5 | **Historique des relances et des incidents de paiement** | Historique par client des appels, visites et e-mails de relance, des impayés et des retards, avec leur valorisation. Visible dans l'onglet Recouvrement de la fiche client | P2 | ✅ | 218-219, 226, 239 |
| R6 | **Relances automatiques** | E-mail ou SMS de rappel X jours avant ou après l'échéance, à partir de modèles. Désactivable par client (case « Ne souhaite pas partager son GSM/Email ») | P3 | ❌ | 224-225, 238 |
| R7 | **Flag facture en litige** | Le marquage d'une facture « en litige » la relie à la réclamation correspondante et l'exclut des relances | P2 | ✅ | 214 |

### 2.4 Réclamations, retours et demandes pharmacies

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| D1 | **SLA et escalade** | Délai cible par type de réclamation ou de demande. Alertes à l'approche et au dépassement du délai, puis escalade hiérarchique automatique. Tableau de bord du respect des SLA | P1 | ❌ (BO) | 251, 256, 259 |
| D2 | **Routage automatique** | Destinataires déterminés par des règles (type, produit, région), comme l'existant, avec en plus des **files de traitement** et une affectation à un responsable | P2 | ❌ | 250 |
| D3 | **Suivi visible par le RP** | Chronologie de la réclamation sur le mobile (statut, réponse, avoir). Notification push au RP à chaque changement de statut | P1 | ✅ | 252 |
| D4 | **Plafond et analyse des retours** | Alerte si les retours d'une pharmacie ou d'un RP dépassent X % des quantités facturées sur la période. Statistiques par motif (périmé, casse, erreur de commande…) | P2 | ❌ | 244-249 |
| D5 | **Scan du code DataMatrix (GS1) des boîtes** | Lecture par la caméra du code produit, du **n° de lot** et de la **date de péremption** pour préremplir les réclamations, les retours et la **pharmacovigilance**. Fort gain de qualité de données, spécifique à la pharmacie | P1 | ✅ | 201.6 |
| D6 | **Enquête de satisfaction après clôture** | Court questionnaire envoyé ou rempli au passage suivant, une fois la réclamation clôturée | P3 | ✅ | 257 |

### 2.5 Enquêtes terrain et merchandising

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| E1 | **Générateur de formulaires d'enquête** | Formulaires dynamiques construits au back-office : types de champs (liste, nombre, photo, oui/non, prix), champs obligatoires et contrôles. Exemples : relevé des prix concurrents, présence ou rupture des produits Cooper et concurrents, nouveaux produits concurrents, logiciel de pharmacie | P1 | ✅ | 291-297 |
| E2 | **Ciblage et rappel en visite** | Une enquête est affectée à une liste de pharmacies (ciblage statique ou dynamique multicritère) sur une période. **Le formulaire est proposé automatiquement dans le rapport de visite** chez une pharmacie ciblée | P1 | ✅ | 292, R1, 157 |
| E3 | **Merchandising enrichi** | En plus du type d'action (vitrine, panneau, présentoir, linéaire) : nombre de facings, mètres linéaires, zone chaude ou froide, photo avant/après, concurrents présents. KPI de conformité et part de linéaire | P2 | ✅ | 307-313 |
| E4 | **Reconnaissance d'image** (option) | Analyse automatique des photos de linéaire : présence, facings, share of shelf | P3 | ❌ | 311 |
| E5 | **Analyse des enquêtes** | Restitution par axe (région, secteur, potentiel, concurrent), avec évolution dans le temps et export Excel | P2 | ❌ | 296 |

### 2.6 Actions spéciales et avantages pharmacie

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| A1 | **Demande d'action spéciale** | Demande d'un avantage hors grille : cadeau, matériel promotionnel spécifique, condition commerciale exceptionnelle (remise, délai, plafond), participation à un événement. Champs : type, valeur, potentiel attendu, justification, date limite. Workflow multi-niveaux | P2 | ⚠️ | 197-199 |
| A2 | **Remise et accusé de réception** | La remise au client est planifiée dans une visite. L'accusé de réception est signé sur la tablette (C7) et le **stock de matériel promotionnel MedForce** est mouvementé | P2 | ✅ | 201-203 |
| A3 | **Évaluation du ROI** | Comparaison du CA avant et après l'action spéciale avec le potentiel déclaré. Historique des avantages consultable dans la fiche client 360° | P2 | ❌ | 200 |

### 2.7 Objectifs, primes et pilotage individuel

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| O1 | **« Mon objectif » sur le mobile** | Objectif et réalisé en CA et en quantités par gamme, par mois, semaine et jour, avec le **reste à faire** et la projection en fin de période | P1 | ✅ | 205-212 |
| O2 | **Simulateur de prime** | Barèmes paramétrables par catégorie de RP (seuil minimum, % d'atteinte, paliers par gamme). Le RP voit sa prime prévisionnelle | P3 | ✅ | 88-89, 209, 212 |
| O3 | **Objectifs de visites et de couverture** | En plus du CA : nombre de visites et taux de couverture des pharmacies A et B sur le cycle | P1 | ✅ | — |

### 2.8 Prospection et nouvelles pharmacies

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| P1 | **Statut de cycle de vie du client** | Prospect (ciblage P), puis Client créé (non validé), puis Client validé sans code X3, puis Client actif X3, puis Inactif ou Perdu. Le code couleur est celui demandé dans la Gap Analysis | P1 | ✅ | 316 |
| P2 | **Contrôle GPS à la création** | La création d'une pharmacie hors des secteurs affectés au RP est refusée ou soumise à justification | P2 | ✅ | 36 |
| P3 | **Pipeline d'ouvertures** | Suivi des pharmacies en cours d'ouverture ou de reprise (changement de titulaire avec le code client remplaçant) : étape, date prévue, potentiel, actions | P3 | ✅ | 17-24 |
| P4 | **Motifs de non-commande structurés** | Ils existent déjà dans le CDC (pharmacien absent, surstock…). On ajoute **leur analyse** en KPI (§ 4) | P1 | ✅ | 26, 384 |

### 2.9 Fiche client 360° et collaboration

| # | Fonctionnalité | Adaptation MEDFORCE VRP | Prio | Offline | Réf. SOMADIR |
|---|---|---|---|---|---|
| F1 | **Chronologie unifiée** | Une seule chronologie par pharmacie : visites, commandes, règlements, réclamations, échantillons et matériel promotionnel, enquêtes, actions spéciales, événements | P1 | ✅ (N derniers mois) | 365 |
| F2 | **Contacts multiples catégorisés** | Titulaire, assistants, vendeurs, comptable, chacun avec son rôle et ses préférences de contact. Cela structure les champs déjà prévus dans le CDC | P1 | ✅ | 356 |
| F3 | **Segmentation dynamique** | Listes enregistrées multicritères réutilisables pour la planification, les enquêtes, les packs et les relances | P2 | ⚠️ | 357 |
| F4 | **Messagerie ciblée** | Le message MedForce existant est étendu à l'envoi par groupe (région, secteur, rôle). Le RP peut aussi écrire au siège depuis le terrain | P1 | ⚠️ | 119-120 |
| F5 | **Bibliothèque commerciale** | Argumentaires, fiches produits, FAQ, conditions commerciales en PDF, consultables hors ligne. Équivalent RP de l'E-ADV de MedForce | P2 | ✅ | 24 |

### 2.10 Synergies MedForce VM ↔ VRP (propositions MedForce)

Ces propositions ne figurent pas dans le CDC SOMADIR. Elles découlent de la double solution MedForce.

| # | Fonctionnalité | Description | Prio |
|---|---|---|---|
| S1 | **Écosystème autour de la pharmacie** | Au-delà de la « Proximité cabinet médical » (API médecins), affichage des médecins à proximité, de leur spécialité et de leur fréquence de visite VM. Le RP sait quels produits sont promus autour de la pharmacie | P2 |
| S2 | **Alerte de rupture vers les VM** | Une rupture ou absence d'un produit constatée en pharmacie (enquête E1 ou visite) est remontée aux VM du secteur, qui évitent de promouvoir un produit indisponible localement | P2 |
| S3 | **Référentiels partagés** | Sectorisation, produits et gammes, structures sanitaires, utilisateurs et hiérarchie, jours fériés, absences, notes de frais : un **socle commun** évite la double saisie | P1 |
| S4 | **Calendrier commun du trinôme** | Le DSM, le VM et le RP d'un même secteur peuvent voir leurs plannings respectifs (en lecture seule) pour coordonner les actions | P3 |

---

## 3. Points du CDC Cooper que le benchmark renforce

1. **Workflow de dérogation hors ligne** (C2). Le CDC Cooper bloque les commandes non conformes, sans prévoir de circuit d'exception. SOMADIR demande explicitement comment le workflow fonctionne en mode déconnecté. Il faut décrire ce circuit dès la conception.
2. **Retrait automatique des promotions devenues invalides** (C1). Ce comportement est indispensable avec le moteur de packs Cooper.
3. **Tâches de recouvrement envoyées au mobile** (R1). Le CDC Cooper se limite à la consultation de l'état de recouvrement.
4. **Exigences de numérotation et d'immutabilité** (C6, R2). Elles sont indispensables pour l'audit financier en mode offline.

---

## 4. Catalogue de KPI complémentaires (à intégrer aux maquettes demandées par Cooper)

| Domaine | KPI | Définition |
|---|---|---|
| Activité | Taux de couverture | Pharmacies visitées / pharmacies planifiées (par cycle, RP, secteur) |
| Activité | Taux de succès | Visites avec commande / visites réalisées |
| Activité | Taux de conformité au plan | Visites dans le plan de tournée / visites totales ; % de visites hors zone GPS |
| Activité | Clients sans commande lors de la dernière visite | Liste et nombre, par motif de non-commande |
| Activité | Répartition des motifs de non-commande | % par motif (surstock, absent, litige…) |
| Ventes | Taux d'activation | Clients ayant commandé sur la période / portefeuille |
| Ventes | Clients perdus et volume perdu | Clients actifs N-1 sans commande sur N (période glissante) |
| Ventes | Produits non vendus | Produits sans vente sur X jours, par secteur ou RP |
| Ventes | Ventes avec action spéciale ou dérogation | CA et % concernés, par motif de dérogation |
| Ventes | Panier moyen | CA / nombre de commandes, nombre moyen de lignes |
| Recouvrement | DSO | Délai moyen de règlement (global, RP, client) |
| Recouvrement | Taux de recouvrement | Encaissé / dû échu |
| Recouvrement | Taux de factures impayées | Factures échues non réglées / factures émises |
| Réclamations | Respect des SLA | % de réclamations traitées dans le délai cible |
| Réclamations | Taux de récurrence | Réclamations répétées (même client, produit ou motif) |
| Réclamations | Taux de retours | Quantités retournées / quantités facturées (client, RP) |
| Marketing | Taux de réponse aux enquêtes | Enquêtes réalisées / enquêtes ciblées |
| Marketing | Disponibilité en rayon | % de produits Cooper présents, issu des enquêtes |
| Marketing | Part de linéaire | Facings Cooper / facings totaux de la catégorie |
| Marketing | Prix moyen concurrent | Par produit et par région, issu des relevés de prix |

---

## 5. Exigences non fonctionnelles reprises du CDC SOMADIR

| # | Exigence | Application à MEDFORCE VRP |
|---|---|---|
| NF1 | **Moteur de workflows paramétrable** | Niveaux, valideurs, délais et escalade. Notifications in-app, push et e-mail. Validation en un clic depuis la notification. Utilisé pour la fiche client, la dérogation, l'action spéciale, la réclamation et la note de frais |
| NF2 | **Journal d'audit au niveau du champ** | Ancienne valeur, nouvelle valeur, auteur, date et terminal. Le CDC Cooper exige déjà l'historisation des affectations, des cycles et des planifications : à généraliser |
| NF3 | **Habilitations fines** | Droits par menu, action, champ et périmètre de données (secteurs, hiérarchie récursive). Séparation des droits de création, de validation et de transfert X3 |
| NF4 | **Politique de sécurité des comptes** | Complexité et expiration des mots de passe, verrouillage après N tentatives, blocage en masse, code PIN mobile, **effacement à distance des données de la tablette** |
| NF5 | **Dictionnaire de données et modèle physique** | Livrés et maintenus à jour, en cohérence avec l'obligation de livrer les sources |
| NF6 | **API REST documentée (OpenAPI)** | Les mêmes API servent le mobile, MedForce VM et X3. La couche d'interface X3 est découplée et utilise des files d'attente avec rejeu |
| NF7 | **Exports Excel et PDF** | Sur toutes les listes et tous les états |
| NF8 | **Supervision** | Console de suivi des synchronisations par terminal (dernière synchronisation, éléments en attente, erreurs), des interfaces X3 et des files de workflow |
| NF9 | **Sauvegarde à chaud et restauration** | Documentées pour SQL Server et pour PostgreSQL |
| NF10 | **Documentation et formation** | Guides utilisateur et administrateur en français, vidéos courtes, environnement de formation avec un jeu de données de test |
| NF11 | **Périphériques** | Caméra (photos, DataMatrix), GPS, imprimante Bluetooth (option) |
| NF12 | **Conformité CNDP (loi 09-08)** | Géolocalisation des collaborateurs et données des pharmaciens (consentement GSM et e-mail déjà prévu) |

---

## 6. Points à arbitrer avec Cooper Pharma

1. Le contrôle GPS (T1, P2) : est-il **bloquant** ou seulement **informatif** ? Faut-il l'activer pour tous les RP ?
2. Le suivi de position en temps réel des RP (T7) : est-il acceptable vis-à-vis des RH et de la CNDP ?
3. Les dérogations commerciales (C2) : qui valide quoi ? Avec quels plafonds par niveau ?
4. Les plafonds d'encours (C4) : existent-ils dans X3 ? Quelle est la règle de blocage ?
5. Le bordereau de remise des règlements (R3) : correspond-il au processus actuel ?
6. Les actions spéciales et avantages (§ 2.6) : sont-ils dans le périmètre V1 ou dans un lot 2 ?
7. Cooper a-t-il plusieurs sociétés ou entités juridiques à facturer séparément (C10) ?
8. Faut-il prévoir l'impression mobile (C8) ou suffit-il d'envoyer un PDF par e-mail ?

---

## 7. Proposition de découpage en lots

| Lot | Contenu |
|---|---|
| **V1 (socle CDC Cooper et Gap Analysis)** | Le socle CDC et Gap Analysis, plus : T1-T6, C1-C6, C9, R1, R2, R4, D1, D3, D5, E1, E2, O1, O3, P1, P4, F1, F2, F4, S3 et NF1-NF12 |
| **Lot 2** | T7, C7, R3, R5, R7, D2, D4, E3, E5, A1-A3, P2, F3, F5, S1, S2 |
| **Options** | T8, C8, C10, R6, D6, E4, O2, P3, S4 |
