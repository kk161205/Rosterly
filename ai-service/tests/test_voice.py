"""Voice input: speech to text for the Search-or-ask box."""
from tests.conftest import TOKEN

AUDIO = b"webm" + b"0" * 2000  # a small audio-like body
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "audio/webm"}


def _voice_on(backend, on=True):
    backend.responses["/api/v1/me/preferences"] = (200, {"assistant_enabled": True, "company_assistant_enabled": True, "voice_enabled": on})


def test_turns_speech_into_text_for_the_box(fakes, client):
    backend, groq = fakes
    _voice_on(backend)
    groq.replies = [{"text": " How do I ask for leave? "}]
    res = client.post("/ai/transcribe", content=AUDIO, headers=H)
    assert res.status_code == 200 and res.json() == {"text": "How do I ask for leave?"}
    assert groq.requests == [{"speech": True, "bytes": groq.requests[0]["bytes"]}]  # only the speech model; no chat call


def test_silence_phrases_come_back_empty(fakes, client):
    backend, groq = fakes
    _voice_on(backend)
    groq.replies = [{"text": " Thank you."}]
    assert client.post("/ai/transcribe", content=AUDIO, headers=H).json() == {"text": ""}


def test_needs_the_persons_voice_switch(fakes, client):
    backend, groq = fakes
    _voice_on(backend, False)
    res = client.post("/ai/transcribe", content=AUDIO, headers=H)
    assert res.status_code == 403 and res.json()["error"]["code"] == "voice_disabled"
    assert groq.requests == []


def test_rejects_non_audio_empty_and_long_recordings(fakes, client):
    backend, _ = fakes
    _voice_on(backend)
    assert client.post("/ai/transcribe", content=b"hi", headers={**H, "Content-Type": "text/plain"}).status_code == 400
    assert client.post("/ai/transcribe", content=b"", headers=H).status_code == 400
    assert client.post("/ai/transcribe", content=b"0" * 1_600_000, headers=H).status_code == 413
    assert client.post("/ai/transcribe", content=AUDIO, headers={"Content-Type": "audio/webm"}).status_code == 401


def test_speech_model_down_means_503(fakes, client):
    backend, groq = fakes
    _voice_on(backend)
    groq.replies = [503]
    assert client.post("/ai/transcribe", content=AUDIO, headers=H).status_code == 503


def test_audio_over_the_limit_is_refused_before_reading(fakes, client):
    backend, groq = fakes
    _voice_on(backend)
    res = client.post("/ai/transcribe", content=b"0" * 2_000_000, headers=H)
    assert res.status_code == 413 and groq.requests == []
