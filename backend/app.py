import os
import json
import pandas as pd
import geopandas as gpd
import re
from datetime import datetime
from flask import Flask, jsonify, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── TEST MODE ─────────────────────────────────────────────────────────────────
TEST_MODE = False
TEST_YEAR_MIN = 2020
TEST_YEAR_MAX = 2022
# ──────────────────────────────────────────────────────────────────────────────

DATA_DIR = r"C:\Users\trion\OneDrive\Desktop\Thesis\Dashboard_0\data"

# Pre-load parquet datasets for Level 2
_neighbors     = pd.read_parquet(os.path.join(DATA_DIR, "neighbors_1500m.parquet"))
_crash_monthly = pd.read_parquet(os.path.join(DATA_DIR, "crash_monthly_panel.parquet"))
_event_log     = pd.read_parquet(os.path.join(DATA_DIR, "crashes_event_log.parquet"))

segments_dedup  = gpd.read_file(os.path.join(DATA_DIR, "segments_master_dedup.geojson"))
if segments_dedup.crs and segments_dedup.crs.to_epsg() != 4326:
    segments_dedup = segments_dedup.to_crs(epsg=4326)
segments_master = gpd.read_file(os.path.join(DATA_DIR, "segments_master.geojson"))

import numpy as np

print(f"  [OK] dedup: {len(segments_dedup)} rows | master: {len(segments_master)} rows")


# Lookup dictionary: RCSTA → road_name
road_names = (
    segments_master.drop_duplicates("RCSTA").set_index("RCSTA")["road_name"].to_dict()
    if "road_name" in segments_master.columns else {}
)

# ── COLUMN LISTS ──────────────────────────────────────────────────────────────
MAP_COLS = [
    "RCSTA", "road_name", "geometry",
    "treated", "intervention",
    "speed_limit", "total_lanes", "length_m",
    "traffic_index_pre_1y", "traffic_index_pre_2y", "traffic_index_pre_3y",
    "severity_index_pre_1y", "severity_index_pre_2y", "severity_index_pre_3y",
    "MHI", "density",
    "crashes_pre_norm_aadt_1y", "crashes_pre_norm_aadt_2y", "crashes_pre_norm_aadt_3y",
    "reduction_norm_1y_pct", "reduction_norm_2y_pct", "reduction_norm_3y_pct",
    "reduction_norm_aadt_1y_pct", "reduction_norm_aadt_2y_pct", "reduction_norm_aadt_3y_pct",
]

MASTER_COLS = [
    "RCSTA", "road_name", "treated", "intervention", "install_year", "install_month",
    "traffic_index_pre_1y", "traffic_index_pre_2y", "traffic_index_pre_3y",
    "severity_index_pre_1y", "severity_index_pre_2y", "severity_index_pre_3y",
    "crashes_pre_norm_1y", "crashes_pre_norm_2y", "crashes_pre_norm_3y",
    "crashes_pre_norm_aadt_1y", "crashes_pre_norm_aadt_2y", "crashes_pre_norm_aadt_3y",
    "crashes_post_norm_aadt_1y", "crashes_post_norm_aadt_2y", "crashes_post_norm_aadt_3y",
    "reduction_norm_1y_pct", "reduction_norm_2y_pct", "reduction_norm_3y_pct",
    "reduction_norm_aadt_1y_pct", "reduction_norm_aadt_2y_pct", "reduction_norm_aadt_3y_pct",
    "MHI", "density", "length_m", "speed_limit", "total_lanes",
]

LEVEL1_COLS = [
    "RCSTA", "road_name", "intervention", "install_year", "install_month",
    "crashes_pre_1y", "crashes_pre_2y", "crashes_pre_3y",
    "traffic_variation_1y", "traffic_variation_2y", "traffic_variation_3y",
    "crashes_post_norm_aadt_1y", "crashes_post_norm_aadt_2y", "crashes_post_norm_aadt_3y",
    "reduction_norm_1y_pct", "reduction_norm_2y_pct", "reduction_norm_3y_pct",
    "reduction_norm_aadt_1y_pct", "reduction_norm_aadt_2y_pct", "reduction_norm_aadt_3y_pct",
]


