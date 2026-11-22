"""
Voice input: Whisper turns speech into text, which goes
into the Search-or-ask box for the person to check and send — never straight
to the Guide. Whisper invents short phrases on silence ("Thank you.", "you"),
so those come back as empty.
"""
import re

_SILENCE = {
    "", "you", "thank you", "thanks", "thank you very much", "thanks for watching", "thank you for watching",
    "bye", "okay", "ok", "so", "uh", "um", "hmm", "please subscribe", "subtitles by the amara org community",
}


def clean_transcript(text: str) -> str:
    """The transcript, or "" when it's one of Whisper's silence phrases."""
    t = re.sub(r"\s+", " ", text or "").strip()
    if re.sub(r"[^a-z ]", "", t.lower()).strip() in _SILENCE:
        return ""
    return t[:400]
