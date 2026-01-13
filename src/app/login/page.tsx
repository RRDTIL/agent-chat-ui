"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      switch (errorParam) {
        case "Configuration":
          setError("OAuth configuration error. Please check server settings.");
          break;
        case "AccessDenied":
          setError("Access denied. Please try again.");
          break;
        case "Verification":
          setError("Verification error. Please try again.");
          break;
        default:
          setError("An error occurred during authentication. Please try again.");
      }
    }
  }, [searchParams]);

  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await signIn("tableau-mcp", {
        callbackUrl,
        redirect: true,
      });
    } catch (err) {
      setError("Failed to initiate login. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Agent Chat UI
          </CardTitle>
          <CardDescription className="text-center">
            Sign in with Tableau to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              You will be redirected to Tableau Server to authenticate using OAuth 2.1.
              This authentication is compatible with Tableau MCP for LangChain agents.
            </p>
          </div>

          <Button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? "Redirecting..." : "Sign in with Tableau"}
          </Button>

          <div className="text-xs text-muted-foreground text-center">
            By signing in, you authenticate using Tableau OAuth 2.1.
            Your session will be used to access Tableau via MCP.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

