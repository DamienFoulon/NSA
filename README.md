# NSA — Nintendo Switch Activities

Affiche automatiquement dans ton statut Discord (Rich Presence, le « Joue à … » sous ton pseudo) le jeu auquel tu joues sur ta Nintendo Switch ou Switch 2.

```
Nintendo Switch Online ──(liste d'amis du compte secondaire, toutes les 45 s)──► server/ sur Alwaysdata
server/ ──(GET /presence + Bearer token, toutes les 20 s)──► agent/ sur ton PC
agent/ ──(IPC locale)──► client Discord desktop ──► « Joue à Nintendo Switch »
```

- **`server/`** : service Node.js hébergé sur Alwaysdata. Il se connecte à Nintendo Switch Online avec un **compte Nintendo secondaire** (via [nxapi](https://github.com/samuelthomas2774/nxapi)), lit ta présence dans sa liste d'amis et l'expose sur `GET /presence`.
- **`agent/`** : petit programme qui tourne sur ton PC, interroge le serveur et met à jour la Rich Presence du client Discord local par IPC. Aucune dépendance d'exécution : le protocole IPC est implémenté directement d'après la [documentation Discord](https://docs.discord.com/developers/topics/rpc).

Ton compte Nintendo principal n'est jamais utilisé, et rien ne touche à ton compte Discord en dehors du client officiel (pas de self-bot).

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Créer le compte Nintendo secondaire](#2-créer-le-compte-nintendo-secondaire)
3. [Enregistrer un client nxapi-auth](#3-enregistrer-un-client-nxapi-auth)
4. [Obtenir le session token et l'identifiant de ton compte](#4-obtenir-le-session-token-et-lidentifiant-de-ton-compte)
5. [Créer l'application Discord](#5-créer-lapplication-discord)
6. [Déployer le serveur sur Alwaysdata](#6-déployer-le-serveur-sur-alwaysdata)
7. [Installer l'agent](#7-installer-lagent)
8. [Référence](#8-référence) : API, configuration, mode mock, sécurité, dépannage

## 1. Prérequis

- **Node.js 22** (LTS, 22.9 ou plus récent), en local et sur Alwaysdata (`.nvmrc` à la racine).
- Un compte Alwaysdata.
- Le client Discord **desktop** sur le PC (l'application web ne permet pas la Rich Presence).

## 2. Créer le compte Nintendo secondaire

Nintendo ne renvoie plus la présence du compte connecté lui-même : le serveur lit ta présence depuis la liste d'amis d'un second compte.

1. Crée un compte sur <https://accounts.nintendo.com> avec une autre adresse e-mail. Indique une date de naissance d'adulte (les comptes enfants sont restreints).
2. **Lie-le une fois à une console** : sur ta Switch, *Paramètres > Utilisateurs > Ajouter un utilisateur*, puis associe ce compte Nintendo. L'API refuse un compte qui n'a jamais été lié à une console (erreur `NSA_NOT_LINKED`). Tu peux supprimer l'utilisateur de la console ensuite. Un abonnement Nintendo Switch Online n'est **pas** nécessaire.
3. Depuis ce nouvel utilisateur, envoie une demande d'ami à ton compte principal (code ami), puis accepte-la depuis ton compte principal.
4. Sur ton compte principal, vérifie dans les paramètres du profil que ton **statut en ligne est visible par tes amis** (ou par tes amis favoris, en ajoutant le compte secondaire en favori).

## 3. Enregistrer un client nxapi-auth

Le login à l'API Nintendo nécessite un jeton (`f`) généré par un service tiers ([nxapi-znca-api](https://github.com/samuelthomas2774/nxapi-znca-api)). Depuis juin 2025, ce service exige que chaque programme qui l'utilise s'identifie.

1. Enregistre un client sur <https://nxapi-auth.fancy.org.uk/oauth/clients>.
2. Note son identifiant : ce sera `NXAPI_ZNCA_API_CLIENT_ID` (et `NXAPI_ZNCA_API_CLIENT_SECRET` si tu crées un client confidentiel).

> Ce service reçoit le jeton d'identification Nintendo du compte **secondaire** à chaque login, c'est aussi pour ça qu'on n'utilise pas ton compte principal.

## 4. Obtenir le session token et l'identifiant de ton compte

À faire **une seule fois, en local** :

```sh
cd server
npm ci
npm run build
npm run login
```

1. Ouvre l'URL affichée et connecte-toi avec le **compte secondaire**.
2. Sur la page « Associer un compte externe », fais un clic droit sur **« Sélectionner ce compte »** et copie le lien (il commence par `npf71b963c1b7b6d119://auth`).
3. Colle-le dans le terminal : le script affiche le **session token**. C'est un secret (valable environ 2 ans) : ne le commite pas, ne le partage pas.

Trouve ensuite l'identifiant de ton compte principal dans la liste d'amis :

```sh
cp .env.example .env    # puis renseigne NSO_SESSION_TOKEN et NXAPI_ZNCA_API_CLIENT_ID
npm run list-friends
```

Copie la valeur `nsaId=…` de ton compte principal : ce sera `NSO_FRIEND_NSA_ID`.

## 5. Créer l'application Discord

1. Sur <https://discord.com/developers/applications>, clique sur **New Application**. Le **nom de l'application** est ce qui s'affiche après « Joue à » : par exemple « Nintendo Switch ».
2. Copie l'**Application ID** (page *General Information*) : ce sera `DISCORD_CLIENT_ID` dans l'agent.
3. Dans *Rich Presence > Art Assets*, ajoute une image nommée **`switch`**. Elle sert quand Nintendo ne fournit pas d'image pour le jeu (sinon l'agent utilise directement l'image du jeu renvoyée par Nintendo).

## 6. Déployer le serveur sur Alwaysdata

### Installation

1. **Version de Node** : dans l'administration, *Environnement > Node.js*, choisis **22**.
2. **Récupère le code** en SSH (*Accès distant > SSH* pour activer l'accès) :

   ```sh
   git clone https://github.com/DamienFoulon/NSA.git ~/nsa
   cd ~/nsa/server
   npm ci
   npm run build
   ```

3. **Configuration** : crée le fichier `.env`, lisible par toi seul :

   ```sh
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```

   Renseigne `PRESENCE_TOKEN` (génère-le avec `openssl rand -hex 32`), `NSO_SESSION_TOKEN`, `NSO_FRIEND_NSA_ID` et `NXAPI_ZNCA_API_CLIENT_ID`. Ne définis pas `IP` ni `PORT` : Alwaysdata les fournit.

4. **Crée le site** dans *Web > Sites > Ajouter un site* :
   - **Adresses** : par exemple `nsa.<compte>.alwaysdata.net` ;
   - **Type** : Node.js ;
   - **Commande** : `node --env-file=/home/<compte>/nsa/server/.env /home/<compte>/nsa/server/dist/src/index.js` ;
   - **Répertoire de travail** : `/home/<compte>/nsa/server` ;
   - **Paramètres avancés > Durée d'inactivité** : `0`, pour que le polling Nintendo ne soit jamais arrêté. Avec la valeur par défaut, Alwaysdata arrête le process quand plus aucune requête n'arrive (PC éteint) : ça fonctionne aussi, mais la première réponse après le réveil sera `stale`.
   - Dans l'onglet **SSL**, active la redirection HTTP vers HTTPS. Le certificat est géré par Alwaysdata.

5. **Vérifie** :

   ```sh
   curl https://nsa.<compte>.alwaysdata.net/health
   curl -H "Authorization: Bearer <PRESENCE_TOKEN>" https://nsa.<compte>.alwaysdata.net/presence
   ```

Les logs du site sont dans `~/admin/logs/sites/`. Le serveur écoute sur les variables `IP` (ou `HOST`) et `PORT` fournies par Alwaysdata et consomme environ 60 à 80 Mo de RAM.

### Mise à jour

```sh
cd ~/nsa && git pull
cd server && npm ci && npm run build
```

Puis redémarre le site depuis l'administration (*Web > Sites*, bouton de redémarrage).

## 7. Installer l'agent

```sh
cd agent
npm ci
npm run build
cp .env.example .env    # puis renseigne PRESENCE_URL, PRESENCE_TOKEN et DISCORD_CLIENT_ID
npm start
```

`PRESENCE_URL` est l'URL complète du endpoint, par exemple `https://nsa.<compte>.alwaysdata.net/presence`. L'agent peut démarrer avant Discord : il s'y connecte dès que Discord est lancé.

### Démarrage automatique sous Windows

**Option 1 : tâche planifiée** (lancée à l'ouverture de session, sans fenêtre). Dans PowerShell, depuis le dossier `agent` :

```powershell
powershell -ExecutionPolicy Bypass -File install\install-windows-task.ps1
Start-ScheduledTask -TaskName 'NSA Presence Agent'
```

Pour la retirer : `Unregister-ScheduledTask -TaskName 'NSA Presence Agent'`.

**Option 2 : dossier Démarrage.** Appuie sur `Win + R`, tape `shell:startup`, et crée dans ce dossier un raccourci vers `agent\install\start-agent.vbs`.

Dans les deux cas, les logs sont écrits dans `agent\agent.log` et `node` doit être dans le `PATH`.

### Démarrage automatique sous Linux (service utilisateur systemd)

```sh
mkdir -p ~/.config/systemd/user
cp install/nsa-agent.service ~/.config/systemd/user/
# Adapte WorkingDirectory (dossier agent) et ExecStart (chemin absolu de node, voir `command -v node`)
nano ~/.config/systemd/user/nsa-agent.service
systemctl --user daemon-reload
systemctl --user enable --now nsa-agent
journalctl --user -u nsa-agent -f
```

Les versions Snap et Flatpak de Discord placent leur socket IPC dans leur propre dossier : l'agent essaie aussi ces emplacements, sans garantie selon l'isolation de ta distribution.

## 8. Référence

### API du serveur

`GET /health` : `200 {"status":"ok"}`, sans authentification.

`GET /presence` : header `Authorization: Bearer <PRESENCE_TOKEN>` obligatoire (sinon `401`).

```json
{
  "state": "playing",
  "game": { "name": "Mario Kart World", "imageUrl": "https://…" },
  "platform": "switch2",
  "since": "2026-10-06T12:00:00.000Z",
  "updatedAt": "2026-10-06T12:34:56.000Z",
  "stale": false
}
```

| Champ | Description |
|---|---|
| `state` | `playing` : un jeu est lancé (en ligne ou non) ; `online` : console allumée, aucun jeu ; `offline` : console éteinte ou hors ligne |
| `game` | jeu en cours, `null` si `state` ≠ `playing` |
| `platform` | `switch`, `switch2`, ou `null` si aucun jeu |
| `since` | début de la partie, estimé à partir de l'heure de mise à jour de la présence chez Nintendo |
| `updatedAt` | date du dernier poll Nintendo réussi |
| `stale` | `true` si le dernier poll réussi date de plus de 3 minutes (l'agent efface alors la présence) |

Correspondance avec les états Nintendo : `ONLINE` et `PLAYING` (en jeu, hors ligne ou en ligne) deviennent `playing`, `INACTIVE` devient `online`, `OFFLINE` devient `offline`.

### Configuration

**`server/`** (voir [`server/.env.example`](server/.env.example))

| Variable | Description |
|---|---|
| `PRESENCE_TOKEN` | secret partagé avec l'agent, 32 caractères minimum |
| `NSO_SESSION_TOKEN` | session token du compte Nintendo secondaire |
| `NSO_FRIEND_NSA_ID` | NSA ID de ton compte principal dans la liste d'amis |
| `NXAPI_ZNCA_API_CLIENT_ID` | identifiant du client nxapi-auth (`NXAPI_ZNCA_API_CLIENT_SECRET` pour un client confidentiel) |
| `POLL_INTERVAL_SECONDS` | intervalle de poll, 45 par défaut, 30 minimum |
| `MOCK` | `1` pour servir une présence fictive |
| `IP` / `HOST`, `PORT` | fournis par Alwaysdata ; `127.0.0.1:8080` par défaut en local |

**`agent/`** (voir [`agent/.env.example`](agent/.env.example))

| Variable | Description |
|---|---|
| `PRESENCE_URL` | URL complète de `/presence` |
| `PRESENCE_TOKEN` | même valeur que côté serveur |
| `DISCORD_CLIENT_ID` | Application ID de l'app Discord |
| `POLL_INTERVAL_SECONDS` | intervalle de poll, 20 par défaut, 15 minimum |
| `DISCORD_FALLBACK_IMAGE` | asset utilisé quand le jeu n'a pas d'image, `switch` par défaut |

### Mode mock

Pour tester l'agent sans Nintendo :

```sh
cd server
PRESENCE_TOKEN=$(openssl rand -hex 32) npm run start:mock
```

La présence fictive change chaque minute : Mario Kart World sur Switch 2, console allumée sans jeu, Zelda sur Switch, puis hors ligne. Avec l'intervalle de poll minimum de 30 s, le serveur peut voir chaque étape avec un peu de retard.

### Comportement et limites

- **Nintendo** : le serveur ne poll jamais plus souvent que toutes les 30 s. En cas d'erreur, il réessaie avec un délai qui double à chaque échec (jusqu'à 15 min). Si le session token est expiré ou révoqué, il arrête de poller, l'écrit dans les logs, et `/presence` passe en `stale` : relance `npm run login`, mets à jour `.env` et redémarre le site.
- **Discord** : l'agent n'envoie une mise à jour que lorsque l'activité change, et la présence disparaît automatiquement quand l'agent s'arrête. S'il perd la connexion à Discord, il réessaie toutes les 5 s, puis de plus en plus espacé, jusqu'à une fois par minute.
- **Version de nxapi** : la dernière version stable publiée sur npm (1.6.1, 2023) ne fonctionne plus avec l'API Nintendo. Le serveur utilise donc la préversion `1.6.1-next.257`, épinglée exactement. Après une mise à jour de l'application Nintendo Switch Online, il faudra peut-être passer à une préversion plus récente.

### Sécurité

- Aucun secret n'est commité : les fichiers `.env` sont ignorés par git.
- Le session token n'apparaît jamais dans les logs du serveur. **N'active pas `DEBUG=nxapi:*`** en production : les logs de debug de nxapi affichent les tokens.
- `PRESENCE_TOKEN` est comparé en temps constant ; `/presence` n'est servi qu'en HTTPS via Alwaysdata.
- L'agent n'a aucune dépendance d'exécution. Le serveur dépend uniquement de nxapi, qui installe lui-même d'autres paquets. `npm audit` y signale des vulnérabilités (`sharp`, `uuid` via `node-notifier`) dans du code que le serveur ne charge jamais (traitement d'images, notifications desktop).

### Dépannage

| Symptôme | Piste |
|---|---|
| `NSO_FRIEND_NSA_ID was not found` | vérifie l'amitié entre les deux comptes et la valeur avec `npm run list-friends` |
| `state` reste `offline` alors que tu joues | visibilité du statut en ligne sur le compte principal (étape 2.4) |
| Erreur `NSA_NOT_LINKED` au login | le compte secondaire n'a jamais été lié à une console (étape 2.2) |
| Erreurs de génération du jeton `f` | client nxapi-auth absent ou invalide (étape 3) |
| L'agent indique `no running Discord client found` | Discord desktop n'est pas lancé, ou c'est une version Snap/Flatpak isolée |

## Licence

- `server/` : [AGPL-3.0-or-later](server/LICENSE), comme nxapi dont il dépend.
- Le reste du dépôt (dont `agent/`) : [Apache-2.0](LICENSE).
