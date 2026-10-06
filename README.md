# NSA — Nintendo Switch Activities

Affiche automatiquement dans ton statut Discord (Rich Presence, le « Joue à … » sous ton pseudo) le jeu auquel tu joues sur ta Nintendo Switch ou Switch 2.

```
Nintendo Switch Online ──(liste d'amis du compte partagé, toutes les 45 s)──► server/ sur Alwaysdata
server/ ──(GET /presence + token de l'agent, toutes les 20 s)──► agent/ sur le PC de chaque utilisateur
agent/ ──(IPC locale)──► client Discord desktop ──► « Joue à Nintendo Switch »
```

- **Un compte Nintendo partagé** (« NSA Presence ») est ami avec tous les utilisateurs. Un seul appel à l'API Nintendo récupère la présence de tout le monde.
- **`server/`** (hébergé sur Alwaysdata) gère les inscriptions et sert à chaque agent la présence de son propre compte, et uniquement celle-là.
- **`agent/`** est un exécutable autonome pour Windows et Linux. Il met à jour la Rich Presence du client Discord local, sans dépendance et sans toucher au compte Discord (pas de self-bot).

L'inscription prouve que tu possèdes le compte Nintendo : le compte partagé t'envoie une demande d'ami, et seul le propriétaire du compte peut l'accepter.

## Sommaire

