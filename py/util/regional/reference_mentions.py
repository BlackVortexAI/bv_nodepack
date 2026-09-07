"""Stored prompt mentions. Model adapters are deliberately a separate feature."""
import uuid


def validate_prompt_references(pair, path, issues):
    if "reference_editor" in pair and not isinstance(pair["reference_editor"], bool):
        issues.append(f"{path}.reference_editor must be boolean")
    if "references" not in pair:
        return
    refs = pair["references"]
    if not isinstance(refs, dict) or set(refs) - {"positive", "negative"}:
        issues.append(f"{path}.references must contain positive/negative lists")
        return
    for polarity, mentions in refs.items():
        if not isinstance(mentions, list) or len(mentions) > 100:
            issues.append(f"{path}.references.{polarity} must contain at most 100 mentions")
            continue
        text = pair.get(f"{polarity}_source", "")
        if not isinstance(text, str):
            continue
        encoded = text.encode("utf-16-le")
        previous = 0
        for mention in mentions:
            try:
                if not isinstance(mention, dict) or set(mention) != {"start", "end", "label", "collector_id", "resource_id"}:
                    raise ValueError()
                start, end = mention["start"], mention["end"]
                if type(start) is not int or type(end) is not int or start < previous or end <= start or end * 2 > len(encoded):
                    raise ValueError()
                if not isinstance(mention["label"], str) or not mention["label"].startswith("@") or encoded[start * 2:end * 2].decode("utf-16-le") != mention["label"]:
                    raise ValueError()
                for key in ("collector_id", "resource_id"):
                    if str(uuid.UUID(mention[key])) != mention[key]:
                        raise ValueError()
                previous = end
            except (ValueError, TypeError, KeyError, AttributeError, UnicodeError):
                issues.append(f"{path}.references.{polarity} contains an invalid or overlapping reference")


def require_reference_application(pair):
    if any(pair.get("references", {}).values()):
        raise ValueError("This prompt contains saved image/media references. This model path does not support their application. Use a compatible edit mode or remove the reference mentions; disabling @ suggestions does not remove them.")
