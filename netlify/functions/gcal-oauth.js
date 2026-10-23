// GrayCo Google Calendar OAuth — handles the auth callback + token storage
// Env vars needed (set AFTER you create the Google Cloud OAuth project):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SUPABASE_URL, SUPABASE_SERVICE_KEY
// Flow: user clicks Connect -> Google login -> Google redirects here with ?code=...&state=USERNAME
//       we exchange code for tokens, store {access, refresh, expiry} in the server-only table keyed by user (_lib/gtok.js).

require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const GTOK = require('./_lib/gtok');   /* patch GTOK: the sign-in is kept where no browser can read it */
async function saveTokens(user, tokens){
  if(!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  return GTOK.set(user, tokens);
}

exports.handler = async function(event){
  const params = event.queryStringParameters || {};
  const code = params.code;
  const user = (params.state || '').trim();

  if(!code){
    return { statusCode: 400, body: 'Missing authorization code.' };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if(!clientId || !clientSecret || !redirectUri){
    return { statusCode: 500, body: 'Google OAuth not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in Netlify.' };
  }

  try{
    const tokenResp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });
    const tok = await tokenResp.json();
    if(!tok.access_token){
      return { statusCode: 500, body: 'Token exchange failed: ' + JSON.stringify(tok) };
    }
    const tokens = {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || '',
      expiry: Date.now() + ((tok.expires_in||3600) * 1000),
      user: user
    };
    await saveTokens(user, tokens);

    // friendly HTML back to the user
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body style="font-family:sans-serif;background:#0f2440;color:#fff;text-align:center;padding:60px;">'+
            '<h2>\u2705 Google Calendar connected!</h2>'+
            '<p>'+ (user? (user+"'s") : 'Your') +' calendar is now linked to the GrayCo CRM.</p>'+
            '<p>Schedule items you add in Google Calendar will sync into the CRM.</p>'+
            '<p>You can close this window.</p></body></html>'
    };
  } catch(e){
    return { statusCode: 500, body: 'OAuth error: ' + e.message };
  }
};
