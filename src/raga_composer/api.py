"""HTTP API (FastAPI) and static frontend hosting."""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import (
    Cookie,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from raga_composer.auth import Throttle, password_problem
from raga_composer.compositions import CompositionLibrary, taal_beats
from raga_composer.generator import (
    GeneratedPattern,
    GenerationError,
    Generator,
    Violation,
    arrange_sequence,
    validate,
)
from raga_composer.improvise import ImprovisationError, Improvisations, improvise
from raga_composer.intent import Intention, parse_intention
from raga_composer.notation import NotationError, Swara, Token, tokenize
from raga_composer.raga import Raga, RagaDefinition, RagaRegistry
from raga_composer.storage import LocalBlobStore, Repository
from raga_composer.taal import TAALS, Taal

STATIC_DIR = Path(__file__).parent / "static"
APP_NAME = "Riyaaz your way"
SESSION_COOKIE = "swaramala_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;"
        " media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    ),
}
MAX_RECORDING_BYTES = 50 * 1024 * 1024
TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
ALLOWED_AUDIO = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "video/webm"}


# Request and response models ---------------------------------------------------
class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=1, max_length=128)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class IntentRequest(BaseModel):
    raga: str
    text: str = ""
    base: Intention | None = None


class GenerateRequest(IntentRequest):
    seed: int | None = None


class GenerateResponse(BaseModel):
    intention: Intention
    patterns: list[GeneratedPattern]


class SequenceRequest(BaseModel):
    raga: str
    tokens: list[str] | str


class ValidateResponse(BaseModel):
    tokens: list[str]
    violations: list[Violation]


class ArrangeRequest(SequenceRequest):
    mode: str = Field(pattern="^(taan|palta|compact|sustain)$")
    notes_per_beat: int = Field(default=4, ge=1, le=8)
    motif_length: int = Field(default=3, ge=2, le=6)


class ArrangeResponse(ValidateResponse):
    notes_per_beat: int


class LineIn(BaseModel):
    raga: str
    title: str = Field(default="", max_length=120)
    tokens: list[str] = Field(min_length=1, max_length=512)
    notes_per_beat: int = Field(default=1, ge=1, le=8)
    taal: str | None = None
    intention: str = Field(default="", max_length=500)