@app.route("/api/segments")
def get_segments():
    cols = [c for c in MAP_COLS if c in segments_dedup.columns]
    resp = jsonify(json.loads(segments_dedup[cols].to_json()))
    resp.headers["Content-Type"] = "application/geo+json"
    return resp


@app.route("/api/master")
def get_master():
    df = segments_master.drop(columns=["geometry"], errors="ignore")

    year_min = request.args.get("year_min", type=int)
    year_max = request.args.get("year_max", type=int)

    if TEST_MODE:
        year_min = max(TEST_YEAR_MIN, year_min) if year_min is not None else TEST_YEAR_MIN
        year_max = min(TEST_YEAR_MAX, year_max) if year_max is not None else TEST_YEAR_MAX

    treated   = df[df["treated"] == 1]
    untreated = df[df["treated"] == 0].copy()
    untreated["reclassified_as_untreated"] = False

    if year_min is not None and year_max is not None:
        in_window = treated[treated["install_year"].between(year_min, year_max)].copy()
        in_window["reclassified_as_untreated"] = False
        untreated_in_window = untreated[untreated["install_year"].between(year_min, year_max)].copy()
        result = pd.concat([in_window, untreated_in_window], ignore_index=True)
        n_reclassified = 0
    else:
        all_treated = treated.copy()
        all_treated["reclassified_as_untreated"] = False
        result = pd.concat([all_treated, untreated], ignore_index=True)
        n_reclassified = 0

    if road_names:
        result["road_name"] = result["RCSTA"].map(road_names).fillna("")

    cols = [c for c in MASTER_COLS + ["reclassified_as_untreated"] if c in result.columns]
    json_data = result[cols].to_json(orient="records")
    return Response(f'{{"data": {json_data}, "n_reclassified": {n_reclassified}}}', mimetype="application/json")


@app.route("/api/segments/meta")
def get_meta():
    df = segments_master
    numeric_cols = [
        "MHI", "density", "length_m", "speed_limit", "total_lanes", "SU_share_pre_1y",
        "AADT_pre_1y", "AADT_pre_2y", "AADT_pre_3y",
        "traffic_index_pre_1y", "traffic_index_pre_2y", "traffic_index_pre_3y",
        "severity_index_pre_1y", "severity_index_pre_2y", "severity_index_pre_3y",
        "crashes_pre_1y", "crashes_pre_2y", "crashes_pre_3y",
        "crashes_pre_norm_1y", "crashes_pre_norm_2y", "crashes_pre_norm_3y",
        "crashes_pre_norm_aadt_1y", "crashes_pre_norm_aadt_2y", "crashes_pre_norm_aadt_3y",
        "reduction_norm_1y", "reduction_norm_2y", "reduction_norm_3y",
        "reduction_norm_1y_pct", "reduction_norm_2y_pct", "reduction_norm_3y_pct",
        "reduction_1y", "reduction_2y", "reduction_3y",
        "reduction_norm_aadt_1y", "reduction_norm_aadt_2y", "reduction_norm_aadt_3y",
        "reduction_norm_aadt_1y_pct", "reduction_norm_aadt_2y_pct", "reduction_norm_aadt_3y_pct",
        "install_year",
    ]
    meta = {
        col: {"min": round(float(s.min()), 2), "max": round(float(s.max()), 2)}
        for col in numeric_cols
        if col in df.columns and len(s := df[col].dropna())
    }
    if "intervention" in df.columns:
        types = df["intervention"].dropna().astype(str).str.split("|").explode().str.strip().unique().tolist()
        meta["intervention_types"] = sorted(t for t in types if t and t != "nan")

    if TEST_MODE and "install_year" in meta:
        meta["install_year"] = {"min": float(TEST_YEAR_MIN), "max": float(TEST_YEAR_MAX)}

    return jsonify(meta)


