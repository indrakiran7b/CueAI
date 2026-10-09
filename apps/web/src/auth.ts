import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

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

const googleConfigured =
  isRealSecret(process.env.AUTH_GOOGLE_ID) &&
  isRealSecret(process.env.AUTH_GOOGLE_SECRET);
const githubConfigured =
  isRealSecret(process.env.AUTH_GITHUB_ID) &&
  isRealSecret(process.env.AUTH_GITHUB_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
    ...(githubConfigured
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID!,
            clientSecret: process.env.AUTH_GITHUB_SECRET!,
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
  trustHost: true,
});

export const oauthProviders = {
  google: googleConfigured,
  github: githubConfigured,
};