- [Utiliser NSA](#utiliser-nsa)
- [Héberger le service (opérateur)](#héberger-le-service-opérateur)
- [Référence](#référence) : API, configuration, limites, sécurité, dépannage
- [Confidentialité](PRIVACY.md)

## Utiliser NSA

### Prérequis

- Windows ou Linux (x64), avec le client Discord **desktop** (l'application web ne gère pas la Rich Presence).
- Sur ta Switch, ton **statut en ligne visible par tes amis** (paramètres du profil) et la **réception des demandes d'ami activée**.
- Ton code ami, visible en sélectionnant ton icône de profil sur la Switch (`SW-1234-5678-9012`).

### Installation

1. Télécharge l'exécutable dans les [Releases](../../releases) : `nsa-agent-windows-x64.exe` ou `nsa-agent-linux-x64`.
2. Lance-le :
   - **Windows** : double-clic. Windows SmartScreen peut avertir que l'application n'est pas signée : *Informations complémentaires > Exécuter quand même*.
   - **Linux** : `chmod +x nsa-agent-linux-x64 && ./nsa-agent-linux-x64`.
3. Saisis ton code ami. Le compte « NSA Presence » t'envoie une demande d'ami : sur ta Switch, ouvre ton profil > *Ajouter un ami* > *Demandes d'ami reçues*, et accepte-la. L'agent le détecte en une minute environ.
4. L'agent s'installe et démarre automatiquement à chaque ouverture de session. Tu peux supprimer le fichier téléchargé : il a été copié dans `%LOCALAPPDATA%\nsa-agent\` (Windows) ou `~/.local/bin/` (Linux).

C'est tout : lance un jeu et garde Discord ouvert.

### Commandes

| Commande | Rôle |
|---|---|
| `nsa-agent` | première fois : inscription et installation ; ensuite : état et aide |
| `nsa-agent pair [code-ami]` | relier cet ordinateur à ton compte Nintendo |
| `nsa-agent install` / `uninstall` | activer / désactiver le démarrage automatique (et démarrer / arrêter l'agent) |
| `nsa-agent export` / `import [code]` | transférer ton inscription vers un autre ordinateur |
| `nsa-agent unpair` | te désinscrire : le serveur oublie ton compte et le compte partagé te retire de ses amis |
| `nsa-agent run` | lancer l'agent au premier plan (débogage) |

### Changer d'ordinateur ou perdre son inscription

- **Avec l'ancien ordinateur** : `nsa-agent export` affiche un code secret à utiliser sur le nouveau avec `nsa-agent import`.
- **Sans l'ancien ordinateur** : retire « NSA Presence » de tes amis sur la Switch, puis relance `nsa-agent pair`. L'ancienne inscription est remplacée.

### Désinstaller

```sh
nsa-agent unpair      # facultatif : supprime ton inscription
nsa-agent uninstall
```

Puis supprime l'exécutable et le dossier de configuration : `%APPDATA%\nsa-agent` (Windows) ou `~/.config/nsa-agent` (Linux).

## Héberger le service (opérateur)

### 1. Créer le compte Nintendo partagé

1. Crée un compte sur <https://accounts.nintendo.com> avec une adresse dédiée, une date de naissance d'adulte, un pseudo neutre (« NSA Presence ») et aucune donnée personnelle.
2. **Lie-le une fois à une console** (*Paramètres > Utilisateurs > Ajouter un utilisateur*) : l'API refuse un compte jamais lié (`NSA_NOT_LINKED`). Aucun abonnement n'est nécessaire. Note son code ami, puis supprime l'utilisateur de la console : l'API continue de fonctionner.

> **Risque** : exploiter l'API non officielle de l'app Nintendo Switch Online pour un service public sort des conditions d'utilisation de Nintendo, et le compte partagé (code ami public, nombreuses demandes d'ami) est exposé à une sanction. Aucun bannissement de console lié à cet usage n'est connu, mais Nintendo garde la trace de la console où le compte a été lié. Pour ne prendre aucun risque avec ta console principale, fais la liaison sur une autre console. Si le compte partagé est sanctionné, tous les utilisateurs perdent leur présence jusqu'à son remplacement.

### 2. Enregistrer un client nxapi-auth

La connexion à l'API Nintendo nécessite un jeton généré par un service tiers ([nxapi-znca-api](https://github.com/samuelthomas2774/nxapi-znca-api)), qui exige depuis juin 2025 que chaque programme s'identifie. Enregistre un client sur <https://nxapi-auth.fancy.org.uk/oauth/clients> : son identifiant sera `NXAPI_ZNCA_API_CLIENT_ID`. Ce service ne reçoit que les jetons du compte partagé, jamais ceux des utilisateurs.

### 3. Obtenir le session token du compte partagé

En local, une seule fois :

```sh
cd server
npm ci && npm run build
npm run login
```

Ouvre l'URL affichée, connecte-toi avec le **compte partagé**, puis fais un clic droit sur **« Sélectionner ce compte »** et colle le lien (`npf71b963c1b7b6d119://auth…`). Le script affiche le session token (valable environ 2 ans) : c'est un secret.

### 4. Créer l'application Discord

1. Sur <https://discord.com/developers/applications>, clique sur **New Application**. Son nom est ce qui s'affiche après « Joue à », par exemple « Nintendo Switch ».
2. Note l'**Application ID**.
3. Dans *Rich Presence > Art Assets*, ajoute une image nommée **`switch`**, utilisée quand Nintendo ne fournit pas l'image du jeu.

### 5. Déployer le serveur sur Alwaysdata

1. **Node.js** : dans l'administration, *Environnement > Node.js*, choisis **22**.
2. **Code**, en SSH :

   ```sh
   git clone https://github.com/DamienFoulon/NSA.git ~/nsa
   cd ~/nsa/server
   npm ci && npm run build
   cp .env.example .env && chmod 600 .env
   nano .env   # NSO_SESSION_TOKEN et NXAPI_ZNCA_API_CLIENT_ID
   ```

3. **Site** : *Web > Sites > Ajouter un site* :
   - **Adresses** : par exemple `nsa.<compte>.alwaysdata.net` ;
   - **Type** : Node.js ;
   - **Commande** : `node --env-file=/home/<compte>/nsa/server/.env /home/<compte>/nsa/server/dist/src/index.js` ;
   - **Répertoire de travail** : `/home/<compte>/nsa/server` (les inscriptions sont stockées dans `data/users.json`) ;
   - **Paramètres avancés > Durée d'inactivité** : `0`, pour que le polling et les inscriptions continuent même sans requête ;
   - onglet **SSL** : active la redirection HTTP vers HTTPS.
4. **Vérifie** : `curl https://nsa.<compte>.alwaysdata.net/health`.

Les logs sont dans `~/admin/logs/sites/`. Pour mettre à jour : `cd ~/nsa && git pull && cd server && npm ci && npm run build`, puis redémarre le site.

### 6. Publier l'agent

1. Dans le dépôt GitHub, *Settings > Secrets and variables > Actions > Variables*, crée :
   - `NSA_SERVER_URL` : `https://nsa.<compte>.alwaysdata.net` ;
   - `NSA_DISCORD_CLIENT_ID` : l'Application ID Discord.
2. Pousse un tag : `git tag agent-v0.2.0 && git push origin agent-v0.2.0`. Le workflow [`release-agent.yml`](.github/workflows/release-agent.yml) construit les exécutables Linux et Windows (Node.js « single executable application »), les teste et les publie dans une release avec leurs sommes SHA-256.

Pour construire localement : `cd agent && npm ci && NSA_SERVER_URL=… NSA_DISCORD_CLIENT_ID=… npm run build:sea` (exécutable pour la plateforme courante dans `dist/sea/`). Les exécutables pèsent environ 120 Mo, car ils embarquent Node.js.

### Tester sans Nintendo (mode mock)

```sh
cd server && npm run start:mock
```

Le compte partagé est simulé : tous les codes amis existent sauf `0000-0000-0000`, les demandes d'ami sont acceptées au bout de 10 secondes, et la présence change chaque minute. Côté agent : `NSA_SERVER_URL=http://127.0.0.1:8080 DISCORD_CLIENT_ID=<id> node dist/src/index.js pair 1234-5678-9012`.

## Référence

### API du serveur

| Route | Auth | Description |
|---|---|---|
| `GET /health` | — | `200 {"status":"ok"}` |
| `POST /pairings` `{"friendCode":"SW-…"}` | — (limité par IP) | envoie la demande d'ami : `201 {"id","status":"pending","name","expiresAt"}` |
| `GET /pairings/:id` | l'`id` | `pending`, puis `linked` avec le token (remis une seule fois), ou `expired` |
| `GET /presence` | `Bearer <token>` | présence du compte lié |
| `DELETE /me` | `Bearer <token>` | désinscription (`204`) |

Erreurs d'appairage (`{"error","message"}`) : `invalid_friend_code` (400), `friend_code_not_found` (404), `already_friends` (409 : retirer le compte partagé de ses amis puis recommencer), `pairing_in_progress` (409), `too_many_requests` (429), `daily_limit_reached` et `not_ready` (503), `friend_request_failed` (502).

`GET /presence` :

```json
{
  "state": "playing",
  "game": { "name": "Mario Kart World", "imageUrl": "https://…" },
  "platform": "switch2",
  "since": "2026-10-06T12:00:00.000Z",
  "updatedAt": "2026-10-06T12:34:56.000Z",
  "stale": false,
  "linked": true
}
```

| Champ | Description |
|---|---|
| `state` | `playing` : un jeu est lancé (en ligne ou non) ; `online` : console allumée, aucun jeu ; `offline` |
| `game`, `platform` | jeu en cours et console (`switch` / `switch2`), `null` hors jeu |
| `since` | début de la partie, estimé à partir de l'heure de mise à jour de la présence chez Nintendo |
| `updatedAt` | dernier poll Nintendo réussi |
| `stale` | `true` si ce poll date de plus de 3 minutes : l'agent efface alors la présence |
| `linked` | `false` si le compte n'est plus ami avec le compte partagé |

Correspondance avec les états Nintendo : `ONLINE` et `PLAYING` deviennent `playing`, `INACTIVE` devient `online`, `OFFLINE` devient `offline`.

### Configuration du serveur

Voir [`server/.env.example`](server/.env.example).

| Variable | Défaut | Description |
|---|---|---|
| `NSO_SESSION_TOKEN` | — | session token du compte partagé |
| `NXAPI_ZNCA_API_CLIENT_ID` | — | client nxapi-auth (`NXAPI_ZNCA_API_CLIENT_SECRET` pour un client confidentiel) |
| `POLL_INTERVAL_SECONDS` | 45 | intervalle de poll, 30 minimum |
| `DATA_DIR` | `data` | dossier de `users.json` |
| `PAIRING_TTL_MINUTES` | 60 | délai pour accepter la demande d'ami |
| `MAX_FRIEND_REQUESTS_PER_DAY` | 30 | demandes d'ami envoyées par jour (inscriptions ouvertes) |
| `MAX_PAIRINGS_PER_IP_PER_HOUR` | 5 | tentatives d'inscription par IP et par heure |
| `MOCK` | — | `1` pour simuler le compte Nintendo |
| `IP` / `HOST`, `PORT` | `127.0.0.1:8080` | fournis par Alwaysdata |

### Configuration de l'agent

L'adresse du serveur et l'Application ID Discord sont intégrés à l'exécutable. Les variables `NSA_SERVER_URL`, `DISCORD_CLIENT_ID`, `POLL_INTERVAL_SECONDS` (20 par défaut, 15 minimum) et `DISCORD_FALLBACK_IMAGE` (`switch` par défaut) permettent de les remplacer, par exemple pour utiliser un autre serveur. L'inscription est enregistrée dans `config.json` (`%APPDATA%\nsa-agent` ou `~/.config/nsa-agent`, lisible par l'utilisateur seul).

### Limites et comportement

- **300 amis maximum** sur un compte Nintendo, donc 300 utilisateurs au plus par compte partagé.
- **Nintendo** : un seul poll toutes les 30 s minimum pour tout le monde. En cas d'erreur, le délai double à chaque échec (jusqu'à 15 min). Si le session token est révoqué, le serveur arrête de poller et `/presence` passe en `stale` : relance `npm run login`, mets à jour `.env` et redémarre le site.
- **Maintenance horaire** : les demandes d'ami non acceptées sont annulées, et les amis qui ne sont reliés à aucun agent (demande acceptée trop tard, désinscription) sont retirés.
- **Discord** : l'agent n'envoie une mise à jour que lorsque l'activité change, et la présence disparaît quand il s'arrête. Sans Discord, il réessaie toutes les 5 s, puis de plus en plus espacé, jusqu'à une fois par minute.
- **nxapi** : la dernière version stable sur npm (1.6.1, 2023) ne fonctionne plus avec l'API Nintendo ; le serveur utilise la préversion `1.6.1-next.257`, épinglée exactement. Une mise à jour de l'app Nintendo Switch Online peut imposer une préversion plus récente.

### Sécurité

- Les tokens des agents sont aléatoires (256 bits) et le serveur n'en stocke que l'empreinte SHA-256 (`users.json` en mode 600).
- Un agent ne peut lire que la présence du compte qu'il a prouvé posséder en acceptant la demande d'ami.
- Inscriptions ouvertes : tentatives limitées par IP (adresse prise dans le dernier élément de `X-Forwarded-For` ajouté par le proxy Alwaysdata) et plafond quotidien de demandes d'ami.
- Le session token du compte partagé n'apparaît jamais dans les logs. **N'active pas `DEBUG=nxapi:*`** en production : les logs de debug de nxapi affichent les tokens.
- L'agent n'a aucune dépendance d'exécution. Le serveur dépend uniquement de nxapi ; `npm audit` signale des vulnérabilités dans des paquets que nxapi installe (`sharp`, `uuid` via `node-notifier`) mais que le serveur ne charge jamais.
- Les exécutables ne sont pas signés : vérifie-les avec `SHA256SUMS.txt` de la release.

### Dépannage

| Symptôme | Piste |
|---|---|
| `friend_code_not_found` | code ami mal saisi |
| `already_friends` | retire « NSA Presence » de tes amis sur la Switch, puis recommence |
| `friend_request_failed` | réception des demandes d'ami désactivée sur la Switch, ou liste d'amis pleine |
| La présence reste `offline` alors que tu joues | statut en ligne masqué pour tes amis (paramètres du profil Switch) |
| L'agent indique `no running Discord client found` | Discord desktop n'est pas lancé, ou c'est une version Snap/Flatpak isolée |
| Côté serveur, `NSA_NOT_LINKED` | le compte partagé n'a jamais été lié à une console |
| Côté serveur, erreurs de génération du jeton `f` | client nxapi-auth absent ou invalide |

## Licence

- `server/` : [AGPL-3.0-or-later](server/LICENSE), comme nxapi dont il dépend.
- Le reste du dépôt (dont `agent/`) : [Apache-2.0](LICENSE).