@app.route("/api/level1", methods=["GET", "POST"])
def get_level1():
    if request.method == "POST":
        pairs_param = request.json.get("pairs", "") if request.json else ""
    else:
        pairs_param = request.args.get("pairs", "")
    if not pairs_param.strip():
        return jsonify([]), 400

    df = segments_master.drop(columns=["geometry"], errors="ignore")
    df = df[df["treated"] == 1]

    triplet_set = set()
    for token in pairs_param.split(","):
        parts = token.strip().split("|")
        if len(parts) >= 2:
            rcsta = parts[0].strip()
            year  = parts[1].strip()
            intervention = parts[2].strip() if len(parts) >= 3 else None
            triplet_set.add((rcsta, year, intervention))

    if not triplet_set:
        return jsonify([]), 400

    if TEST_MODE:
        triplet_set = {(r, y, i) for r, y, i in triplet_set
                       if TEST_YEAR_MIN <= int(y) <= TEST_YEAR_MAX}
    if not triplet_set:
        return jsonify([]), 400

    has_intervention = any(i is not None for _, _, i in triplet_set)
    if has_intervention:
        df["_key"] = list(zip(
            df["RCSTA"].astype(str),
            df["install_year"].astype(str).str.split(".").str[0],
            df["intervention"].astype(str)
        ))
        df = df[df["_key"].isin(triplet_set)].drop(columns=["_key"])
    else:
        pair_set = {(r, y) for r, y, _ in triplet_set}
        df["_key"] = list(zip(
            df["RCSTA"].astype(str),
            df["install_year"].astype(str).str.split(".").str[0]
        ))
        df = df[df["_key"].isin(pair_set)].drop(columns=["_key"])

    cols = [c for c in LEVEL1_COLS if c in df.columns]
    df = df[cols].copy()
    if road_names:
        df["road_name"] = df["RCSTA"].map(road_names).fillna("")

    return jsonify(json.loads(df.to_json(orient="records")))


@app.route("/api/level2/timeseries")
def get_l2_timeseries():
    rcsta = request.args.get("rcsta")
    if not rcsta:
        return jsonify({"error": "Missing rcsta"}), 400

    df_target = _crash_monthly[_crash_monthly["RCSTA"].astype(str) == str(rcsta)].copy()
    if df_target.empty:
        return jsonify({"ts": [], "risk_rate": []})

    df_target.sort_values(by=["year", "month"], inplace=True)
    
    # Trova tutti gli interventi per questo segmento
    master_rows = segments_master[segments_master["RCSTA"].astype(str) == str(rcsta)]
    interventions = []
    for _, row in master_rows.iterrows():
        if pd.notna(row.get("install_year")):
            interventions.append({
                "year": int(row["install_year"]),
                "month": int(row["install_month"]) if pd.notna(row.get("install_month")) else 6,
                "intervention": str(row["intervention"]) if pd.notna(row.get("intervention")) else "Unknown",
            })

    out = {
        "ts":        (df_target["year"].astype(str) + "-" + df_target["month"].astype(str).str.zfill(2) + "-01").tolist(),
        "risk_rate": df_target["risk_rate"].fillna(0).tolist(),
        "aadt":      df_target["AADT"].fillna(0).tolist() if "AADT" in df_target.columns else [],
        "n_crashes": df_target["n_crashes"].fillna(0).tolist() if "n_crashes" in df_target.columns else [],
        "interventions": interventions,
    }

    return jsonify(out)

