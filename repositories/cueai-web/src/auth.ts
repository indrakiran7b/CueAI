import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Apple from "next-auth/providers/apple";
import { resolveAuthSecret } from "@/lib/runtime-env";

function isRealSecret(value?: string) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (!v) return false;
  const placeholders = [
    "your-client-id",
    "your-client-secret",
    "changeme",
    "xxx",
    "todo",
  ];
  return !placeholders.includes(v);
}

function missingEnvNames(names: string[]): string[] {
  return names.filter((name) => !isRealSecret(process.env[name]));
}

/** Read at request time so /api/auth/providers reflects the running process env. */
export function getOAuthProviders() {
  const googleMissing = missingEnvNames(["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]);
  if (googleMissing.length > 0) {
    console.info("[auth] oauth.google.disabled", { missing: googleMissing });
  }
  return {
    google: googleMissing.length === 0,
    github:
      isRealSecret(process.env.AUTH_GITHUB_ID) &&
      isRealSecret(process.env.AUTH_GITHUB_SECRET),
    apple:
      isRealSecret(process.env.AUTH_APPLE_ID) &&
      isRealSecret(process.env.AUTH_APPLE_SECRET),
  };
}

export const oauthProviders = {
  get google() {
    return getOAuthProviders().google;
  },
  get github() {
    return getOAuthProviders().github;
  },
  get apple() {
    return getOAuthProviders().apple;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const configured = getOAuthProviders();
  return {
    secret: resolveAuthSecret(),
    trustHost: true,
    basePath: "/api/auth",
    providers: [
      ...(configured.google
        ? [
            Google({
              clientId: process.env.AUTH_GOOGLE_ID!,
              clientSecret: process.env.AUTH_GOOGLE_SECRET!,
              allowDangerousEmailAccountLinking: false,
              authorization: {
                params: { prompt: "select_account" },
              },
            }),
          ]
        : []),
      ...(configured.github
        ? [
            GitHub({
              clientId: process.env.AUTH_GITHUB_ID!,
              clientSecret: process.env.AUTH_GITHUB_SECRET!,
              allowDangerousEmailAccountLinking: false,
            }),
          ]
        : []),
      ...(configured.apple
        ? [
            Apple({
              clientId: process.env.AUTH_APPLE_ID!,
              clientSecret: process.env.AUTH_APPLE_SECRET!,
              allowDangerousEmailAccountLinking: false,
            }),
          ]
        : []),
    ],
    pages: {
      signIn: "/login",
      error: "/login",
    },
    callbacks: {
      async redirect({ url, baseUrl }) {
        const target = url.startsWith("/") ? `${baseUrl}${url}` : url;
        if (!target.startsWith(baseUrl)) return `${baseUrl}/auth/complete`;
        const parsed = new URL(target);
        if (parsed.searchParams.has("error")) return target;
        if (parsed.pathname === "/auth/complete") return target;
        const next = `${parsed.pathname}${parsed.search}` || "/dashboard";
        const safeNext =
          next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")
            ? next
            : "/dashboard";
        return `${baseUrl}/auth/complete?next=${encodeURIComponent(safeNext)}`;
      },
      async signIn({ account, profile }) {
        if (account?.provider === "google") {
          const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
          const email = (profile as { email?: string } | undefined)?.email;
          if (!email || verified !== true) return false;
        }
        return true;
      },
      async jwt({ token, user, account }) {
        if (user) {
          token.name = user.name;
          token.email = user.email;
          token.picture = user.image;
        }
        if (account) {
          token.provider = account.provider;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.name = (token.name as string) || session.user.name;
          session.user.email = (token.email as string) || session.user.email;
          session.user.image = (token.picture as string) || session.user.image;
        }
        return session;
      },
    },
  };
});
