#!/usr/bin/env node

/**
 * Get Google Ads API Refresh Token
 *
 * Runs a local OAuth flow for desktop apps.
 * Usage: node scripts/get-refresh-token.js
 */

import { createServer } from 'http';
import { parse } from 'url';
import { config } from 'dotenv';

// Load environment variables from .env
config();

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Error: Missing required environment variables');
    console.error('Please set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in .env file');
    process.exit(1);
}
const REDIRECT_URI = 'http://localhost:8085';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

// Generate auth URL
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&access_type=offline` +
    `&prompt=consent`;

console.log('\n=== Google Ads OAuth Flow ===\n');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Sign in and authorize the app');
console.log('3. You will be redirected back here automatically\n');

// Start local server to catch the redirect
const server = createServer(async (req, res) => {
    const urlParts = parse(req.url, true);

    if (urlParts.pathname === '/' && urlParts.query.code) {
        const code = urlParts.query.code;

        // Exchange code for tokens
        try {
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    redirect_uri: REDIRECT_URI,
                    grant_type: 'authorization_code'
                })
            });

            const tokens = await tokenResponse.json();

            if (tokens.refresh_token) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Success!</h1><p>You can close this window.</p></body></html>');

                console.log('=== SUCCESS ===\n');
                console.log('Your refresh_token:\n');
                console.log(tokens.refresh_token);
                console.log('\nAdd this to your config/google-ads.yaml file.');

                server.close();
                process.exit(0);
            } else {
                throw new Error(tokens.error_description || 'No refresh token received');
            }
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<html><body><h1>Error</h1><p>${error.message}</p></body></html>`);
            console.error('Error exchanging code:', error.message);
            server.close();
            process.exit(1);
        }
    } else if (urlParts.query.error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>Error</h1><p>${urlParts.query.error}</p></body></html>`);
        console.error('OAuth error:', urlParts.query.error);
        server.close();
        process.exit(1);
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(8085, () => {
    console.log('Waiting for authorization on http://localhost:8085 ...\n');
});
