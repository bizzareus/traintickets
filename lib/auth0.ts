import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0 Regular Web Application session. Access tokens target the NestJS
 * backend audience so paid-search endpoints can verify them.
 */
export const auth0 = new Auth0Client({
  routes: {
    callback: "/callback",
  },
  authorizationParameters: {
    audience: "https://api.lastberth.com",
    scope: "openid profile email phone",
  },
});
