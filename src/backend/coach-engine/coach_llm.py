# Backwards-compatibility shim — main.py imports GemmaCoachEngine from here.
from model import QwenCoachEngine as GemmaCoachEngine

__all__ = ["GemmaCoachEngine"]
