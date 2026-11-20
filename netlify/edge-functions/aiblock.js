// GrayCo — patch AIBLOCK (owner 11/20: "make sure bid portal and all websites we have are protected from ai").
// Known AI crawlers / AI agents get 403 on every page of crm / portal / bids (robots.txt asks them first; this enforces it).
// Normal browsers, Google/Bing search, link previews (facebookexternalhit, Slackbot, iMessage) and webhooks are untouched.
const AI = /(GPTBot|ChatGPT-User|ChatGPT-Agent|OAI-SearchBot|ClaudeBot|Claude-Web|Claude-User|Claude-SearchBot|anthropic-ai|CCBot|PerplexityBot|Perplexity-User|Bytespider|Amazonbot|meta-externalagent|meta-externalfetcher|cohere-ai|cohere-training-data-crawler|Diffbot|ImagesiftBot|YouBot|Timpibot|omgili|PetalBot|AI2Bot|Ai2Bot-Dolma|DuckAssistBot|MistralAI-User|Kangaroo Bot|img2dataset|iaskspider|ICC-Crawler|Webzio-Extended|FriendlyCrawler|Sidetrade|Google-CloudVertexBot|GoogleOther|Applebot-Extended|VelenPublicWebCrawler|Scrapy|Brightbot|Crawlspace|TikTokSpider|Panscient|SemrushBot-OCOB|QualifiedBot|Novellum|wpbot|Factset_spyderbot|LinerBot|Andibot)/i;
export default async (request, context) => {
  const ua = request.headers.get('user-agent') || '';
  if (AI.test(ua)) return new Response('Not available.', { status: 403, headers: { 'content-type': 'text/plain', 'x-robots-tag': 'noindex, nofollow, noai, noimageai' } });
  return context.next();
};
export const config = { path: '/*', excludedPath: ['/.netlify/functions/*'] };
