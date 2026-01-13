import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * API endpoint to get the Tableau access token for the current user
 * This token can be used by LangChain agents via Tableau MCP
 * 
 * The token returned is a JWE-encrypted token from Tableau MCP that can be
 * used to authenticate requests to the Tableau MCP server.
 */
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Return the Tableau access token from the session
    // This is the JWE-encrypted token from Tableau MCP
    return NextResponse.json({
      accessToken: session.tableauAccessToken,
      // Include MCP server URL for the agent to know where to connect
      mcpServerUrl: process.env.TABLEAU_MCP_SERVER_URL,
    });
  } catch (error) {
    console.error("Error getting Tableau token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

