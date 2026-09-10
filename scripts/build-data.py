"""Create the de-identified, performance-oriented dataset used by the site."""
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import sys
from urllib.request import Request, urlopen

from openpyxl import load_workbook


SOURCE = Path(sys.argv[1]).resolve()
OUTPUT = Path(sys.argv[2]).resolve()
SPECIES = ("BOVINOS", "BUBALINOS", "EQUINOS", "PORCINOS", "CAPRINOS", "OVINOS")
GRID_SIZE = 0.12


def clean_text(value):
    return " ".join(str(value or "").replace("�", "Ñ").split()).upper() or "SIN INFORMAR"


def as_number(value):
    if value is None or value == "":
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def add_animals(bucket, row, columns):
    for species in SPECIES:
        bucket[species.lower()] += as_number(row[columns[species]])


def public_boundary():
    """Embed the official province feature so the map has no runtime dependency."""
    url = "https://apis.datos.gob.ar/georef/api/provincias.geojson"
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=20) as response:
            collection = json.load(response)
        for feature in collection.get("features", []):
            props = feature.get("properties", {})
            values = " ".join(str(value) for value in props.values()).upper()
            if "CORRIENTES" in values:
                return feature.get("geometry")
    except Exception:
        pass
    return None


def make_row(name, values):
    result = {"nombre": name, "registros": values["registros"]}
    for species in SPECIES:
        result[species.lower()] = values[species.lower()]
    return result


def main():
    workbook = load_workbook(SOURCE, read_only=True, data_only=True)
    sheet = workbook.active
    headers = list(next(sheet.values))
    columns = {name: index for index, name in enumerate(headers)}

    required = {"DEPTO", "MUNI", "OFICINA LOCAL", "LATITUD", "LONGITUD", *SPECIES}
    missing = required.difference(columns)
    if missing:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(sorted(missing))}")

    totals = defaultdict(int)
    departments = defaultdict(lambda: defaultdict(int))
    municipalities = defaultdict(lambda: defaultdict(int))
    grids = defaultdict(
        lambda: {
            "registros": 0,
            **{species.lower(): 0 for species in SPECIES},
            "departamentos": Counter(),
            "municipios": Counter(),
        }
    )
    valid_coordinates = 0
    invalid_coordinates = 0
    records = 0

    for row in sheet.iter_rows(min_row=2, values_only=True):
        records += 1
        department = clean_text(row[columns["DEPTO"]])
        municipality = clean_text(row[columns["MUNI"]])
        office = clean_text(row[columns["OFICINA LOCAL"]])

        totals["registros"] += 1
        departments[department]["registros"] += 1
        municipalities[(department, municipality, office)]["registros"] += 1
        add_animals(totals, row, columns)
        add_animals(departments[department], row, columns)
        add_animals(municipalities[(department, municipality, office)], row, columns)

        try:
            latitude = float(row[columns["LATITUD"]])
            longitude = float(row[columns["LONGITUD"]])
        except (TypeError, ValueError):
            invalid_coordinates += 1
            continue

        if not (-31.7 <= latitude <= -26.7 and -61.2 <= longitude <= -55.5):
            invalid_coordinates += 1
            continue

        valid_coordinates += 1
        grid_lat = round(latitude / GRID_SIZE) * GRID_SIZE
        grid_lon = round(longitude / GRID_SIZE) * GRID_SIZE
        key = (round(grid_lat, 3), round(grid_lon, 3))
        cell = grids[key]
        cell["registros"] += 1
        cell["departamentos"][department] += 1
        cell["municipios"][municipality] += 1
        add_animals(cell, row, columns)

    department_rows = [make_row(name, values) for name, values in departments.items()]
    department_rows.sort(key=lambda item: item["bovinos"], reverse=True)

    municipality_rows = []
    for (department, municipality, office), values in municipalities.items():
        item = make_row(municipality, values)
        item["departamento"] = department
        item["oficina"] = office
        municipality_rows.append(item)
    municipality_rows.sort(key=lambda item: item["bovinos"], reverse=True)

    grid_rows = []
    for (latitude, longitude), values in grids.items():
        item = make_row("", values)
        item["lat"] = latitude
        item["lon"] = longitude
        item["departamento"] = values["departamentos"].most_common(1)[0][0]
        item["municipio"] = values["municipios"].most_common(1)[0][0]
        grid_rows.append(item)
    grid_rows.sort(key=lambda item: item["bovinos"], reverse=True)

    top_five = sum(item["bovinos"] for item in department_rows[:5])
    bovine_total = totals["bovinos"]
    total_animals = sum(totals[species.lower()] for species in SPECIES)

    payload = {
        "metadata": {
            "fuente": SOURCE.name,
            "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "alcance": "Existencias registradas en la base provista; el período no se especifica en el archivo.",
            "privacidad": "Datos agregados territorialmente. Se excluyeron titular, CUIT, documento, teléfonos, correos, establecimiento, RENSPA y coordenadas exactas.",
            "geometria": "Límite provincial: API Georef / Instituto Geográfico Nacional.",
        },
        "totales": {
            "registros": records,
            "registros_georreferenciados": valid_coordinates,
            "registros_sin_coordenada_valida": invalid_coordinates,
            "animales": total_animals,
            **{species.lower(): totals[species.lower()] for species in SPECIES},
            "bovinos_por_registro": round(bovine_total / records, 1) if records else 0,
            "concentracion_top5_bovinos": round(top_five / bovine_total * 100, 1) if bovine_total else 0,
        },
        "departamentos": department_rows,
        "municipios": municipality_rows,
        "grillas": grid_rows,
        "limite_corrientes": public_boundary(),
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"records": records, "grids": len(grid_rows), "departments": len(department_rows), "mapped": valid_coordinates}, ensure_ascii=False))


if __name__ == "__main__":
    main()
