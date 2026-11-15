# api/hazard/ — fire model (planned)

Today `GET /hazards` serves what is in the database: road closures, shelters and zone outlines (seeded from
`data/scenario.json`). The fire model below is the design, not built yet:

- `firms.py`: NASA FIRMS VIIRS NRT for the bbox, or replay `data/scenario.json`
- `spread.py`: elliptical (Huygens) spread → `fireArrivalAt` per home → `deadlineAt = arrival − 10 min`
- Front within 100 m of a road → `POST /roads/closures` with `source: hazard`
- Console label: "scenario input, not a forecast"
