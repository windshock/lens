#!/usr/bin/env bash
# Create an isolated MeloTTS Korean-only environment.
#
# The upstream MeloTTS package installs Japanese mecab-python3 and Korean
# python-mecab-ko together. On macOS's default case-insensitive filesystem their
# MeCab/ and mecab/ package directories collide, so this setup excludes
# mecab-python3 and patches MeloTTS to lazy-load only the requested language.

set -euo pipefail

cd "$(dirname "$0")/.."

VENV_DIR="${MELOTTS_KR_VENV:-.venv-melotts-kr}"
PYTHON_BIN="${MELOTTS_KR_PYTHON:-/opt/homebrew/bin/python3.11}"
MELOTTS_VERSION="${MELOTTS_VERSION:-0.1.1}"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Python not found or not executable: $PYTHON_BIN" >&2
  echo "Set MELOTTS_KR_PYTHON to a Python 3.11/3.12 interpreter." >&2
  exit 1
fi

"$PYTHON_BIN" -m venv "$VENV_DIR"
PY="$VENV_DIR/bin/python"

"$PY" -m pip install --upgrade pip "setuptools<82" wheel

"$PY" -m pip install \
  torch torchaudio \
  cached_path \
  click tqdm txtsplit \
  transformers sentencepiece \
  soundfile scipy librosa pydub \
  num2words anyascii jamo g2pkk nltk python-mecab-ko

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

"$PY" - <<'PY' "$MELOTTS_VERSION" "$TMP_DIR"
from __future__ import annotations

import json
import sys
import tarfile
import urllib.request
from pathlib import Path

version = sys.argv[1]
tmp = Path(sys.argv[2])

with urllib.request.urlopen(f"https://pypi.org/pypi/MeloTTS/{version}/json") as response:
    data = json.load(response)

sdist_url = next(
    item["url"] for item in data["urls"] if item["packagetype"] == "sdist"
)
archive = tmp / f"melotts-{version}.tar.gz"
urllib.request.urlretrieve(sdist_url, archive)

with tarfile.open(archive) as tar:
    tar.extractall(tmp)

src = tmp / f"melotts-{version}"

# The PyPI sdist is missing requirements.txt even though setup.py reads it.
# Keep installation dependency-free; this script installs the KR runtime deps.
(src / "requirements.txt").write_text("", encoding="utf-8")

(src / "melo" / "text" / "cleaner.py").write_text(
    '''from . import cleaned_text_to_sequence
import copy
import importlib


_LANGUAGE_MODULE_NAMES = {
    "ZH": "chinese",
    "JP": "japanese",
    "EN": "english",
    "ZH_MIX_EN": "chinese_mix",
    "KR": "korean",
    "FR": "french",
    "SP": "spanish",
    "ES": "spanish",
}
_LANGUAGE_MODULES = {}


def _get_language_module(language):
    module_name = _LANGUAGE_MODULE_NAMES[language]
    module = _LANGUAGE_MODULES.get(module_name)
    if module is None:
        module = importlib.import_module(f"melo.text.{module_name}")
        _LANGUAGE_MODULES[module_name] = module
    return module


def clean_text(text, language):
    language_module = _get_language_module(language)
    norm_text = language_module.text_normalize(text)
    phones, tones, word2ph = language_module.g2p(norm_text)
    return norm_text, phones, tones, word2ph


def clean_text_bert(text, language, device=None):
    language_module = _get_language_module(language)
    norm_text = language_module.text_normalize(text)
    phones, tones, word2ph = language_module.g2p(norm_text)

    word2ph_bak = copy.deepcopy(word2ph)
    for i in range(len(word2ph)):
        word2ph[i] = word2ph[i] * 2
    word2ph[0] += 1
    bert = language_module.get_bert_feature(norm_text, word2ph, device=device)

    return norm_text, phones, tones, word2ph_bak, bert


def text_to_sequence(text, language):
    norm_text, phones, tones, word2ph = clean_text(text, language)
    return cleaned_text_to_sequence(phones, tones, language)


if __name__ == "__main__":
    pass
''',
    encoding="utf-8",
)

