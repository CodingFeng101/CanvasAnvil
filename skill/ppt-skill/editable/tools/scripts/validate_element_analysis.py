#!/usr/bin/env python3
import argparse
import json
import re
from numbers import Real
from pathlib import Path


VALID = {
    "simple_geometry_svg_ooxml": "svg_to_ooxml",
    "icon_png": "generate_png_asset",
    "complex_png_whole": "generate_png_whole",
}

SHEET_CAPACITY = {
    "icon_png": 9,
    "complex_png_whole": 4,
}


def err(errors, msg):
    errors.append(msg)


def is_number(value):
    return isinstance(value, Real) and not isinstance(value, bool)


def is_positive_int(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def validate_required(errors, context, obj, keys):
    for key in keys:
        if key not in obj:
            err(errors, f"{context}: missing required key: {key}")


def validate_string(errors, context, field, value):
    if not isinstance(value, str):
        err(errors, f"{context}: {field} must be a string")


def validate_positive_int_field(errors, context, field, value):
    if not is_positive_int(value):
        err(errors, f"{context}: {field} must be an integer >= 1")


def validate_box(errors, context, field, box, frac=False):
    if not isinstance(box, list) or len(box) != 4:
        err(errors, f"{context}: {field} must be [x,y,w,h]")
        return
    if not all(is_number(value) for value in box):
        err(errors, f"{context}: {field} values must be numbers")
        return
    if frac and (box[0] < 0 or box[1] < 0):
        err(errors, f"{context}: {field} x/y must be non-negative")
    if box[2] <= 0 or box[3] <= 0:
        err(errors, f"{context}: {field} width/height must be positive")


def component_category(components, component_id):
    base_id = component_id.split(":", 1)[0]
    component = components.get(base_id)
    return component.get("category") if isinstance(component, dict) else None


def validate_asset_sheet_plan(errors, warnings, plan, components):
    png_ids = sorted(
        cid for cid, comp in components.items()
        if isinstance(comp, dict) and comp.get("category") in SHEET_CAPACITY
    )
    if plan is None:
        if png_ids:
            err(errors, f"png_asset_sheet_plan is required for PNG components: {', '.join(png_ids)}")
        return
    if not isinstance(plan, dict):
        err(errors, "png_asset_sheet_plan must be an object")
        return

    sheets = plan.get("sheets")
    if sheets is None:
        # Runs written before the sheets array existed map sheet names to
        # component lists; their packing cannot be checked.
        warnings.append("png_asset_sheet_plan has no sheets array; sheet packing and coverage were not checked")
        return
    if not isinstance(sheets, list):
        err(errors, "png_asset_sheet_plan: sheets must be an array")
        return
    key_color = plan.get("key_color")
    if not isinstance(key_color, str) or re.fullmatch(r"#[0-9A-Fa-f]{6}", key_color) is None:
        err(errors, "png_asset_sheet_plan: key_color must be a #RRGGBB string")

    category_sheets = {category: [] for category in SHEET_CAPACITY}
    placed = {}
    for index, sheet in enumerate(sheets, start=1):
        context = f"png_asset_sheet_plan sheet {index}"
        if not isinstance(sheet, dict):
            err(errors, f"{context}: must be an object")
            continue
        if not isinstance(sheet.get("id"), str) or not sheet.get("id"):
            err(errors, f"{context}: id must be a non-empty string")
        asset_ids = sheet.get("components")
        if not isinstance(asset_ids, list) or not asset_ids:
            err(errors, f"{context}: components must be a non-empty array")
            continue
        if not all(isinstance(asset_id, str) and asset_id for asset_id in asset_ids):
            err(errors, f"{context}: component ids must be non-empty strings")
            continue
        for asset_id in asset_ids:
            base_id = asset_id.split(":", 1)[0]
            if base_id in placed:
                err(errors, f"{context}: component {base_id} is already on {placed[base_id]}")
            else:
                placed[base_id] = context

        categories = {component_category(components, asset_id) for asset_id in asset_ids}
        if None in categories:
            unknown = [asset_id for asset_id in asset_ids if component_category(components, asset_id) is None]
            err(errors, f"{context}: unknown component(s): {', '.join(unknown)}")
            continue
        if len(categories) != 1:
            err(errors, f"{context}: do not mix normal and complex assets")
            continue

        category = categories.pop()
        if category not in SHEET_CAPACITY:
            err(errors, f"{context}: only PNG component categories belong on asset sheets")
            continue
        capacity = SHEET_CAPACITY[category]
        if "max" in sheet and sheet.get("max") != capacity:
            err(errors, f"{context}: {category} max must be {capacity}, got {sheet.get('max')}")
        if "key_color" in sheet and (
            not isinstance(sheet.get("key_color"), str)
            or not isinstance(key_color, str)
            or sheet.get("key_color").lower() != key_color.lower()
        ):
            err(errors, f"{context}: key_color must match the run-level key_color")
        if len(asset_ids) > capacity:
            err(errors, f"{context}: {category} allows at most {capacity} assets, got {len(asset_ids)}")
        category_sheets[category].append((context, len(asset_ids)))

    for category, entries in category_sheets.items():
        capacity = SHEET_CAPACITY[category]
        for context, count in entries[:-1]:
            if count != capacity:
                err(errors, f"{context}: {category} sheets must contain {capacity} assets except for the final remainder sheet, got {count}")

    unplanned = [cid for cid in png_ids if cid not in placed]
    if unplanned:
        err(errors, f"png_asset_sheet_plan: PNG components on no sheet: {', '.join(unplanned)}")


def report(errors):
    for e in errors:
        print(f"ERROR\t{e}")
    raise SystemExit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("element_analysis_json")
    args = ap.parse_args()

    data = json.loads(Path(args.element_analysis_json).read_text(encoding="utf-8-sig"))
    errors = []

    if not isinstance(data, dict):
        report(["top-level JSON must be an object"])

    for key in ("ref_width", "ref_height", "components", "slides"):
        if key not in data:
            err(errors, f"missing top-level key: {key}")

    for field in ("ref_width", "ref_height"):
        if field in data:
            validate_positive_int_field(errors, "top-level", field, data.get(field))

    components = data.get("components", {})
    if not isinstance(components, dict):
        err(errors, "components must be an object")
        components = {}

    for cid, comp in components.items():
        if not isinstance(comp, dict):
            err(errors, f"component {cid}: must be an object")
            continue
        validate_required(errors, f"component {cid}", comp, ("category", "asset_plan", "reuse"))
        cat = comp.get("category")
        plan = comp.get("asset_plan")
        if cat not in VALID:
            err(errors, f"component {cid}: invalid category {cat}")
        elif plan != VALID[cat]:
            err(errors, f"component {cid}: category {cat} expects asset_plan {VALID[cat]}, got {plan}")
        if "reuse" in comp:
            validate_string(errors, f"component {cid}", "reuse", comp.get("reuse"))

    slides = data.get("slides", [])
    if not isinstance(slides, list):
        err(errors, "slides must be an array")
        slides = []

    for slide in slides:
        if not isinstance(slide, dict):
            err(errors, "slide entries must be objects")
            continue
        validate_required(errors, "slide entry", slide, ("slide", "instances"))
        sid = slide.get("slide", "?")
        if "slide" in slide:
            validate_positive_int_field(errors, f"slide {sid}", "slide", sid)
        instances = slide.get("instances", [])
        if not isinstance(instances, list):
            err(errors, f"slide {sid}: instances must be an array")
            continue
        for inst in instances:
            if not isinstance(inst, dict):
                err(errors, f"slide {sid}: instance entries must be objects")
                continue
            validate_required(errors, f"slide {sid} instance {inst.get('id', '?')}", inst, ("component", "id", "bbox_px", "bbox_frac"))
            iid = inst.get("id", "?")
            comp = inst.get("component")
            if "id" in inst:
                validate_string(errors, f"slide {sid} instance {iid}", "id", iid)
            if "component" in inst:
                validate_string(errors, f"slide {sid} instance {iid}", "component", comp)
            if comp not in components:
                err(errors, f"slide {sid} instance {iid}: unknown component {comp}")
            validate_box(errors, f"slide {sid} instance {iid}", "bbox_px", inst.get("bbox_px"))
            validate_box(errors, f"slide {sid} instance {iid}", "bbox_frac", inst.get("bbox_frac"), frac=True)

    warnings = []
    validate_asset_sheet_plan(errors, warnings, data.get("png_asset_sheet_plan"), components)

    for warning in warnings:
        print(f"WARNING\t{warning}")
    if errors:
        report(errors)

    print("element_analysis is valid")


if __name__ == "__main__":
    main()
