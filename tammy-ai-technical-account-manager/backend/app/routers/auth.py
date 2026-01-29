"""
Google OAuth Authentication Router

Handles OAuth2 flow for Google Drive integration.
Allows users to connect their Google account for transcript auto-save.
"""

import logging
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/auth/google", tags=["Authentication"])
logger = logging.getLogger(__name__)

# Google OAuth endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Required scopes for Google Drive file creation
SCOPES = [
    "https://www.googleapis.com/auth/drive.file",  # Only files created by app
    "https://www.googleapis.com/auth/userinfo.email",  # Get user email
]


class TokenResponse(BaseModel):
    """OAuth token response."""

    access_token: str
    refresh_token: Optional[str] = None
    expires_in: int
    token_type: str
    scope: str


class UserInfo(BaseModel):
    """Google user info response."""

    email: str
    verified_email: bool = False
    name: Optional[str] = None
    picture: Optional[str] = None


@router.get("/login")
async def google_login() -> RedirectResponse:
    """
    Initiate Google OAuth login flow.

    Redirects to Google's OAuth consent screen.
    After authorization, Google redirects back to /auth/google/callback.
    """
    if not settings.google_client_id:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )

    # Build OAuth URL
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.backend_url}/auth/google/callback",
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",  # Request refresh token
        "prompt": "consent",  # Always show consent to get refresh token
    }

    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    logger.info("Redirecting to Google OAuth")
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def google_callback(
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
) -> HTMLResponse:
    """
    Handle Google OAuth callback.

    Exchanges authorization code for tokens and returns a page
    that communicates the result to the extension.
    """
    if error:
        logger.warning(f"OAuth error: {error}")
        return _create_callback_page(success=False, error=error)

    if not code:
        logger.warning("No authorization code received")
        return _create_callback_page(success=False, error="No authorization code")

    try:
        # Exchange code for tokens
        import httpx

        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": f"{settings.backend_url}/auth/google/callback",
                },
            )

            if token_response.status_code != 200:
                logger.error(f"Token exchange failed: {token_response.text}")
                return _create_callback_page(
                    success=False,
                    error="Failed to exchange authorization code"
                )

            tokens = token_response.json()

            # Get user info
            userinfo_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )

            if userinfo_response.status_code != 200:
                logger.error(f"Failed to get user info: {userinfo_response.text}")
                return _create_callback_page(
                    success=False,
                    error="Failed to get user information"
                )

            user_info = userinfo_response.json()
            email = user_info.get("email", "Unknown")

        logger.info(f"OAuth successful for: {email}")

        # Return page that sends data to extension
        return _create_callback_page(
            success=True,
            email=email,
            access_token=tokens.get("access_token"),
            refresh_token=tokens.get("refresh_token"),
        )

    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return _create_callback_page(success=False, error=str(e))


@router.post("/refresh")
async def refresh_token(refresh_token: str) -> dict:
    """
    Refresh an expired access token.

    Args:
        refresh_token: The refresh token from initial OAuth flow.

    Returns:
        New access token and expiration.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")

    try:
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail="Failed to refresh token"
                )

            tokens = response.json()
            return {
                "access_token": tokens["access_token"],
                "expires_in": tokens.get("expires_in", 3600),
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(status_code=500, detail="Token refresh failed")


def _create_callback_page(
    success: bool,
    email: Optional[str] = None,
    access_token: Optional[str] = None,
    refresh_token: Optional[str] = None,
    error: Optional[str] = None,
) -> HTMLResponse:
    """
    Create HTML page that communicates OAuth result to extension.

    The page stores tokens in extension storage and closes itself.
    """
    if success:
        # JavaScript to store tokens and close window
        script = f"""
        <script>
            // Store in localStorage for extension to read
            const data = {{
                driveConnected: true,
                driveAccountEmail: "{email}",
                driveAccessToken: "{access_token}",
                driveRefreshToken: "{refresh_token or ''}"
            }};

            // Try to communicate with extension
            try {{
                // Use chrome.storage if available (extension context)
                if (typeof chrome !== 'undefined' && chrome.storage) {{
                    chrome.storage.local.set(data, function() {{
                        window.close();
                    }});
                }} else {{
                    // Fallback: store in localStorage and let extension poll
                    localStorage.setItem('tammy_oauth_result', JSON.stringify(data));
                    document.getElementById('status').innerHTML =
                        '<h2 style="color: #34a853;">✓ Connected!</h2>' +
                        '<p>You can close this window and return to Tammy settings.</p>';
                    setTimeout(() => window.close(), 2000);
                }}
            }} catch (e) {{
                document.getElementById('status').innerHTML =
                    '<h2 style="color: #34a853;">✓ Connected!</h2>' +
                    '<p>Please close this window and refresh Tammy settings.</p>';
            }}
        </script>
        """
        body = '<div id="status"><h2>Connecting...</h2></div>'
    else:
        script = """
        <script>
            setTimeout(() => window.close(), 5000);
        </script>
        """
        body = f"""
        <div id="status">
            <h2 style="color: #ea4335;">Connection Failed</h2>
            <p>{error or 'Unknown error occurred'}</p>
            <p>This window will close in 5 seconds.</p>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Tammy - Google Drive Connection</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f8f9fa;
            }}
            #status {{
                text-align: center;
                padding: 40px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }}
            h2 {{ margin-bottom: 16px; }}
            p {{ color: #5f6368; }}
        </style>
    </head>
    <body>
        {body}
        {script}
    </body>
    </html>
    """

    return HTMLResponse(content=html)


@router.get("/status")
async def auth_status() -> dict:
    """Check if Google OAuth is configured."""
    return {
        "configured": bool(settings.google_client_id and settings.google_client_secret),
        "scopes": SCOPES,
    }