@app.route("/api/level2")
def get_level2():
    """
    API Level 2 — Spillover Analysis.
    Given a target (RCSTA, install_year, install_month), computes:
      - Cohort A: segments within radius (spatial_neighbors) with crash_delta_pct
      - Cohort B: distant segments with negative AADT correlation with the target
    """
    rcsta_raw     = request.args.get("rcsta", type=int)
    install_year  = request.args.get("install_year", type=int)
    install_month = request.args.get("install_month", type=int, default=6)
    intervention  = request.args.get("intervention", type=str)
    radius_m      = request.args.get("radius_m", type=float, default=1500.0)
    time_window   = request.args.get("time_window", type=int, default=1)

    crash_reduction_min = request.args.get("crash_reduction_min", type=float, default=-100.0)
    crash_reduction_max = request.args.get("crash_reduction_max", type=float, default=100.0)
    b_crash_reduction_min = request.args.get("b_crash_reduction_min",  type=float, default=-100.0)
    b_crash_reduction_max = request.args.get("b_crash_reduction_max",  type=float, default=100.0)
    aadt_threshold  = request.args.get("aadt_threshold",  type=float, default=5000.0)
    corr_threshold  = request.args.get("corr_threshold",  type=float, default=-0.5)

    if rcsta_raw is None or install_year is None:
        return jsonify({"error": "Missing rcsta or install_year"}), 400

    # ── 1. TARGET INFO ──────────────────────────────────────────────────────────
    cond = (segments_master["RCSTA"] == rcsta_raw) & (segments_master["install_year"] == install_year)
    if intervention and intervention != "null" and intervention != "None":
        cond = cond & (segments_master["intervention"] == intervention)
    
    # Try to filter by install_month if it was explicitly requested
    req_month = request.args.get("install_month")
    if req_month and req_month not in ["null", "undefined", "None", ""]:
        cond = cond & (segments_master["install_month"] == int(req_month))
        
        
    target_row = segments_master[cond]
    if target_row.empty:
        target_row = segments_dedup[segments_dedup["RCSTA"] == rcsta_raw]

    if target_row.empty:
        return jsonify({"error": f"RCSTA {rcsta_raw} not found"}), 404

    target_geom = target_row.iloc[0]
    target_info = {
        "RCSTA":         int(rcsta_raw),
        "road_name":     str(target_geom.get("road_name", "") or ""),
        "intervention":  str(target_geom.get("intervention", "") or ""),
        "install_year":  install_year,
        "install_month": install_month,
    }
    target_info["reduction_norm_aadt"] = None

    install_ts = pd.Timestamp(year=install_year, month=install_month, day=1)
    n_months   = time_window * 12

    # Helper: compute risk_rate delta % from monthly panel
    # risk_rate = crash_norm / AADT * 1000  (pre-computed in crash_monthly_panel)
    def get_deltas(rcsta_list):
        if not rcsta_list: return {}
        df = _crash_monthly[_crash_monthly["RCSTA"].isin(rcsta_list)].copy()
        df["ts"] = pd.to_datetime(df["ts"])

        pre_df  = df[df["ts"] <  install_ts].sort_values("ts").groupby("RCSTA").tail(n_months)
        post_df = df[df["ts"] >= install_ts].sort_values("ts").groupby("RCSTA").head(n_months)

        # Ensure 'ts' is formatted nicely, e.g., "2016-08-01"
        df["ts_str"] = df["ts"].dt.strftime("%Y-%m-%d")
        
        # Use mean risk_rate over the window (risk_rate is already per 1000 vehicles)
        pre_agg  = pre_df.groupby("RCSTA")["risk_rate"].mean()
        post_agg = post_df.groupby("RCSTA")["risk_rate"].mean()

        fatal_pre_agg = pre_df.groupby("RCSTA")["n_fatal_crashes"].sum()
        fatal_post_agg = post_df.groupby("RCSTA")["n_fatal_crashes"].sum()
        crashes_pre_agg = pre_df.groupby("RCSTA")["n_crashes"].sum()
        crashes_post_agg = post_df.groupby("RCSTA")["n_crashes"].sum()

        ts_groups = df.sort_values("ts").groupby("RCSTA")

        res = {}
        for r in rcsta_list:
            rr_pre  = pre_agg.loc[r]  if r in pre_agg.index  else np.nan
            rr_post = post_agg.loc[r] if r in post_agg.index else np.nan

            if pd.isna(rr_pre) or pd.isna(rr_post):
                continue

            crp = 0.0
            if rr_pre > 0:
                crp = float((rr_pre - rr_post) / rr_pre * 100)

            ts_array = []
            rr_array = []
            aadt_array = []
            ncrashes_array = []
            if r in ts_groups.groups:
                g = ts_groups.get_group(r)
                ts_array = g["ts_str"].tolist()
                rr_array = g["risk_rate"].fillna(0).tolist()
                if "AADT" in g.columns:
                    aadt_array = g["AADT"].fillna(0).tolist()
                if "n_crashes" in g.columns:
                    ncrashes_array = g["n_crashes"].fillna(0).tolist()

            res[r] = {
                "reduction_norm_aadt": crp,
                "risk_rate_pre":  float(rr_pre),
                "risk_rate_post": float(rr_post),
                "fatal_pre": float(fatal_pre_agg.get(r, 0)),
                "fatal_post": float(fatal_post_agg.get(r, 0)),
                "crashes_pre": float(crashes_pre_agg.get(r, 0)),
                "crashes_post": float(crashes_post_agg.get(r, 0)),
                "ts_array": ts_array,
                "rr_array": rr_array,
                "aadt_array": aadt_array,
                "ncrashes_array": ncrashes_array
            }
        return res

    # ── 2. COHORT A ─────────────────────────────────────────────────────────────
    neighbors = _neighbors[
        (_neighbors["RCSTA"] == rcsta_raw) &
        (_neighbors["distance_m"] <= radius_m)
    ]
    neigh_rcstas = neighbors["RCSTA_neighbor"].tolist()

    cohort_a_records = []
    if neigh_rcstas:
        deltas = get_deltas(neigh_rcstas)
        for _, row in neighbors.iterrows():
            nb_rcsta = int(row["RCSTA_neighbor"])
            if nb_rcsta not in deltas:
                continue
            d = deltas[nb_rcsta]
            r_name = road_names.get(nb_rcsta, "")
            cohort_a_records.append({
                "RCSTA":               nb_rcsta,
                "road_name":           str(r_name),
                "distance_m":          float(row["distance_m"]),
                "reduction_norm_aadt": d["reduction_norm_aadt"],
                "risk_rate_pre":       d["risk_rate_pre"],
                "risk_rate_post":      d["risk_rate_post"],
                "fatal_pre":           d["fatal_pre"],
                "fatal_post":          d["fatal_post"],
                "crashes_pre":         d["crashes_pre"],
                "crashes_post":        d["crashes_post"],
                "ts_array":            d["ts_array"],
                "rr_array":            d["rr_array"],
                "aadt_array":          d["aadt_array"],
                "ncrashes_array":      d["ncrashes_array"]
            })

    # ── 3. COHORT B (REMOVED) ─────────────────────────────────────────────────────────────

    # ── Helper: build GeoJSON features ─────────────────────────────────────────
    def build_features(records, meta_keys):
        rcstas = [r["RCSTA"] for r in records]
        geo_df = segments_dedup[segments_dedup["RCSTA"].isin(rcstas)][["RCSTA", "geometry"]]
        geo_df = geo_df.dissolve(by="RCSTA").reset_index()
        record_map = {r["RCSTA"]: r for r in records}
        features = []
        import shapely.geometry as shp
        for _, row in geo_df.iterrows():
            rc = int(row["RCSTA"])
            meta = record_map.get(rc, {})
            geom_dict = json.loads(row["geometry"].to_json()) if hasattr(row["geometry"], "to_json") else shp.mapping(row["geometry"])
            features.append({
                "type": "Feature",
                "geometry": geom_dict,
                "properties": {k: meta.get(k) for k in ["RCSTA"] + meta_keys}
            })
        return features

    cohort_a_features = build_features(cohort_a_records, ["reduction_norm_aadt", "distance_m", "risk_rate_pre", "risk_rate_post", "ts_array", "rr_array", "aadt_array", "ncrashes_array", "fatal_pre", "fatal_post", "crashes_pre", "crashes_post", "road_name"])
    # ── 4. TARGET GEOJSON ───────────────────────────────────────────────────────
    # Use static pre/post risk rate from master for L2 info box and map tooltip
    master_row = segments_master[cond]
    if not master_row.empty:
        # Sort values only if multiple matches remain (e.g., duplicate identical interventions)
        # We don't want to accidentally pick a different month just because of sorting
        ty = time_window
        sort_col = f"crashes_post_norm_aadt_{ty}y"
        if sort_col in master_row.columns:
            master_row = master_row.sort_values(by=sort_col, na_position="last")
        mr = master_row.iloc[0]
        
        def safe_val(v):
            return float(v) if pd.notna(v) else None
            
        target_info["risk_rate_pre"] = safe_val(mr.get(f"crashes_pre_norm_aadt_{ty}y"))
        target_info["risk_rate_post"] = safe_val(mr.get(f"crashes_post_norm_aadt_{ty}y"))
        target_info["reduction_norm_aadt"] = safe_val(mr.get(f"reduction_norm_aadt_{ty}y_pct"))
        
        # Keep old names for compatibility just in case
        target_info["crashes_pre_norm_aadt"] = target_info["risk_rate_pre"]
        target_info["crashes_post_norm_aadt"] = target_info["risk_rate_post"]
        target_info["reduction_norm_aadt_static"] = safe_val(mr.get(f"reduction_norm_aadt_{ty}y"))
        target_info["reduction_norm_aadt_static_pct"] = safe_val(mr.get(f"reduction_norm_aadt_{ty}y_pct"))
        
        target_info["has_1y"] = True
        target_info["has_2y"] = (install_year - 2 >= 2015) and (install_year + 2 <= 2022)
        target_info["has_3y"] = (install_year - 3 >= 2015) and (install_year + 3 <= 2022)

    import shapely.geometry as shp
    b = target_geom["geometry"].bounds
    target_info["bbox"] = [b[1], b[0], b[3], b[2]]
    target_geojson = {
        "type": "Feature",
        "geometry": shp.mapping(target_geom["geometry"]),
        "properties": target_info,
    }

    return jsonify({
        "target":   target_geojson,
        "cohort_a": {"type": "FeatureCollection", "features": cohort_a_features},
        "meta": {
            "radius_m":      radius_m,
            "time_window":   time_window,
            "n_cohort_a":    len(cohort_a_features)
        }
    })

