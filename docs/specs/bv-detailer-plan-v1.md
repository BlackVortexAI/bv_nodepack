# BV Detailer Plan v1

`BV_DETAILER_PLAN` is the workflow-local execution contract between a
`BV_REGIONAL` document and a sequential detailer loop. It is deliberately
backend-neutral: region selection, ordering, mask composition, prompt context and
detector selection belong to the plan; Impact Pack is currently the first adapter
that consumes a resolved job.

## Default plan

`BV Regional Detailer Plan` creates one job for every enabled region whose `usage`
is `detailer` or `both`. Jobs follow region priority and then document order. A
generation-only region never enters the plan.

With an empty `config_json`, every job uses:

- its single region as primary region and mask;
- Global, Background and that region's positive/negative prompts;
- no detector, so the region mask itself becomes the Impact `SEGS` input.

## Configured plan

The optional JSON configuration can reorder jobs, combine regions and select a
named detector:

```json
{
  "schema": "bv.detailer_plan",
  "version": 1,
  "jobs": [
    {
      "region_ids": ["face-region-id", "eye-region-id"],
      "primary_region_id": "face-region-id",
      "mask_composition": "union",
      "prompt_composition": "context",
      "detector_id": "eyes",
      "conditioning": {
        "global_influence": 1.0,
        "background_influence": 0.35,
        "primary_region_influence": 1.0,
        "context_region_influence": 1.0
      },
      "detector": {
        "roi_padding": 0.15,
        "query": "eyes",
        "labels": ["eye"],
        "threshold": 0.5,
        "dilation": 0,
        "crop_factor": 1.5,
        "drop_size": 10
      }
    }
  ]
}
```

`region_ids` may reference enabled detailer/both regions only.
`primary_region_id` must be part of `region_ids`. Supported mask compositions are
`union`, `intersection`, and ordered `subtract`. Prompt composition `primary`
uses only the primary region; `combined` and `context` additionally compile the
other job regions as independently weighted context. The latter two values are
equivalent in v1 and reserve a future distinction between merged text and separate
conditioning contexts.

## Detector contract

`BV Detector Binding` assigns a stable ID and accepts optional `BBOX_DETECTOR`, `SEGM_DETECTOR`, and
`SAM_MODEL` inputs. BBOX and segmentation values are capability-checked through
their callable `detect` method. Incompatible placeholder objects such as Impact's
`NO_SEGM_DETECTOR` are discarded and never forwarded as connected optional inputs.

`BV Detector Registry` connects directly to `BV Regional Detailer Plan`. The plan owns
and validates the registry for its jobs. The registry contains stable IDs, provider types, model names
and optional SAM models. It calls the installed Impact provider implementations
internally and emits one `BV_DETECTOR_REGISTRY`; ordinary workflows therefore do not
need provider or chained registry nodes. The plan references only the stable ID.
`BV Detector Binding` remains an optional advanced adapter for third-party detector
objects.

The Registry exposes advanced `BV_DETECTOR_BINDING` inputs progressively: one free
slot is visible initially, connecting it reveals the next slot, and at most ten
external bindings can be connected. Internally configured models do not consume
these inputs.

`BV Detailer Loop Detect to SEGS (Impact)` resolves the binding, crops the image to the padded
combined region ROI, executes the detector there, optionally filters labels or
applies SAM/segmentation refinement, rebases crop-local `SEGS` coordinates into the
full image and intersects the result with the exact job mask. Without a detector it
converts the job mask directly to full-image `SEGS`.

## Sequential loop

The public loop carries one accumulated image through every job:

```text
BV Regional Detailer Plan
          |
          v
BV Detector Registry ----> BV Regional Detailer Plan ----> BV Detailer Loop Start
                                                               | flow          | loop state
                                                               |               v
                                                               |      BV Detailer Loop Job Resolver
                                                               |               |
                                                               |      Detect to SEGS --> Impact Detailer (SEGS)
                                                               |                                  |
                                                               +------> BV Detailer Loop End <-----+
                                                                            |
                                                                       final image
```

Only `BV Detailer Loop Start` and `BV Detailer Loop End` are public workflow
boundaries. The three `(internal)` nodes implement ComfyUI dynamic graph expansion
and are not intended to be wired manually.

## Current boundary

Version 1 supplies the backend contracts, workflow nodes and a visual Plan-node
dialog. Embedding the same configuration panel in the full Regional Editor remains
a future convenience. Impact Pack is optional
and imported only when `BV Detailer Loop Detect to SEGS (Impact)` executes.
