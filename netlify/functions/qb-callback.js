// QuickBooks OAuth 2.0 callback — receives auth code, exchanges for tokens
// Env vars needed: QB_CLIENT_ID, QB_CLIENT_SECRET

const QBO_BASE = 'https://sandbox-quickbooks.api.intuit.com'; // change to https://quickbooks.api.intuit.com for production
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REDIRECT_URI = process.env.QB_REDIRECT_URI || 'https://graycocrm1.netlify.app/.netlify/functions/qb-callback';

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/html'
  };

  const { code, realmId, error, state } = event.queryStringParameters || {};

  if(error){
    return { statusCode: 400, headers, body: '<h2>QuickBooks auth error: '+error+'</h2><p><a href="/">Back to CRM</a></p>' };
  }

  if(!code || !realmId){
    return { statusCode: 400, headers, body: '<h2>Missing auth code or realmId</h2>' };
  }

  try {
    const creds = Buffer.from(process.env.QB_CLIENT_ID+':'+process.env.QB_CLIENT_SECRET).toString('base64');
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic '+creds,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }).toString()
    });

    const tokens = await resp.json();
    if(tokens.error){
      return { statusCode: 400, headers, body: '<h2>Token exchange failed: '+tokens.error+'</h2>' };
    }

    // Return tokens to the CRM via postMessage (window.opener)
    const payload = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      realmId: realmId,
      expires_in: tokens.expires_in,
      x_refresh_token_expires_in: tokens.x_refresh_token_expires_in,
      token_type: tokens.token_type,
      connectedAt: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers,
      body: `<!DOCTYPE html><html><head><title>QuickBooks Connected</title></head><body>
        <p style="font-family:sans-serif;text-align:center;margin-top:80px;color:#16a34a;font-size:18px;font-weight:700;">
          ✅ QuickBooks Connected Successfully<br>
          <span style="font-size:13px;color:#666;font-weight:400;">You can close this window.</span>
        </p>
        <script>
          try {
            if(window.opener && window.opener.gcQB) {
              window.opener.gcQB._receiveTokens(${payload});
            } else if(window.opener) {
              window.opener.postMessage({type:'qb_tokens',payload:${payload}},'*');
            }
          } catch(e){}
          setTimeout(function(){ window.close(); }, 1500);
        </script>
      </body></html>`
    };
  } catch(err) {
    return { statusCode: 500, headers, body: '<h2>Server error: '+err.message+'</h2>' };
  }
};