@app.route("/api/level2/events")
def get_l2_events():
    rcsta = request.args.get("rcsta", type=int)
    install_year = request.args.get("install_year", type=int)
    install_month = request.args.get("install_month", type=int, default=6)
    time_window = request.args.get("time_window", type=int, default=1)
    
    if rcsta is None or install_year is None:
        return jsonify({"error": "Missing rcsta or install_year"}), 400
        
    install_ts = pd.Timestamp(year=install_year, month=install_month, day=1)
    
    df = _event_log[_event_log["RCSTA"] == rcsta].copy()
    if df.empty:
        return jsonify({"Pre": {"crash_type": {}, "victim_type": {}}, "Post": {"crash_type": {}, "victim_type": {}}})
    
    pre_start = install_ts - pd.DateOffset(years=time_window)
    post_end = install_ts + pd.DateOffset(years=time_window)
    
    df["ts"] = pd.to_datetime(df["ts"])
    pre_df = df[(df["ts"] >= pre_start) & (df["ts"] < install_ts)]
    post_df = df[(df["ts"] >= install_ts) & (df["ts"] < post_end)]
    
    # Calculate mortality from _crash_monthly
    df_monthly = _crash_monthly[_crash_monthly["RCSTA"] == rcsta].copy()
    df_monthly["ts"] = pd.to_datetime(df_monthly["ts"])
    pre_monthly = df_monthly[(df_monthly["ts"] >= pre_start) & (df_monthly["ts"] < install_ts)]
    post_monthly = df_monthly[(df_monthly["ts"] >= install_ts) & (df_monthly["ts"] < post_end)]
    
    fatal_pre = float(pre_monthly["n_fatal_crashes"].sum())
    crashes_pre = float(pre_monthly["n_crashes"].sum())
    fatal_post = float(post_monthly["n_fatal_crashes"].sum())
    crashes_post = float(post_monthly["n_crashes"].sum())
    
    def agg_counts(d):
        d_copy = d.copy()
        d_copy["ts_str"] = d_copy["ts"].dt.strftime("%Y-%m-%d")
        scatter_cols = ["hour", "day_of_week", "crash_type", "victim_type", "ts_str"]
        if "hour" in d_copy.columns and "day_of_week" in d_copy.columns:
            scatter_data = d_copy[scatter_cols].dropna(subset=["hour", "day_of_week"]).to_dict(orient="records")
        else:
            scatter_data = []
        return {
            "crash_type": d["crash_type"].value_counts().to_dict(),
            "victim_type": d["victim_type"].value_counts().to_dict(),
            "scatter": scatter_data
        }
        
    return jsonify({
        "Pre": agg_counts(pre_df),
        "Post": agg_counts(post_df),
        "Mortality": {
            "pre_fatal": fatal_pre, "pre_crashes": crashes_pre,
            "post_fatal": fatal_post, "post_crashes": crashes_post
        }
    })

