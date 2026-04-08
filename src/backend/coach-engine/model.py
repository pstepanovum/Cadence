"""
QwenCoachEngine: model loading and turn generation.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, __version__ as TRANSFORMERS_VERSION

from parsing import clean_model_output, parse_turn_response
from prompts import revision_prompt, system_prompt, user_prompt

logger = logging.getLogger("cadence.coach_engine")

DEFAULT_COACH_MODEL = os.getenv("COACH_LLM_MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")


def _format_support_error(message: str) -> str:
    normalized = message.strip()
    if "model type `gemma4`" in normalized or "model type 'gemma4'" in normalized:
        return (
            f"Gemma 4 is not supported by your installed Transformers build "
            f"(detected version {TRANSFORMERS_VERSION}). "
            "Update with `pip install -U accelerate` and "
            "`pip install git+https://github.com/huggingface/transformers.git`."
        )
    return normalized


class QwenCoachEngine:
    def __init__(self, model_id: str = DEFAULT_COACH_MODEL) -> None:
        self.model_id = model_id
        self.model: AutoModelForCausalLM | None = None
        self.tokenizer = None
        self.model_loaded = False
        self.load_error: str | None = None
        self.device_label = self._detect_device()
        self.last_warmup_seconds: float | None = None
        self.last_generation_seconds: float | None = None
        self.max_new_tokens = int(os.getenv("COACH_LLM_MAX_NEW_TOKENS", "160"))
        self.temperature = float(os.getenv("COACH_LLM_TEMPERATURE", "0.78"))
        self.top_p = float(os.getenv("COACH_LLM_TOP_P", "0.9"))

    # ------------------------------------------------------------------
    # Device detection
    # ------------------------------------------------------------------

    def _detect_device(self) -> str:
        forced = os.getenv("COACH_LLM_DEVICE", "").strip().lower()
        if forced:
            return forced
        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        if self.model_loaded and self.model and self.tokenizer:
            return

        load_start = time.perf_counter()
        logger.info("Coach model loading model=%s device=%s", self.model_id, self.device_label)

        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id, padding_side="left")
        if self.tokenizer.pad_token_id is None and self.tokenizer.eos_token is not None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        if self.device_label == "cuda":
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id, torch_dtype="auto", device_map="auto"
            )
        elif self.device_label == "mps":
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id, torch_dtype=torch.float16
            )
            self.model.to("mps")
        else:
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id, torch_dtype=torch.float32
            )

        self.model.eval()
        self.model_loaded = True
        self.load_error = None
        self.last_warmup_seconds = time.perf_counter() - load_start
        logger.info(
            "Coach model loaded model=%s device=%s elapsed=%.2fs",
            self.model_id,
            self.device_label,
            self.last_warmup_seconds,
        )

    def warmup(self, force: bool = False) -> None:
        if self.model_loaded and not force:
            return
        try:
            self._load_model()
        except Exception as exc:
            self.model_loaded = False
            self.load_error = _format_support_error(str(exc))
            logger.exception("Coach model warmup failed")

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> dict[str, Any]:
        return {
            "coachReady": self.model_loaded,
            "coachModel": self.model_id,
            "coachDevice": self.device_label,
            "coachLoadError": self.load_error,
            "coachTransformersVersion": TRANSFORMERS_VERSION,
            "coachLastWarmupSeconds": self.last_warmup_seconds,
            "coachLastGenerationSeconds": self.last_generation_seconds,
        }

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    def _generate_decoded(
        self,
        messages: list[dict[str, str]],
        *,
        max_new_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
    ) -> str:
        try:
            prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
        except TypeError:
            prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )

        inputs = self.tokenizer(prompt, return_tensors="pt")

        if self.device_label == "mps":
            inputs = {k: v.to("mps") for k, v in inputs.items()}
        elif self.device_label == "cuda":
            inputs = {k: v.to(self.model.device) for k, v in inputs.items()}

        input_len = inputs["input_ids"].shape[-1]

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens or self.max_new_tokens,
                do_sample=True,
                temperature=self.temperature if temperature is None else temperature,
                top_p=self.top_p if top_p is None else top_p,
                repetition_penalty=1.08,
                pad_token_id=self.tokenizer.pad_token_id or self.tokenizer.eos_token_id,
            )

        return self.tokenizer.decode(
            outputs[0][input_len:],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_turn(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.model_loaded or not self.model or not self.tokenizer:
            self.warmup(force=True)

        if not self.model_loaded or not self.model or not self.tokenizer:
            raise RuntimeError(self.load_error or "Coach model is not ready yet.")

        topic = str(payload.get("topic") or "").strip()
        if not topic:
            raise ValueError("A topic is required to start the coach.")

        history = payload.get("history") if isinstance(payload.get("history"), list) else []
        mode = str(payload.get("mode") or "target")

        messages = [
            {"role": "system", "content": system_prompt()},
            {"role": "user", "content": user_prompt(payload)},
        ]

        generation_start = time.perf_counter()
        last_error: str | None = None
        decoded = ""
        turn: dict[str, str] | None = None

        for attempt in range(2):
            decoded = self._generate_decoded(messages)
            logger.info(
                "Coach raw output attempt=%s:\n%s",
                attempt + 1,
                clean_model_output(decoded),
            )

            try:
                turn = parse_turn_response(decoded, mode=mode, history=history)
                break
            except RuntimeError as exc:
                last_error = str(exc)
                if attempt == 1:
                    raise

                # Second attempt: feed the bad output back and ask for a revision
                messages = [
                    {"role": "system", "content": system_prompt()},
                    {"role": "user", "content": user_prompt(payload)},
                    {"role": "assistant", "content": decoded},
                    {
                        "role": "user",
                        "content": revision_prompt(
                            payload,
                            previous_output=decoded,
                            error_message=last_error,
                        ),
                    },
                ]

        if turn is None:
            raise RuntimeError(last_error or "Coach model did not return a valid turn.")

        self.last_generation_seconds = time.perf_counter() - generation_start
        logger.info(
            "Coach turn generated model=%s device=%s elapsed=%.2fs topic=%s",
            self.model_id,
            self.device_label,
            self.last_generation_seconds,
            topic,
        )

        return {"provider": "local-coach", "model": self.model_id, "turn": turn}
