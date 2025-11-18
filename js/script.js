console.log("hehe");

async function fetchData() {
    const naMap = await fetch("dataset/usa-map.json").then(r => r.json());
    const raw = await d3.csv("dataset/ufo_sightings.csv");

    const ufoClean = raw.map(d => ({
        city: d["Location.City"],
        state: d["Location.State"],
        country: d["Location.Country"],
        shape: d["Data.Shape"],
        duration: d["Data.Encounter duration"],
        lat: +d["Location.Coordinates.Latitude "],
        lon: +d["Location.Coordinates.Longitude "],
        year: +d["Dates.Sighted.Year"]
    }));

    return { naMap, ufoClean };
}

fetchData().then(async ({ naMap, ufoClean }) => {
    const lineTime = vl
        .markLine()
        .data(ufoClean)  
        .encode(
        vl.x().fieldQ("year").title("Year"),
        vl.y().aggregate("count").title("Total Sightings"),
        vl.tooltip([
            vl.fieldQ("year"),
            vl.aggregate("count")
        ])
        )
        .width(850)
        .height(480)
        .toSpec();

    const heatTime = vl
        .markRect({ stroke: "white", strokeWidth: 1 })
        .data(ufoClean)    
        .encode(
        vl.x().bin({ step: 10 }).fieldQ("year").title("Decade"),
        vl.y().fieldN("shape").title("UFO Shape"),
        vl.color().aggregate("count").title("Number of Reports"),
        vl.tooltip([
            vl.fieldQ("year"),
            vl.fieldN("shape"),
            vl.aggregate("count")
        ])
        )
        .width(850)
        .height(480)
        .toSpec();



    function mapVis(naMap, ufoClean) {
        return vl.layer(

        // Base map
        vl.markGeoshape({ fill: "#f0f0f0", stroke: "#999" })
            .data({ values: naMap.features }),

        // UFO Points
        vl.markCircle({ size: 20, opacity: 0.1 })
            .data(ufoClean)
            .encode(
            vl.longitude().fieldQ("lon"),
            vl.latitude().fieldQ("lat")
            )

        )
        .project("albersUsa")
        .width(850)
        .height(700)
        .toSpec();
    }

    const shapeDis = vl
        .markRect({ stroke: "white", strokeWidth: 1 })
        .data(ufoClean)   
        .encode(
            vl.y().fieldO("shape").title("UFO Shapes"),
            vl.x().bin({step:60}).fieldO("duration").title("Duration (Sec)"),
            vl.color().aggregate("count"),
            vl.tooltip([
                vl.y().fieldO("shape"),
                vl.x().aggregate("count")
            ])
        )
        .width(5000)
        .height(480)
        .toSpec();

    const sightDur = vl
        .markRect()
        .data(ufoClean)
        .encode(
            vl.y().aggregate("count"),
            vl.x().bin({step:20}).fieldO("duration").title("Duration (Sec)"),
            vl.color().aggregate("count"),
            vl.tooltip([
                vl.x().bin({step:7200}).fieldO("duration").aggregate("count")
            ]),
            vl.text().bin({step:7200}).fieldO("duration").aggregate("count"),
            )
        .width(5000)
        .height(480)
        .toSpec();

    render("#view", lineTime);
    render("#view2", heatTime);
    render("#view3", mapVis(naMap, ufoClean)); 
    render("#view4", shapeDis);
    render("#view5", sightDur);
});

async function render(viewID, spec) {
  const result = await vegaEmbed(viewID, spec);
  result.view.run();
}
