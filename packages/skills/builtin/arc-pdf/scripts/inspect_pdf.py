"""Read-only PDF metadata and page text inspection; no OCR or decryption guesses."""
import argparse
import json
from pathlib import Path
from pypdf import PdfReader


def inspect(filename):
    reader = PdfReader(filename)
    result = {"path": str(Path(filename).resolve()), "encrypted": reader.is_encrypted}
    if reader.is_encrypted:
        return {**result, "locked": True, "guidance": "Use a user-authorized password with an appropriate reader; this helper does not decrypt."}
    pages = []
    for index, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        pages.append({"number": index, "width_pt": float(page.mediabox.width), "height_pt": float(page.mediabox.height), "rotation": page.rotation, "text_sample": text[:2000], "has_extractable_text": bool(text.strip())})
    return {**result, "locked": False, "page_count": len(pages), "pages": pages, "ocr_performed": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    print(json.dumps(inspect(parser.parse_args().file), ensure_ascii=False, indent=2))