(src / "melo" / "text" / "__init__.py").write_text(
    '''from .symbols import *

import importlib


_symbol_to_id = {s: i for i, s in enumerate(symbols)}


def cleaned_text_to_sequence(cleaned_text, tones, language, symbol_to_id=None):
    """Converts a string of text to symbol, tone, and language id sequences."""
    symbol_to_id_map = symbol_to_id if symbol_to_id else _symbol_to_id
    phones = [symbol_to_id_map[symbol] for symbol in cleaned_text]
    tone_start = language_tone_start_map[language]
    tones = [i + tone_start for i in tones]
    lang_id = language_id_map[language]
    lang_ids = [lang_id for _ in phones]
    return phones, tones, lang_ids


_BERT_MODULES = {
    "ZH": ("chinese_bert", "get_bert_feature"),
    "EN": ("english_bert", "get_bert_feature"),
    "JP": ("japanese_bert", "get_bert_feature"),
    "ZH_MIX_EN": ("chinese_mix", "get_bert_feature"),
    "FR": ("french_bert", "get_bert_feature"),
    "SP": ("spanish_bert", "get_bert_feature"),
    "ES": ("spanish_bert", "get_bert_feature"),
    "KR": ("korean", "get_bert_feature"),
}


def get_bert(norm_text, word2ph, language, device):
    module_name, function_name = _BERT_MODULES[language]
    module = importlib.import_module(f"melo.text.{module_name}")
    return getattr(module, function_name)(norm_text, word2ph, device)
''',
    encoding="utf-8",
)

(src / "melo" / "download_utils.py").write_text(
    '''import torch
from . import utils
from cached_path import cached_path
from huggingface_hub import hf_hub_download


DOWNLOAD_CKPT_URLS = {
    "EN": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/EN/checkpoint.pth",
    "EN_V2": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/EN_V2/checkpoint.pth",
    "FR": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/FR/checkpoint.pth",
    "JP": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/JP/checkpoint.pth",
    "ES": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/ES/checkpoint.pth",
    "ZH": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/ZH/checkpoint.pth",
    "KR": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/KR/checkpoint.pth",
}

DOWNLOAD_CONFIG_URLS = {
    "EN": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/EN/config.json",
    "EN_V2": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/EN_V2/config.json",
    "FR": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/FR/config.json",
    "JP": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/JP/config.json",
    "ES": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/ES/config.json",
    "ZH": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/ZH/config.json",
    "KR": "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/basespeakers/KR/config.json",
}

LANG_TO_HF_REPO_ID = {
    "EN": "myshell-ai/MeloTTS-English",
    "EN_V2": "myshell-ai/MeloTTS-English-v2",
    "EN_NEWEST": "myshell-ai/MeloTTS-English-v3",
    "FR": "myshell-ai/MeloTTS-French",
    "JP": "myshell-ai/MeloTTS-Japanese",
    "ES": "myshell-ai/MeloTTS-Spanish",
    "ZH": "myshell-ai/MeloTTS-Chinese",
    "KR": "myshell-ai/MeloTTS-Korean",
}


def _torch_load(path, device):
    try:
        return torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=device)


def load_or_download_config(locale, use_hf=True, config_path=None):
    if config_path is None:
        language = locale.split("-")[0].upper()
        if use_hf:
            config_path = hf_hub_download(
                repo_id=LANG_TO_HF_REPO_ID[language],
                filename="config.json",
            )
        else:
            config_path = cached_path(DOWNLOAD_CONFIG_URLS[language])
    return utils.get_hparams_from_file(config_path)


def load_or_download_model(locale, device, use_hf=True, ckpt_path=None):
    if ckpt_path is None:
        language = locale.split("-")[0].upper()
        if use_hf:
            ckpt_path = hf_hub_download(
                repo_id=LANG_TO_HF_REPO_ID[language],
                filename="checkpoint.pth",
            )
        else:
            ckpt_path = cached_path(DOWNLOAD_CKPT_URLS[language])
    return _torch_load(ckpt_path, device)
''',
    encoding="utf-8",
)

print(src)
PY

MELOTTS_SRC="$(find "$TMP_DIR" -maxdepth 1 -type d -name "melotts-${MELOTTS_VERSION}" -print -quit)"
"$PY" -m pip install --no-deps "$MELOTTS_SRC"

"$PY" - <<'PY'
import importlib.util

assert importlib.util.find_spec("mecab") is not None, "python-mecab-ko is missing"
assert importlib.util.find_spec("MeCab") is None, "mecab-python3 must not be installed"

from melo.text.cleaner import clean_text

norm_text, phones, tones, word2ph = clean_text("안녕하세요. 사기 링크를 조심하세요.", "KR")
assert phones, "KR phoneme conversion returned no phones"
assert len(tones) == len(phones), "tone length mismatch"
assert word2ph, "word2ph is empty"
print("MeloTTS KR env ready")
print(f"  norm: {norm_text}")
print(f"  phones: {''.join(phones[:20])}")
PY
