const SOURCE_PARTS = [
  "MVptZ1BI",
  "TzJibFk1",
  "YVBGdjk3",
  "UmFfOGtP",
  "Mk1leGVP",
  "X1NTY0dH",
  "amJTMTM0",
  "WlE=",
];

type Cell = { v?: string | number | null } | null;

function decodeSource() {
  return atob(SOURCE_PARTS.join(""));
}

function cell(row: { c?: Cell[] }, index: number) {
  return row.c?.[index]?.v ?? "";
}

export async function GET() {
  const source = decodeSource();
  const endpoint = `https://docs.google.com/spreadsheets/d/${source}/gviz/tq?tqx=out:json&gid=0`;

  try {
    const response = await fetch(endpoint, { next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);

    const body = await response.text();
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    const payload = JSON.parse(body.slice(start, end + 1));

    const places = (payload.table.rows as { c?: Cell[] }[])
      .map((row, index) => {
        const coordinates = String(cell(row, 3))
          .split(",")
          .map((value) => Number(value.trim()));

        return {
          id: index + 1,
          name: String(cell(row, 0)),
          clipUrl: String(cell(row, 1)),
          category: String(cell(row, 2)),
          latitude: coordinates[0],
          longitude: coordinates[1],
          twitchTitle: String(cell(row, 4)),
          country: String(cell(row, 5)),
        };
      })
      .filter(
        (place) =>
          place.name &&
          Number.isFinite(place.latitude) &&
          Number.isFinite(place.longitude),
      );

    return Response.json(places, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  } catch {
    return Response.json({ error: "Map data is temporarily unavailable." }, { status: 502 });
  }
}
