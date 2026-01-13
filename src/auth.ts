import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    name: string;
    email?: string;
    siteRole?: string;
    tableauAccessToken?: string;
    tableauRefreshToken?: string;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email?: string;
      siteRole?: string;
    };
    tableauAccessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    siteRole?: string;
    tableauAccessToken?: string;
    tableauRefreshToken?: string;
    tableauTokenExpiresAt?: number;
  }
}

/**
 * Tableau MCP OAuth 2.1 Authentication
 * 
 * This implementation is compatible with Tableau MCP OAuth flow.
 * It uses Authorization Code Grant with PKCE as specified in the Tableau MCP documentation:
 * https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/oauth
 * 
 * The flow:
 * 1. User initiates login -> redirects to Tableau MCP OAuth authorize endpoint
 * 2. User authenticates with Tableau Server
 * 3. Tableau MCP redirects back with authorization code
 * 4. Exchange authorization code for encrypted JWE access token
 * 5. Store token in session for use by LangChain agent via Tableau MCP
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = nextUrl.pathname.startsWith("/login");
      
      if (isOnLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      
      if (!isLoggedIn) {
        return false; // Redirect to login
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user && account) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.siteRole = user.siteRole;
        token.tableauAccessToken = account.access_token;
        token.tableauRefreshToken = account.refresh_token;
        token.tableauTokenExpiresAt = account.expires_at
          ? account.expires_at * 1000
          : undefined;
      }

      // Check if token needs refresh
      if (
        token.tableauTokenExpiresAt &&
        Date.now() >= token.tableauTokenExpiresAt - 60000 && // Refresh 1 minute before expiry
        token.tableauRefreshToken
      ) {
        try {
          const refreshed = await refreshTableauToken(token.tableauRefreshToken);
          if (refreshed) {
            token.tableauAccessToken = refreshed.access_token;
            token.tableauRefreshToken = refreshed.refresh_token || token.tableauRefreshToken;
            token.tableauTokenExpiresAt = refreshed.expires_at
              ? refreshed.expires_at * 1000
              : undefined;
          }
        } catch (error) {
          console.error("Failed to refresh Tableau token:", error);
          // Token refresh failed, user will need to re-authenticate
          return null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id || "";
        session.user.name = token.name || "";
        session.user.email = token.email || undefined;
        session.user.siteRole = token.siteRole;
        session.tableauAccessToken = token.tableauAccessToken;
      }
      return session;
    },
  },
  providers: [
    {
      id: "tableau-mcp",
      name: "Tableau",
      type: "oauth",
      wellKnown: getTableauMCPWellKnownUrl(),
      authorization: {
        url: getTableauMCPAuthUrl(),
        params: {
          response_type: "code",
          scope: "openid",
        },
      },
      token: getTableauMCPTokenUrl(),
      userinfo: async (token) => {
        // Get user info from Tableau using the access token
        // The token from Tableau MCP is a JWE-encrypted token
        return await getTableauUserInfo(token);
      },
      clientId: process.env.TABLEAU_MCP_CLIENT_ID || "agent-chat-ui",
      clientSecret: process.env.TABLEAU_MCP_CLIENT_SECRET,
      checks: ["pkce", "state"],
      profile(profile) {
        return {
          id: profile.id || profile.sub || "",
          name: profile.name || profile.preferred_username || "",
          email: profile.email,
          siteRole: profile.siteRole,
        };
      },
    },
  ],
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

/**
 * Get Tableau MCP OAuth well-known configuration URL
 * Based on: https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/oauth
 */
function getTableauMCPWellKnownUrl(): string {
  const mcpServerUrl = process.env.TABLEAU_MCP_SERVER_URL;
  if (!mcpServerUrl) {
    throw new Error("TABLEAU_MCP_SERVER_URL is required");
  }
  return `${mcpServerUrl}/.well-known/oauth-authorization-server`;
}

/**
 * Get Tableau MCP OAuth authorization URL
 * Based on: https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/oauth
 */
function getTableauMCPAuthUrl(): string {
  const mcpServerUrl = process.env.TABLEAU_MCP_SERVER_URL;
  if (!mcpServerUrl) {
    throw new Error("TABLEAU_MCP_SERVER_URL is required");
  }
  return `${mcpServerUrl}/oauth/authorize`;
}

/**
 * Get Tableau MCP OAuth token URL
 */
function getTableauMCPTokenUrl(): string {
  const mcpServerUrl = process.env.TABLEAU_MCP_SERVER_URL;
  if (!mcpServerUrl) {
    throw new Error("TABLEAU_MCP_SERVER_URL is required");
  }
  return `${mcpServerUrl}/oauth/token`;
}

/**
 * Get user info from Tableau using the access token
 */
async function getTableauUserInfo(accessToken: string): Promise<any> {
  const tableauServerUrl = process.env.TABLEAU_SERVER_URL;
  const siteId = process.env.TABLEAU_SITE_ID || "";

  if (!tableauServerUrl) {
    throw new Error("TABLEAU_SERVER_URL is required");
  }

  // The access token from Tableau MCP is a JWE-encrypted token
  // We need to use it to authenticate with Tableau REST API
  // First, we'll try to get user info from Tableau
  const userInfoUrl = `${tableauServerUrl}/api/3.21/sites/${siteId}/users/current`;

  try {
    const response = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      // If Bearer token doesn't work, try X-Tableau-Auth header
      const response2 = await fetch(userInfoUrl, {
        headers: {
          "X-Tableau-Auth": accessToken,
          Accept: "application/json",
        },
      });

      if (!response2.ok) {
        throw new Error("Failed to fetch user info");
      }

      const data = await response2.json();
      return {
        id: data.user?.id || "",
        name: data.user?.name || data.user?.fullName || "",
        email: data.user?.email,
        siteRole: data.user?.siteRole,
      };
    }

    const data = await response.json();
    return {
      id: data.user?.id || "",
      name: data.user?.name || data.user?.fullName || "",
      email: data.user?.email,
      siteRole: data.user?.siteRole,
    };
  } catch (error) {
    console.error("Error fetching Tableau user info:", error);
    // Return minimal user info if we can't fetch from Tableau
    return {
      id: "unknown",
      name: "Tableau User",
    };
  }
}

/**
 * Refresh Tableau access token using refresh token
 */
async function refreshTableauToken(
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
} | null> {
  const mcpServerUrl = process.env.TABLEAU_MCP_SERVER_URL;
  if (!mcpServerUrl) {
    throw new Error("TABLEAU_MCP_SERVER_URL is required");
  }

  try {
    const response = await fetch(`${mcpServerUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_in
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : undefined,
    };
  } catch (error) {
    console.error("Error refreshing Tableau token:", error);
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
