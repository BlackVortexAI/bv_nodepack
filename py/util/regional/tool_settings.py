"""Execution filtering for persisted optional tool switches; drafts stay intact."""
import copy


def tool_enabled(document, tool, region_id=None):
    owner = document if region_id is None else next((r for r in document["regions"] if r["id"] == region_id), {})
    return owner.get("tool_settings", {}).get(tool, True)


def filter_tool_config(document, payload, tool):
    result = copy.deepcopy(payload)
    if tool == "lora":
        def allowed(target):
            return tool_enabled(document, tool, target.get("region_id") if target.get("scope") == "region" else None)
        entries = []
        for entry in result.get("entries", []):
            entry["targets"] = [target for target in entry.get("targets", []) if allowed(target)]
            if entry["targets"]:
                entries.append(entry)
        result["entries"] = entries
        if "steps" in result:
            result["steps"] = [step for step in result["steps"] if allowed(step["target"])]
    elif tool == "lut":
        jobs = []
        for job in result.get("jobs", []):
            if job.get("scope") == "global":
                if tool_enabled(document, tool):
                    jobs.append(job)
            else:
                job["region_ids"] = [rid for rid in job["region_ids"] if tool_enabled(document, tool, rid)]
                if job["region_ids"]:
                    jobs.append(job)
        result["jobs"] = jobs
    return result


def filter_legacy_bindings(document, bindings):
    result = copy.deepcopy(bindings)
    if not tool_enabled(document, "lora"):
        result["global_stack_id"] = None
    result["regions"] = {rid: value for rid, value in result.get("regions", {}).items() if tool_enabled(document, "lora", rid)}
    return result
