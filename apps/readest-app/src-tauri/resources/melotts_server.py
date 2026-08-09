import base64
import contextlib
import importlib
import io
import json
import sys
import traceback
import types
from pathlib import Path


models = {}

DEFAULT_SPEAKERS = {
    "EN": "EN-Default",
    "ES": "ES",
    "FR": "FR",
    "ZH": "ZH",
    "JP": "JP",
    "KR": "KR",
}


def configure_unidic():
    # mecab-python3 prefers unidic when both packages are installed, even when
    # its separately downloaded dictionary is absent. MeloTTS also ships with
    # unidic-lite, so point that compatibility module at the bundled dictionary.
    import unidic
    import unidic_lite

    unidic.DICDIR = unidic_lite.DICDIR


def configure_lazy_language_imports():
    import melo.text as melo_text

    def distribute_phone(phone_count, word_count):
        phones_per_word = [0] * word_count
        for _ in range(phone_count):
            min_index = phones_per_word.index(min(phones_per_word))
            phones_per_word[min_index] += 1
        return phones_per_word

    japanese_helper = types.ModuleType("melo.text.japanese")
    japanese_helper.distribute_phone = distribute_phone
    japanese_helper.__readest_helper__ = True
    sys.modules[japanese_helper.__name__] = japanese_helper

    language_modules = {
        "ZH": "chinese",
        "ZH_MIX_EN": "chinese_mix",
        "EN": "english",
        "ES": "spanish",
        "SP": "spanish",
        "FR": "french",
        "JP": "japanese",
        "KR": "korean",
    }
    bert_modules = {
        "ZH": "chinese_bert",
        "ZH_MIX_EN": "chinese_mix",
        "EN": "english_bert",
        "ES": "spanish_bert",
        "SP": "spanish_bert",
        "FR": "french_bert",
        "JP": "japanese_bert",
        "KR": "korean",
    }

    def import_text_module(language):
        name = language_modules[language]
        cached_module = sys.modules.get(f"melo.text.{name}")
        if getattr(cached_module, "__readest_helper__", False):
            del sys.modules[f"melo.text.{name}"]
        return importlib.import_module(f"melo.text.{name}")

    def clean_text(text, language):
        module = import_text_module(language)
        normalized_text = module.text_normalize(text)
        phones, tones, word2ph = module.g2p(normalized_text)
        return normalized_text, phones, tones, word2ph

    def get_bert(normalized_text, word2ph, language, device):
        name = bert_modules[language]
        module = importlib.import_module(f"melo.text.{name}")
        return module.get_bert_feature(normalized_text, word2ph, device=device)

    cleaner = types.ModuleType("melo.text.cleaner")
    cleaner.clean_text = clean_text
    sys.modules[cleaner.__name__] = cleaner
    melo_text.get_bert = get_bert


def configure_local_model_loader():
    download_utils = types.ModuleType("melo.download_utils")

    def load_config(_locale, use_hf=True, config_path=None):
        del use_hf
        if not config_path:
            raise RuntimeError("MeloTTS config path is required")
        from melo import utils

        return utils.get_hparams_from_file(config_path)

    def load_model(_locale, device, use_hf=True, ckpt_path=None):
        del use_hf
        if not ckpt_path:
            raise RuntimeError("MeloTTS checkpoint path is required")
        import torch

        return torch.load(ckpt_path, map_location=device, weights_only=True)

    download_utils.load_or_download_config = load_config
    download_utils.load_or_download_model = load_model
    sys.modules[download_utils.__name__] = download_utils


def synthesize(request):
    language_code = request["language_code"]
    text = request["text"].strip()
    model_dir = Path(request["model_dir"])
    config_path = model_dir / "config.json"
    checkpoint_path = model_dir / "checkpoint.pth"

    with contextlib.redirect_stdout(sys.stderr):
        if language_code not in models:
            try:
                configure_unidic()
                configure_lazy_language_imports()
                configure_local_model_loader()
                from melo.api import TTS
            except ImportError as error:
                raise RuntimeError(
                    "MeloTTS Python package is missing. Install melotts==0.1.2 in the Readest runtime."
                ) from error

            models[language_code] = TTS(
                language=language_code,
                device="cpu",
                use_hf=False,
                config_path=str(config_path),
                ckpt_path=str(checkpoint_path),
            )

        model = models[language_code]
        speaker_id = model.hps.data.spk2id[DEFAULT_SPEAKERS[language_code]]
        audio = model.tts_to_file(text, speaker_id, output_path=None, quiet=True)

        import soundfile

        output = io.BytesIO()
        soundfile.write(
            output,
            audio,
            model.hps.data.sampling_rate,
            format="WAV",
            subtype="PCM_16",
        )
    return base64.b64encode(output.getvalue()).decode("ascii")


for line in sys.stdin:
    try:
        request = json.loads(line)
        response = {"ok": True, "audio_base64": synthesize(request)}
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        response = {"ok": False, "error": f"{type(error).__name__}: {error}"}
    sys.stdout.write(json.dumps(response, ensure_ascii=True) + "\n")
    sys.stdout.flush()
