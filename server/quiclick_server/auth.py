import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from quiclick_server.config import cfg
from quiclick_server.database import get_current_user, get_users_engine
from quiclick_server.models import UserRecord
from quiclick_server.schemas import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    client_id=cfg.google_client_id,
    client_secret=cfg.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/login")
async def login(request: Request):
    """Redirect to Google's authorization URL."""
    redirect_uri = f"{cfg.server_host}/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def callback(request: Request):
    """Exchange code for ID token, upsert user, set session."""
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo:
        userinfo = await oauth.google.userinfo(token=token)

    sub = userinfo["sub"]
    email = userinfo.get("email", "")
    name = userinfo.get("name")

    # Upsert user in the shared users.db
    engine = get_users_engine()
    try:
        with Session(engine) as session:
            user = session.get(UserRecord, sub)
            if user:
                user.email = email
                user.name = name
            else:
                user = UserRecord(sub=sub, email=email, name=name)
                session.add(user)
            session.commit()
    finally:
        engine.dispose()

    # Set session cookie
    request.session["sub"] = sub
    request.session["email"] = email
    request.session["name"] = name

    return RedirectResponse(url="/auth/success")


@router.get("/success", response_class=HTMLResponse)
async def success():
    """Minimal page that closes itself — the login tab auto-closes."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Login Successful</title></head>
    <body>
        <p>Login successful. This tab will close automatically.</p>
        <script>window.close();</script>
    </body>
    </html>
    """


class TokenRequest(BaseModel):
    token: str


@router.post("/token", response_model=UserResponse)
async def exchange_token(body: TokenRequest, request: Request):
    """Exchange a Google access token (from chrome.identity) for a session cookie."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {body.token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    userinfo = resp.json()
    sub = userinfo.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub claim")

    email = userinfo.get("email", "")
    name = userinfo.get("name")

    # Upsert user in the shared users.db
    engine = get_users_engine()
    try:
        with Session(engine) as session:
            user = session.get(UserRecord, sub)
            if user:
                user.email = email
                user.name = name
            else:
                user = UserRecord(sub=sub, email=email, name=name)
                session.add(user)
            session.commit()
    finally:
        engine.dispose()

    # Set session cookie
    request.session["sub"] = sub
    request.session["email"] = email
    request.session["name"] = name

    return UserResponse(sub=sub, email=email, name=name)


@router.post("/logout")
async def logout(request: Request):
    """Clear session cookie."""
    request.session.clear()
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
    """Return current authenticated user info."""
    sub = get_current_user(request)

    return UserResponse(
        sub=sub,
        email=request.session.get("email", ""),
        name=request.session.get("name"),
    )