class LinePatch(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    tokens: list[str] | None = None
    notes_per_beat: int | None = Field(default=None, ge=1, le=8)
    taal: str | None = None
    position: int | None = None


def _tokens(raw: list[str] | str) -> list[Token]:
    text = raw if isinstance(raw, str) else " ".join(raw)
    try:
        return tokenize(text)
    except NotationError as exc:
        raise HTTPException(422, str(exc)) from exc


SessionToken = Annotated[str | None, Cookie(alias=SESSION_COOKIE)]


def optional_user(request: Request, token: SessionToken = None) -> dict[str, Any] | None:
    repo: Repository = request.app.state.repo
    return repo.user_for_session(token) if token else None


def require_user(
    user: Annotated[dict[str, Any] | None, Depends(optional_user)],
) -> dict[str, Any]:
    if user is None:
        raise HTTPException(401, "Sign in to use this feature.")
    return user


OptionalUser = Annotated[dict[str, Any] | None, Depends(optional_user)]
CurrentUser = Annotated[dict[str, Any], Depends(require_user)]


def client_ip(request: Request) -> str:
    if os.environ.get("TRUST_PROXY"):
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def guard_requests(request: Request, call_next: RequestResponseEndpoint) -> Response:
    """Rejects cross-site writes (CSRF) and adds security headers."""
    if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        cross_site = request.headers.get("sec-fetch-site") == "cross-site"
        host = request.headers.get("host", "")
        if cross_site or (origin and origin.split("://", 1)[-1] != host):
            return JSONResponse({"detail": "Cross-site requests aren't allowed."}, status_code=403)
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    # Revalidate the page and its scripts on every load, so an update shows up without a hard reload.
    if not request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


def create_app(data_dir: Path | None = None) -> FastAPI:
    data_dir = data_dir or Path(os.environ.get("RAGA_DATA_DIR", "var"))
    data_dir.mkdir(parents=True, exist_ok=True)
    repo = Repository(data_dir / "raga_composer.db")
    blobs = LocalBlobStore(data_dir / "recordings")
    registry = RagaRegistry.with_builtins()
    compositions = CompositionLibrary.builtin()

    app = FastAPI(title=APP_NAME, version="0.2.0")
    app.state.repo = repo
    app.add_middleware(BaseHTTPMiddleware, dispatch=guard_requests)
    secure_cookies = os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes")
    # Failed sign-ins per account and per address, and registrations per address.
    account_failures = Throttle(limit=10, window_seconds=15 * 60)
    address_failures = Throttle(limit=30, window_seconds=15 * 60)
    registrations = Throttle(limit=10, window_seconds=60 * 60)

    def find_raga(name: str, user: dict[str, Any] | None) -> Raga:
        if user:
            for item in repo.list_custom_ragas(user["id"]):
                if item["name"].lower() == name.lower():
                    return Raga(RagaDefinition.model_validate(item))
        raga = registry.get(name)
        if raga is None:
            raise HTTPException(404, f"Unknown raga: {name}")
        return raga

    def set_session(request: Request, response: Response, user_id: int) -> None:
        token = repo.create_session(user_id, request.headers.get("user-agent", ""))
        response.set_cookie(
            SESSION_COOKIE,
            token,
            httponly=True,
            samesite="lax",
            secure=secure_cookies or request.url.scheme == "https",
            max_age=SESSION_COOKIE_MAX_AGE,
            path="/",
        )

    def clear_session(request: Request, response: Response) -> None:
        response.delete_cookie(
            SESSION_COOKIE, httponly=True, samesite="lax", secure=secure_cookies or request.url.scheme == "https"
        )

    def too_many(seconds: int) -> HTTPException:
        minutes = max(1, round(seconds / 60))
        return HTTPException(
            429,
            f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
            headers={"Retry-After": str(seconds)},
        )

    # Auth routes ------------------------------------------------------------
    @app.post("/api/auth/register")
    def register(
        body: RegisterRequest, request: Request, response: Response, token: SessionToken = None
    ) -> dict[str, Any]:
        ip = client_ip(request)
        if wait := registrations.retry_after(ip):
            raise too_many(wait)
        if problem := password_problem(body.password, body.username):
            raise HTTPException(422, problem)
        registrations.hit(ip)
        user_id = repo.create_user(body.username, body.password)
        if user_id is None:
            raise HTTPException(409, "That username is taken.")
        if token:
            repo.delete_session(token)
        set_session(request, response, user_id)
        return {"id": user_id, "username": body.username}

    @app.post("/api/auth/login")
    def login(body: LoginRequest, request: Request, response: Response, token: SessionToken = None) -> dict[str, Any]:
        ip = client_ip(request)
        account = body.username.strip().lower()
        if wait := max(account_failures.retry_after(account), address_failures.retry_after(ip)):
            raise too_many(wait)
        user = repo.authenticate(body.username.strip(), body.password)
        if user is None:
            account_failures.hit(account)
            address_failures.hit(ip)
            raise HTTPException(401, "Incorrect username or password.")
        account_failures.reset(account)
        if token:
            repo.delete_session(token)
        set_session(request, response, user["id"])
        return user

    @app.post("/api/auth/logout")
    def logout(request: Request, response: Response, token: SessionToken = None) -> dict[str, bool]:
        if token:
            repo.delete_session(token)
        clear_session(request, response)
        return {"ok": True}

    @app.post("/api/auth/logout-all")
    def logout_all(user: CurrentUser, request: Request, response: Response) -> dict[str, int]:
        ended = repo.delete_user_sessions(user["id"])
        clear_session(request, response)
        return {"ended_sessions": ended}

    @app.post("/api/auth/password")
    def change_password(
        body: PasswordChange, user: CurrentUser, request: Request, response: Response
    ) -> dict[str, Any]:
        account = f"pw:{user['id']}"
        if wait := account_failures.retry_after(account):
            raise too_many(wait)
        if not repo.check_password(user["id"], body.current_password):
            account_failures.hit(account)
            raise HTTPException(403, "Your current password is incorrect.")
        if problem := password_problem(body.new_password, user["username"]):
            raise HTTPException(422, problem)
        account_failures.reset(account)
        repo.set_password(user["id"], body.new_password)
        # Changing the password signs out every other device.
        repo.delete_user_sessions(user["id"])
        set_session(request, response, user["id"])
        return user

    @app.get("/api/auth/me")
    def me(user: OptionalUser) -> dict[str, Any] | None:
        return user

    # Reference data ---------------------------------------------------------
    @app.get("/api/config")
    def config() -> dict[str, Any]:
        return {"taals": list(TAALS.values()), "tonics": TONICS, "default_tonic": "G#"}

    @app.get("/api/taals")
    def taals() -> list[Taal]:
        return list(TAALS.values())

    @app.get("/api/ragas")
    def list_ragas(user: OptionalUser) -> list[dict[str, Any]]:
        items = [
            {
                "name": r.name,
                "thaat": r.definition.thaat,
                "time": r.definition.time,
                "aliases": r.definition.aliases,
                "custom": False,
                "compositions": sum(1 for c in compositions.for_raga(r.name) if c.sections),
            }
            for r in registry.all()
        ]
        if user:
            items += [
                {
                    "name": d["name"],
                    "thaat": d.get("thaat", ""),
                    "time": d.get("time", ""),
                    "aliases": [],
                    "custom": True,
                    "compositions": 0,
                }
                for d in repo.list_custom_ragas(user["id"])
            ]
        return items

    @app.get("/api/ragas/{name}")
    def raga_detail(name: str, user: OptionalUser) -> dict[str, Any]:
        raga = find_raga(name, user)
        notes = sorted({Swara(s) for s in raga.semitones})
        return {
            **raga.definition.model_dump(),
            "notes": [str(n) for n in notes],
            "varjit": [name for name, group in _SWARA_GROUPS.items() if not set(group) & raga.semitones],
            "compositions": [c.model_dump() for c in compositions.for_raga(raga.name)],
        }

    @app.get("/api/ragas/{name}/improvisations")
    def raga_improvisations(
        name: str,
        user: OptionalUser,
        taal: str = "Teentaal",
        seed: int | None = Query(default=None, ge=0, le=2**32),
        composition: str | None = None,
    ) -> Improvisations:
        raga = find_raga(name, user)
        beats = taal_beats(taal)
        if beats is None:
            raise HTTPException(400, f"Unknown taal: {taal}.")
        known = TAALS.get(taal.lower().replace(" ", ""))
        land = None
        if composition is not None:
            comp = next((c for c in compositions.for_raga(raga.name) if c.title == composition), None)
            if comp is None:
                raise HTTPException(404, f"Unknown composition: {composition}.")
            land = comp.mukhda_pitches()
        try:
            return improvise(raga, known.name if known else taal, beats, seed, land)
        except ImprovisationError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/ragas", status_code=201)
    def create_raga(definition: RagaDefinition, user: CurrentUser) -> dict[str, Any]:
        definition.custom = True
        if len(definition.pakad) + len(definition.patterns) == 0:
            raise HTTPException(422, "Add at least a pakad or one common pattern.")
        repo.save_custom_raga(user["id"], definition.name, definition.model_dump())
        return definition.model_dump()

    # Composition ------------------------------------------------------------
    @app.post("/api/intent")
    def intent(req: IntentRequest, user: OptionalUser) -> Intention:
        return parse_intention(req.text, find_raga(req.raga, user), req.base)

    @app.post("/api/generate")
    def generate(req: GenerateRequest, user: OptionalUser) -> GenerateResponse:
        raga = find_raga(req.raga, user)
        intention = parse_intention(req.text, raga, req.base)
        try:
            patterns = Generator(raga, intention, req.seed).generate()
        except GenerationError as exc:
            raise HTTPException(422, str(exc)) from exc
        return GenerateResponse(intention=intention, patterns=patterns)

    @app.post("/api/validate")
    def validate_sequence(req: SequenceRequest, user: OptionalUser) -> ValidateResponse:
        tokens = _tokens(req.tokens)
        raga = find_raga(req.raga, user)
        return ValidateResponse(tokens=[str(t) for t in tokens], violations=validate(raga, tokens))

    @app.post("/api/arrange")
    def arrange(req: ArrangeRequest, user: OptionalUser) -> ArrangeResponse:
        raga = find_raga(req.raga, user)
        result = arrange_sequence(raga, _tokens(req.tokens), req.mode, req.notes_per_beat, req.motif_length)
        return ArrangeResponse(
            tokens=[str(t) for t in result.tokens],
            violations=result.violations,
            notes_per_beat=result.notes_per_beat,
        )

    # Saved lines ------------------------------------------------------------
    @app.get("/api/lines")
    def list_lines(user: CurrentUser, raga: str | None = None) -> list[dict[str, Any]]:
        return repo.list_lines(user["id"], raga)

    @app.post("/api/lines", status_code=201)
    def save_line(line: LineIn, user: CurrentUser) -> dict[str, Any]:
        tokens = _tokens(line.tokens)
        data = line.model_dump()
        data["tokens"] = [str(t) for t in tokens]
        saved = repo.add_line(user["id"], data)
        saved["violations"] = [v.model_dump() for v in validate(find_raga(line.raga, user), tokens)]
        return saved

    @app.patch("/api/lines/{line_id}")
    def update_line(line_id: int, patch: LinePatch, user: CurrentUser) -> dict[str, Any]:
        data = patch.model_dump()
        if patch.tokens is not None:
            data["tokens"] = [str(t) for t in _tokens(patch.tokens)]
        updated = repo.update_line(user["id"], line_id, data)
        if updated is None:
            raise HTTPException(404, "Line not found.")
        return updated

    @app.delete("/api/lines/{line_id}", status_code=204)
    def delete_line(line_id: int, user: CurrentUser) -> Response:
        if not repo.delete_line(user["id"], line_id):
            raise HTTPException(404, "Line not found.")
        return Response(status_code=204)

    # Recordings -------------------------------------------------------------
    @app.get("/api/recordings")
    def list_recordings(user: CurrentUser) -> list[dict[str, Any]]:
        return [_public_recording(r) for r in repo.list_recordings(user["id"])]

    @app.post("/api/recordings", status_code=201)
    async def upload_recording(
        user: CurrentUser,
        file: Annotated[UploadFile, File()],
        title: Annotated[str, Form(max_length=120)] = "",
        raga: Annotated[str | None, Form()] = None,
        tonic: Annotated[str | None, Form()] = None,
        taal: Annotated[str | None, Form()] = None,
        tempo: Annotated[int | None, Form()] = None,
        duration_seconds: Annotated[float | None, Form()] = None,
    ) -> dict[str, Any]:
        mime = (file.content_type or "").split(";")[0].strip()
        if mime not in ALLOWED_AUDIO:
            raise HTTPException(415, f"Unsupported audio type: {mime or 'unknown'}")
        data = await file.read(MAX_RECORDING_BYTES + 1)
        if len(data) > MAX_RECORDING_BYTES:
            raise HTTPException(413, "Recording is larger than 50 MB.")
        if not data:
            raise HTTPException(422, "Recording is empty.")
        key = f"{user['id']}/{uuid.uuid4().hex}"
        blobs.put(key, data)
        rec = repo.add_recording(
            user["id"],
            {
                "title": title or "Untitled recording",
                "raga": raga,
                "tonic": tonic,
                "taal": taal,
                "tempo": tempo,
                "mime_type": mime,
                "size_bytes": len(data),
                "duration_seconds": duration_seconds,
                "blob_key": key,
            },
        )
        return _public_recording(rec)

    @app.get("/api/recordings/{rec_id}/audio")
    def recording_audio(rec_id: int, user: CurrentUser) -> Response:
        rec = repo.get_recording(user["id"], rec_id)
        data = blobs.get(rec["blob_key"]) if rec else None
        if rec is None or data is None:
            raise HTTPException(404, "Recording not found.")
        return Response(content=data, media_type=rec["mime_type"])

    @app.delete("/api/recordings/{rec_id}", status_code=204)
    def delete_recording(rec_id: int, user: CurrentUser) -> Response:
        rec = repo.delete_recording(user["id"], rec_id)
        if rec is None:
            raise HTTPException(404, "Recording not found.")
        blobs.delete(rec["blob_key"])
        return Response(status_code=204)

    # Frontend ---------------------------------------------------------------
    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
    return app


_SWARA_GROUPS = {
    "Sa": (0,),
    "Re": (1, 2),
    "Ga": (3, 4),
    "Ma": (5, 6),
    "Pa": (7,),
    "Dha": (8, 9),
    "Ni": (10, 11),
}


def _public_recording(rec: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in rec.items() if k not in ("blob_key", "user_id")}
    out["audio_url"] = f"/api/recordings/{rec['id']}/audio"
    return out


def main() -> None:
    import uvicorn

    uvicorn.run(
        "raga_composer.api:create_app",
        factory=True,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        reload=bool(os.environ.get("RELOAD")),
    )
