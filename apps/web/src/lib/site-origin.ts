import deployment from '../../wrangler.json';

// The custom domain is shared by deployment, canonical URLs, and the sitemap.
export const siteOrigin = `https://${deployment.routes[0].pattern}`;