@app.route("/api/level2/events/group", methods=["POST"])
def get_l2_events_group():
    data = request.json
    rcstas = data.get("rcstas", [])
    if not rcstas:
        return jsonify({"Pre": {}, "Post": {}, "Mortality": {
            "pre_fatal": 0, "pre_crashes": 0, "post_fatal": 0, "post_crashes": 0
        }})
        
    try:
        install_year = int(data.get("install_year"))
        install_month = int(data.get("install_month"))
        time_window = int(data.get("time_window", 1))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid parameters"}), 400

    install_ts = pd.Timestamp(year=install_year, month=install_month, day=1)
    pre_start = install_ts - pd.DateOffset(years=time_window)
    post_end = install_ts + pd.DateOffset(years=time_window)
    
    df = _event_log[_event_log["RCSTA"].isin(rcstas)].copy()
    if df.empty:
        return jsonify({"Pre": {}, "Post": {}, "Mortality": {
            "pre_fatal": 0, "pre_crashes": 0, "post_fatal": 0, "post_crashes": 0
        }})
        
    df["ts"] = pd.to_datetime(df["ts"])
    pre_df = df[(df["ts"] >= pre_start) & (df["ts"] < install_ts)]
    post_df = df[(df["ts"] >= install_ts) & (df["ts"] < post_end)]
    
    df_monthly = _crash_monthly[_crash_monthly["RCSTA"].isin(rcstas)].copy()
    df_monthly["ts"] = pd.to_datetime(df_monthly["ts"])
    pre_monthly = df_monthly[(df_monthly["ts"] >= pre_start) & (df_monthly["ts"] < install_ts)]
    post_monthly = df_monthly[(df_monthly["ts"] >= install_ts) & (df_monthly["ts"] < post_end)]
    
    fatal_pre = float(pre_monthly["n_fatal_crashes"].sum())
    crashes_pre = float(pre_monthly["n_crashes"].sum())
    fatal_post = float(post_monthly["n_fatal_crashes"].sum())
    crashes_post = float(post_monthly["n_crashes"].sum())
    
    def agg_counts(d):
        d_copy = d.copy()
        d_copy["ts_str"] = d_copy["ts"].dt.strftime("%Y-%m-%d")
        scatter_cols = ["hour", "day_of_week", "crash_type", "victim_type", "ts_str"]
        if "hour" in d_copy.columns and "day_of_week" in d_copy.columns:
            scatter_data = d_copy[scatter_cols].dropna(subset=["hour", "day_of_week"]).to_dict(orient="records")
        else:
            scatter_data = []
        return {
            "crash_type": d["crash_type"].value_counts().to_dict(),
            "victim_type": d["victim_type"].value_counts().to_dict(),
            "scatter": scatter_data
        }
        
    return jsonify({
        "Pre": agg_counts(pre_df),
        "Post": agg_counts(post_df),
        "Mortality": {
            "pre_fatal": fatal_pre, "pre_crashes": crashes_pre,
            "post_fatal": fatal_post, "post_crashes": crashes_post
        }
    })

if __name__ == "__main__":
    print("\nServer: http://127.0.0.1:5500/frontend/index.html")
    app.run(debug=True, port=5000)
# Trigger Flask Reload
