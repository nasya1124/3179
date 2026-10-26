"""Prepare NASA FIRMS fire detections for the Black Summer bin map.

Input (download first, not stored in this repo):
  fire_archive_M-C61_*.csv  FIRMS archive download: MODIS Collection 6.1,
                            Australia, 1 September 2019 to 29 February 2020.
Keeps vegetation fires (type 0) with detection confidence of 30 or more,
and writes one point per detection, grouped by month, for hexbin.mjs:
  node hexbin.mjs states_light.topojson fire_points.json ../data/fire_detections_hexbin.geojson 6
Run from this folder.
"""
import glob
import json
import pandas as pd

source = glob.glob("fire_archive_M-C61_*.csv")[0]
fires = pd.read_csv(source)
kept = fires[(fires["type"] == 0) & (fires["confidence"] >= 30)]
points = [{"lon": round(r.longitude, 4), "lat": round(r.latitude, 4), "group": r.acq_date[:7]}
          for r in kept.itertuples()]
json.dump(points, open("fire_points.json", "w"))
print(f"kept {len(kept)} of {len(fires)} detections")
