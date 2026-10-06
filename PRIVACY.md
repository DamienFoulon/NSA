# Confidentialité

Cette page décrit les données traitées par le service NSA. L'opérateur du serveur doit la compléter avec ses coordonnées avant d'ouvrir le service.

**Responsable du traitement** : *(à compléter par l'opérateur : nom et adresse de contact)*

## Données traitées

| Donnée | Pourquoi | Où, combien de temps |
|---|---|---|
| Identifiant de compte réseau Nintendo (NSA ID) et pseudo Switch | savoir quelle présence envoyer à quel agent | `users.json` sur le serveur, jusqu'à la désinscription |
| Empreinte du token de l'agent | authentifier l'agent | `users.json`, jusqu'à la désinscription |
| Date d'inscription | suivi du service | `users.json`, jusqu'à la désinscription |
| Présence (jeu en cours, console, début de partie) | l'afficher sur Discord | en mémoire uniquement, remplacée à chaque poll ; aucun historique |
| Code ami saisi à l'inscription | envoyer la demande d'ami | utilisé immédiatement, non conservé |
| Adresse IP | limiter les abus à l'inscription | en mémoire, une heure ; journaux de l'hébergeur |

Le serveur ne reçoit aucune donnée Discord. L'agent communique avec le client Discord uniquement sur ton ordinateur.

## Tiers

- **Nintendo** : le compte partagé est ton ami ; il voit ta présence comme n'importe quel ami.
- **nxapi-znca-api** : ce service tiers, nécessaire pour se connecter à l'API Nintendo, reçoit les jetons du compte partagé, jamais les tiens.
- **Alwaysdata** héberge le serveur.

## Tes droits

- **Te désinscrire** : `nsa-agent unpair`. Le serveur supprime ton entrée et le compte partagé te retire de ses amis.
- Retirer « NSA Presence » de tes amis sur la Switch arrête immédiatement le partage de ta présence, mais ton entrée reste enregistrée jusqu'à `nsa-agent unpair`.
- Pour toute autre demande (accès, rectification, suppression), contacte le responsable du traitement.
