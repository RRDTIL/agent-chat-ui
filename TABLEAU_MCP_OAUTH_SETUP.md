# Configuration Tableau MCP OAuth pour Agent Chat UI

Cette application utilise l'authentification OAuth 2.1 de Tableau MCP, compatible avec les agents LangChain via Tableau MCP.

## Documentation de référence

- [Tableau MCP OAuth Configuration](https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/oauth)
- [Tableau MCP Authentication](https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/authentication/oauth)
- [Tableau MCP HTTP Server](https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/http-server)

## Prérequis

1. **Tableau Server 2025.3+** (OAuth support requis)
2. **Serveur Tableau MCP** configuré et en cours d'exécution
3. **Client OAuth enregistré** sur le serveur MCP Tableau

## Variables d'environnement requises

### Pour Agent Chat UI (`.env`)

```bash
# Tableau MCP Server Configuration
TABLEAU_MCP_SERVER_URL=http://localhost:3927  # URL de votre serveur MCP Tableau
TABLEAU_MCP_CLIENT_ID=agent-chat-ui          # ID du client OAuth (doit correspondre à la config MCP)
TABLEAU_MCP_CLIENT_SECRET=your_client_secret # Secret du client OAuth

# Tableau Server Configuration (pour récupérer les infos utilisateur)
TABLEAU_SERVER_URL=https://your-tableau-server.com
TABLEAU_SITE_ID=your_site_id  # Optionnel, laisse vide pour le site par défaut

# Auth.js Configuration
AUTH_SECRET=your_random_secret_key_here  # Générer avec: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3001  # URL canonique de votre application (http://localhost:3001 en dev, https://votre-domaine.com en prod)

# LangGraph Configuration (existant)
NEXT_PUBLIC_API_URL=http://localhost:2024
NEXT_PUBLIC_ASSISTANT_ID=agent
LANGGRAPH_API_URL=http://localhost:2024
LANGSMITH_API_KEY=
```

### Pour le serveur Tableau MCP

Le serveur MCP Tableau doit être configuré avec les variables suivantes (voir [documentation Tableau MCP](https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/oauth)):

```bash
# Configuration OAuth du serveur MCP
AUTH=oauth
TRANSPORT=http
OAUTH_ISSUER=http://localhost:3927  # URL du serveur MCP
OAUTH_REDIRECT_URI=http://localhost:3927/Callback  # Doit être /Callback (case-sensitive)
OAUTH_CLIENT_ID_SECRET_PAIRS=agent-chat-ui:your_client_secret
OAUTH_JWE_PRIVATE_KEY_PATH=/path/to/private.pem  # Clé privée RSA pour JWE
OAUTH_JWE_PRIVATE_KEY_PASSPHRASE=  # Optionnel, si la clé est chiffrée

# Configuration Tableau
SERVER=https://your-tableau-server.com  # Peut être vide pour Tableau Cloud
SITE_NAME=your_site_name  # Peut être vide pour n'importe quel site
```

## Configuration du serveur Tableau

### 1. Configurer les redirect URIs autorisés

Sur Tableau Server, l'administrateur doit configurer les redirect URIs autorisés:

```bash
tsm configuration set -k oauth.allowed_redirect_uri_hosts -v localhost
tsm pending-changes apply
```

Pour la production, remplacer `localhost` par le domaine de votre serveur MCP.

### 2. Générer une clé privée RSA

Pour générer la clé privée RSA nécessaire pour JWE:

```bash
openssl genrsa -out private.pem 2048
```

## Flux d'authentification

1. **Utilisateur clique sur "Sign in with Tableau"**
   - Redirection vers `/oauth/authorize` du serveur MCP Tableau
   - Le serveur MCP redirige vers Tableau Server pour l'authentification

2. **Authentification Tableau**
   - L'utilisateur s'authentifie avec ses identifiants Tableau Server
   - Tableau Server redirige vers le serveur MCP `/Callback`

3. **Échange du code d'autorisation**
   - Le serveur MCP échange le code contre un token JWE encrypté
   - Le token contient les credentials Tableau de l'utilisateur

4. **Stockage du token**
   - Le token JWE est stocké dans la session NextAuth
   - Accessible via l'API `/api/tableau/token` pour l'agent LangChain

5. **Utilisation par l'agent LangChain**
   - L'agent LangChain peut récupérer le token via l'API
   - Le token est utilisé pour authentifier les requêtes vers Tableau MCP

## API Endpoints

### GET `/api/tableau/token`

Récupère le token Tableau de l'utilisateur authentifié pour l'agent LangChain.

**Réponse:**
```json
{
  "accessToken": "jwe_encrypted_token_here",
  "mcpServerUrl": "http://localhost:3927"
}
```

## Compatibilité avec Tableau MCP

Le token retourné est un token JWE encrypté qui peut être utilisé directement avec Tableau MCP. L'agent LangChain peut utiliser ce token dans l'en-tête `Authorization` lors des requêtes au serveur MCP:

```
Authorization: Bearer <jwe_token>
```

## Notes importantes

- **NEXTAUTH_URL**: URL canonique de votre application Next.js. Utilisée par NextAuth.js pour générer les URLs de callback OAuth. En développement: `http://localhost:3000`, en production: `https://votre-domaine.com`
- **Tableau Server 2025.3+ requis**: OAuth n'est supporté que sur Tableau Server 2025.3+
- **Tableau Cloud**: Support complet prévu pour Q2 2026. Pour l'instant, fonctionne uniquement avec des URLs de développement locales
- **Refresh Tokens**: Les refresh tokens sont stockés en mémoire sur le serveur MCP. Un redémarrage du serveur invalidera les refresh tokens
- **Sécurité**: Le token JWE est encrypté et ne peut être décrypté que par le serveur MCP avec la clé privée correspondante

## Dépannage

### Erreur: "TABLEAU_MCP_SERVER_URL is required"
- Vérifiez que `TABLEAU_MCP_SERVER_URL` est défini dans votre `.env`

### Erreur: "OAuth configuration error"
- Vérifiez que le serveur MCP Tableau est en cours d'exécution
- Vérifiez que `OAUTH_ISSUER` correspond à l'URL du serveur MCP
- Vérifiez que `OAUTH_CLIENT_ID_SECRET_PAIRS` contient le client ID et secret corrects

### Erreur: "Failed to fetch user info"
- Vérifiez que `TABLEAU_SERVER_URL` est correct
- Vérifiez que le token JWE est valide et peut être utilisé avec Tableau REST API

